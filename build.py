#!/usr/bin/env python3
"""python3 build.py [YYYY-MM-DD] [version]  ->  dist/syncy-<browser>-<date>.zip
The version is NOT hard-coded: it comes from the VERSION file (edit it by hand) or from the 2nd argument."""
import datetime, json, pathlib, re, shutil, sys, zipfile
root = pathlib.Path(__file__).parent
date = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
version = (sys.argv[2] if len(sys.argv) > 2 else (root / 'VERSION').read_text()).strip().lstrip('v')
if not re.fullmatch(r'\d+(\.\d+){0,3}', version): sys.exit(f'Invalid version "{version}" (use e.g. 1.0.1)')
dist = root / 'dist'
shutil.rmtree(dist, ignore_errors=True)
for target in ('chrome', 'edge', 'firefox'):
    stage = dist / target
    shutil.copytree(root / 'src', stage)
    m = json.loads((root / 'manifests' / f'{target}.json').read_text())
    m = {'manifest_version': m.pop('manifest_version'), 'name': m.pop('name'), 'version': version, **m}
    (stage / 'manifest.json').write_text(json.dumps(m, indent=2))
    out = dist / f'syncy-{target}-{date}.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(stage.rglob('*')):
            if p.is_file(): z.write(p, p.relative_to(stage))
    print('built', out, 'version', version)
