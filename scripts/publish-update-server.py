#!/usr/bin/env python3
"""Receive one verified release over a restricted SSH key."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile

ROOT = Path('/opt/1panel/www/sites/update.dknx.top/index/linggao-ai')
VERSION = re.compile(r'^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$')


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    versions = ROOT / 'versions'
    versions.mkdir(exist_ok=True)
    with (ROOT / '.publish.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=ROOT))
        try:
            with tarfile.open(fileobj=sys.stdin.buffer, mode='r|') as archive:
                for member in archive:
                    if not member.isfile() or '/' in member.name or member.name.startswith('.') or member.size > 1024 * 1024 * 1024:
                        raise ValueError('Invalid archive member')
                    target = staging / member.name
                    with target.open('xb') as output:
                        source = archive.extractfile(member)
                        if source is None:
                            raise ValueError('Unable to read archive member')
                        shutil.copyfileobj(source, output)
            manifest = json.loads((staging / 'latest.json').read_text(encoding='utf-8'))
            version = manifest.get('version')
            if not isinstance(version, str) or not VERSION.fullmatch(version) or not isinstance(manifest.get('notes'), str) or len(manifest['notes']) > 30000:
                raise ValueError('Invalid release metadata')
            expected = {'latest.json', 'latest.yml'} | {f'linggao-ai-{version}-{suffix}' for suffix in ('win-x64.exe', 'mac-arm64.dmg', 'mac-x64.dmg')}
            if {entry.name for entry in staging.iterdir()} != expected or any((staging / name).stat().st_size == 0 for name in expected):
                raise ValueError('Missing or unexpected release files')
            current = ROOT / 'latest.json'
            if current.exists():
                old = json.loads(current.read_text(encoding='utf-8'))['version']
                if not VERSION.fullmatch(old) or tuple(map(int, version.split('.'))) < tuple(map(int, old.split('.'))):
                    raise ValueError('Release version cannot go backwards')
            destination = versions / f'v{version}'
            already_published = destination.exists()
            if already_published:
                for name in expected - {'latest.json'}:
                    old_file = destination / name
                    if not old_file.is_file() or hashlib.file_digest(old_file.open('rb'), 'sha256').digest() != hashlib.file_digest((staging / name).open('rb'), 'sha256').digest():
                        raise ValueError('Published release files cannot be replaced')
            metadata = staging / 'latest.json'
            pending = ROOT / '.latest.json.pending'
            with pending.open('w', encoding='utf-8') as output:
                json.dump(manifest, output, ensure_ascii=False)
            metadata.unlink()
            os.chmod(staging, 0o755)
            for file in staging.iterdir():
                os.chmod(file, 0o644)
            if not already_published:
                staging.rename(destination)
            os.chmod(pending, 0o644)
            os.replace(pending, current)
            print(f'Published {version}')
        finally:
            if staging.exists():
                shutil.rmtree(staging)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, tarfile.TarError, json.JSONDecodeError) as error:
        print(f'Publish failed: {error}', file=sys.stderr)
        sys.exit(1)
