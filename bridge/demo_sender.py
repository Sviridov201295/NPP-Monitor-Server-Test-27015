"""Synthetic demo generator, does not read actual game telemetry."""
import json
import math
import os
import time
import urllib.request
import random

URL = os.getenv('NPP_SITE_URL', 'http://localhost:3000').rstrip('/') + '/api/ingest'
TOKEN = os.getenv('INGEST_TOKEN')
if not TOKEN:
    raise SystemExit('Set INGEST_TOKEN first')
print('DEMO MODE — sending synthetic telemetry. Stop with Ctrl+C.')
tick = 0
while True:
    phase = tick / 13
    output = 2010 + 190 * math.sin(phase)
    demand = 2200 + 170 * math.sin(phase*.76+.5)
    fuel = max(60, 1740-tick*2)
    data = {'source':'demo', 's': {
        'found':True,'run':True,'power':.8+.06*math.sin(phase),'setp':82,
        'fuelSec':fuel,'fuelPct':int(fuel/1800*100), 'temp':279+2*math.sin(phase),
        'press':34.7,'pumps':2,'tripped':False,'panel':True,'ventOn':True,
        'slotsOk':25,'slotsAll':25,'wastePct':19,
        'city':{'station':output,'load':demand,'reserve':max(0,demand-output),'blackout':False,'state':'Питание подано'},
        'rx':{'found':True,'chans':60,'fresh':51,'spent':9,'wear':.52,'stage':'РАБОТАЕТ'},
        'tb':{'found':True,'rpm':3000+18*math.sin(phase),'load':output/1000,'press':35,'vac':.86,'oil':.7,'bear':61,'grid':True,'tripped':False},
        'ws':{'rack':{'cases':3,'n':12,'rods':18},'drum':{'rods':9,'pockets':12,'sealed':False},'lift':{'sent':2}},
        'probs': [] if tick%40<25 else [{'sev':2,'node':'tb','text':'Проверьте уровень масла турбины','act':'Осмотреть турбинный узел'}]
    }}
    req=urllib.request.Request(URL,method='POST',data=json.dumps(data).encode(),headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=8) as r:
            print(time.strftime('%H:%M:%S'), 'DEMO ->',r.status,flush=True)
    except Exception as e:
        print('Error:',e,flush=True)
    time.sleep(2)
    tick+=1
