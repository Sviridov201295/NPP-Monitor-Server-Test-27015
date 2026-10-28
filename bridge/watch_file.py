"""Forward snapshots exported to garrysmod/data by an authorized client addon.

Requirements: Python 3.9+, standard library only. The Lua exporter is OPTIONAL and
cannot be assumed to work when server policy prevents custom client Lua.
"""
import json
import os
from pathlib import Path
import sys
import time
import urllib.request

PATH = Path(os.getenv('NPP_JSON_PATH', 'garrysmod/data/syndicate_npp_monitor.json'))
URL = os.getenv('NPP_SITE_URL', 'http://localhost:3000').rstrip('/')+'/api/ingest'
TOKEN = os.getenv('INGEST_TOKEN', '')
if not TOKEN:
    raise SystemExit('Set INGEST_TOKEN environment variable.')
print(f'Watching {PATH.resolve()} -> {URL} (Ctrl+C to stop)', flush=True)
last_digest = None
last_modified = None
while True:
    try:
        if PATH.is_file():
            stat = PATH.stat()
            # If the Lua exporter stopped writing, DO NOT retransmit old values.
            if stat.st_mtime_ns != last_modified:
                raw = PATH.read_bytes()
                parsed = json.loads(raw.decode('utf-8-sig'))
                if not isinstance(parsed, dict) or not isinstance(parsed.get('s'), dict):
                    print('Ignoring invalid JSON schema', flush=True)
                else:
                    payload = json.dumps({'source':'live', 's':parsed['s']}, ensure_ascii=False).encode('utf8')
                    req = urllib.request.Request(URL, data=payload, headers={
                        'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}, method='POST')
                    with urllib.request.urlopen(req,timeout=10) as response:
                        print(time.strftime('%H:%M:%S'), 'sent',response.status,flush=True)
                    last_modified = stat.st_mtime_ns
        else:
            if last_digest != 'missing':
                print('Source JSON not found; the website will remain offline.',flush=True)
                last_digest = 'missing'
    except KeyboardInterrupt:
        print('Stopped.')
        sys.exit(0)
    except Exception as e:
        print('Bridge error:', type(e).__name__,str(e),flush=True)
    time.sleep(1)
