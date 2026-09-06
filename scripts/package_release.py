#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import shutil
import stat
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLUGIN_SOURCE = ROOT / "flow-lens"
PACKAGING = ROOT / "packaging"
RELEASES = ROOT / "releases"


def copy_plugin(destination: Path, version: str) -> None:
    shutil.copytree(
        PLUGIN_SOURCE,
        destination,
        ignore=shutil.ignore_patterns("node_modules", ".git", ".DS_Store"),
    )
    manifest_path = destination / ".codex-plugin" / "plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["version"] = f"{version}+codex.release.{version}"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_marketplace(root: Path) -> None:
    marketplace = {
        "name": "flow-lens-portable",
        "interface": {"displayName": "Flow Lens Portable"},
        "plugins": [
            {
                "name": "flow-lens",
                "source": {"source": "local", "path": "./plugins/flow-lens"},
                "policy": {
                    "installation": "AVAILABLE",
                    "authentication": "ON_INSTALL",
                },
                "category": "Productivity",
            }
        ],
    }
    target = root / ".agents" / "plugins" / "marketplace.json"
    target.parent.mkdir(parents=True)
    target.write_text(
        json.dumps(marketplace, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build portable Flow Lens release archives.")
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", args.version):
        raise SystemExit("--version must be a semantic version such as 0.1.0")

    RELEASES.mkdir(exist_ok=True)
    stage = RELEASES / "flow-lens-portable"
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "plugins").mkdir(parents=True)

    copy_plugin(stage / "plugins" / "flow-lens", args.version)
    write_marketplace(stage)
    shutil.copy2(PACKAGING / "install.sh", stage / "install.sh")
    shutil.copy2(PACKAGING / "README.md", stage / "README.md")
    shutil.copy2(ROOT / "LICENSE", stage / "LICENSE")
    (stage / "install.sh").chmod(
        (stage / "install.sh").stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH
    )

    stable_base = RELEASES / "flow-lens-portable"
    stable_zip = Path(shutil.make_archive(str(stable_base), "zip", RELEASES, stage.name))
    versioned_zip = RELEASES / f"flow-lens-portable-v{args.version}.zip"
    shutil.copy2(stable_zip, versioned_zip)

    checksums = RELEASES / "SHA256SUMS.txt"
    checksums.write_text(
        "".join(
            f"{sha256(path)}  {path.name}\n"
            for path in (stable_zip, versioned_zip)
        ),
        encoding="utf-8",
    )
    print(stable_zip)
    print(versioned_zip)
    print(checksums)


if __name__ == "__main__":
    main()
