#!/usr/bin/env python3
"""Builds store-ready zips: python3 build.py [YYYY-MM-DD]  ->  dist/syncy-<browser>-<date>.zip"""
import datetime, pathlib, shutil, sys, zipfile
root = pathlib.Path(__file__).parent
date = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
dist = root / 'dist'
shutil.rmtree(dist, ignore_errors=True)
for target in ('chrome', 'edge', 'firefox'):
    stage = dist / target
    shutil.copytree(root / 'src', stage)
    shutil.copy(root / 'manifests' / f'{target}.json', stage / 'manifest.json')
    out = dist / f'syncy-{target}-{date}.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(stage.rglob('*')):
            if p.is_file(): z.write(p, p.relative_to(stage))
    print('built', out)
