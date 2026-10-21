import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {Store} from '../scripts/model.mjs';

test('compact canvas and proposal handoff in the built browser UI',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flow-lens-ui-'));
  process.env.FLOW_LENS_DATA=dir;
  const {serve}=await import('../scripts/bridge.mjs');
  const {server,info}=await serve();
  let browser;
  t.after(async()=>{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  browser=await chromium.launch({headless:true});
  const store=new Store(path.join(dir,'flows'));
  fs.writeFileSync(path.join(dir,'logic.js'),'function login(allowed) {\n  return allowed;\n}\n');
  const graph={nodes:[
    {id:'start',position:{x:80,y:0},data:{kind:'start',label:'开始登录'}},
    {id:'check',position:{x:80,y:140},data:{kind:'decision',label:'权限通过？',detail:'检查用户是否有访问权限',source:{path:'logic.js',line:1,symbol:'login'}}},
    {id:'success',position:{x:0,y:280},data:{kind:'end',label:'进入首页'}},
    {id:'failure',position:{x:280,y:280},data:{kind:'end',label:'拒绝访问'}}
  ],edges:[{id:'begin',source:'start',target:'check'},{id:'yes',source:'check',target:'success',label:'是'},{id:'no',source:'check',target:'failure',label:'否'}]};
  async function fixture(id,mode='edit'){
    store.create({id,threadId:id,workspace:dir,title:id,graph});
    store.setMode(id,mode);
    const context=await browser.newContext({viewport:{width:480,height:740},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();page.setDefaultTimeout(5000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(info.url+'/?flow='+id+'&surface=codex#token='+info.token);
    await page.locator('.flow-node').first().waitFor();
    return {context,page,errors};
  }
  async function editLabel(page){
    await page.locator('[data-id="check"] .flow-node').click();
    await page.getByLabel('节点名称',{exact:true}).fill('权限与账户均有效？');
  }
  await t.test('labels stay compact while source details remain available',async()=>{
    const {context,page,errors}=await fixture('compact','view');
    assert.equal(await page.locator('.flow-node').count(),4);
    assert.equal(await page.locator('.flow-node p,.flow-node code,.node-meta').count(),0);
    assert.equal(await page.getByText('是',{exact:true}).count(),1);
    assert.equal(await page.getByText('否',{exact:true}).count(),1);
    assert.equal(await page.locator('nav,footer,.react-flow__minimap').count(),0);
    if(process.env.FLOW_LENS_SCREENSHOTS){
      await page.screenshot({path:path.join(process.env.FLOW_LENS_SCREENSHOTS,'flow-lens-view.png')});
      await page.emulateMedia({colorScheme:'dark'});
      await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
      await page.screenshot({path:path.join(process.env.FLOW_LENS_SCREENSHOTS,'flow-lens-dark.png')});
      await page.emulateMedia({colorScheme:'light'});
    }
    await page.locator('[data-id="check"] .flow-node').click();
    assert.equal(await page.getByText('检查用户是否有访问权限',{exact:true}).isVisible(),true);
    assert.match(await page.locator('.read-details code').textContent(),/login.*logic.js:1/);
    await page.getByRole('button',{name:'查看关联代码',exact:true}).click();
    await page.locator('.code-line.current').waitFor();
    assert.match(await page.locator('.code-line.current').textContent(),/function login/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.ok(await page.locator('aside').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight)<2));
    if(process.env.FLOW_LENS_SCREENSHOTS)await page.screenshot({path:path.join(process.env.FLOW_LENS_SCREENSHOTS,'flow-lens-details.png')});
    assert.deepEqual(errors,[]);await context.close();
  });
  await t.test('one action saves, submits and copies; recopy preserves proposal identity',async()=>{
    const {context,page,errors}=await fixture('copy');
    await editLabel(page);
    assert.equal(await page.getByLabel('补充说明',{exact:true}).isVisible(),false);
    await page.locator('summary').click();
    assert.equal(await page.getByLabel('补充说明',{exact:true}).isVisible(),true);
    assert.equal(await page.getByLabel('补充说明',{exact:true}).inputValue(),'检查用户是否有访问权限');
    await page.locator('summary').click();
    await page.getByRole('button',{name:'提交并复制',exact:true}).click();
    await page.getByRole('status').filter({hasText:'指令已复制'}).waitFor();
    const r=store.get('copy');
    assert.equal(r.draft.nodes[1].data.label,'权限与账户均有效？');
    assert.equal(r.baseline.nodes[1].data.label,'权限通过？');
    assert.equal(r.request.status,'pending');
    assert.equal(await page.getByLabel('会话指令').count(),0);
    const text=await page.evaluate(()=>navigator.clipboard.readText());
    assert.ok(text.includes(r.request.id));assert.ok(text.includes('copy'));assert.ok(text.includes('$flow-lens'));
    await page.getByRole('button',{name:'复制修改指令',exact:true}).click();
    await page.getByRole('status').filter({hasText:'指令已复制'}).waitFor();
    assert.equal(store.get('copy').revision,r.revision);
    assert.equal(store.get('copy').request.id,r.request.id);
    assert.equal(store.get('compact').request,null);
    if(process.env.FLOW_LENS_SCREENSHOTS)await page.screenshot({path:path.join(process.env.FLOW_LENS_SCREENSHOTS,'flow-lens-edit.png')});
    assert.deepEqual(errors,[]);await context.close();
  });
  await t.test('clipboard denial leaves a saved proposal with selectable manual fallback',async()=>{
    const {context,page,errors}=await fixture('fallback');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}}}));
    await editLabel(page);
    await page.getByRole('button',{name:'提交并复制',exact:true}).click();
    const field=page.getByLabel('会话指令');await field.waitFor();
    const r=store.get('fallback');assert.ok((await field.inputValue()).includes(r.request.id));
    await field.focus();
    assert.equal(await field.evaluate(el=>el.selectionEnd-el.selectionStart), (await field.inputValue()).length);
    assert.equal(store.get('fallback').baseline.nodes[1].data.label,'权限通过？');
    await page.getByRole('button',{name:'复制指令',exact:true}).click();
    assert.equal(store.get('fallback').revision,r.revision);
    assert.deepEqual(errors,[]);await context.close();
  });
  await t.test('source changes block submission and keep the unsent draft',async()=>{
    const {context,page,errors}=await fixture('stale');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{window.didCopy=true;}}}));
    await editLabel(page);
    fs.appendFileSync(path.join(dir,'logic.js'),'// source changed\n');
    await page.getByRole('button',{name:'提交并复制',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'代码已变化'}).waitFor();
    const r=store.get('stale');assert.equal(r.request,null);
    assert.equal(r.draft.nodes[1].data.label,'权限与账户均有效？');
    assert.equal(await page.evaluate(()=>!!window.didCopy),false);
    assert.deepEqual(errors,[]);await context.close();
  });
});
