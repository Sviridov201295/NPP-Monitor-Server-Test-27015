"""Send a JSON snapshot to a public monitor. Stdlib only.

This bridge does NOT capture telemetry from Garry's Mod. Another authorized
source must provide a JSON document matching the NPP phone's {"s": {...}} format.
"""
import argparse
import json
import os
import sys
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file', help='Path to snapshot JSON file')
    parser.add_argument('--url', default=os.getenv('NPP_SITE_URL', 'http://localhost:3000'))
    parser.add_argument('--token', default=os.getenv('INGEST_TOKEN'))
    args = parser.parse_args()
    if not args.token:
        sys.exit('Set INGEST_TOKEN environment variable (same secret as site).')
    with open(args.file, 'rb') as f:
        raw = f.read()
    if not isinstance(json.loads(raw), dict):
        sys.exit('Expected JSON object')
    url = args.url.rstrip('/') + '/api/ingest'
    req = urllib.request.Request(url, data=raw, method='POST', headers={
        'Content-Type':'application/json', 'Authorization': 'Bearer '+args.token,
        'User-Agent':'SyndicateNPPBridge/1.0'
    })
    with urllib.request.urlopen(req, timeout=10) as res:
        print(res.status, res.read().decode('utf-8'))

if __name__ == '__main__':
    main()
