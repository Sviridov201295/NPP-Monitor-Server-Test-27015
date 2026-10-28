'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { sanitize } = require('./telemetry.js');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.INGEST_TOKEN || '';
const STALE_MS = Math.max(5000, Number(process.env.STALE_SECONDS || 12) * 1000);
const MAX_BODY = 96 * 1024;
const root = path.join(__dirname, 'public');
const clients = new Set();
const state = {
  last: null,
  at: null,
  received: 0,
  samples: [],
  events: [],
};

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function constantEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function auth(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') && constantEqual(header.slice(7), TOKEN);
}
function snapshot() {
  const age = state.at ? Date.now() - state.at : null;
  return {
    connected: age !== null && age <= STALE_MS,
    ageSeconds: age === null ? null : Math.max(0, Math.round(age / 1000)),
    staleAfterSeconds: Math.round(STALE_MS / 1000),
    updatedAt: state.at ? new Date(state.at).toISOString() : null,
    received: state.received,
    telemetry: state.last,
    history: state.samples,
    events: state.events,
  };
}
function broadcast() {
  const msg = 'event: telemetry\ndata: ' + JSON.stringify(snapshot()) + '\n\n';
  for (const res of clients) {
    try { res.write(msg); } catch { clients.delete(res); }
  }
}
function eventLabel(p) { return String(p?.text || 'Неисправность'); }
function accept(t) {
  const now = Date.now();
  const previous = state.last;
  state.last = sanitize(t);
  state.at = now;
  state.received++;
  const s = state.last.s;
  const smp = {
    t: new Date(now).toISOString(),
    power: s.city?.station ?? null,
    demand: s.city?.load ?? null,
    reserve: s.city?.reserve ?? null,
    rpm: s.tb?.rpm ?? null,
    temp: s.temp ?? null,
    fuelSec: s.fuelSec ?? null,
  };
  // One point at most per 5 seconds: maximum 720 points for one hour.
  if (!state.samples.length || now - Date.parse(state.samples[state.samples.length - 1].t) >= 5000) {
    state.samples.push(smp);
    state.samples = state.samples.filter(x => now - Date.parse(x.t) <= 60 * 60 * 1000).slice(-720);
  }
  const oldProblems = new Set((previous?.s?.probs || []).map(eventLabel));
  for (const p of (s.probs || [])) {
    const label = eventLabel(p);
    if (!oldProblems.has(label)) state.events.unshift({ at: new Date(now).toISOString(), sev: p.sev, text: label, act: p.act || null });
  }
  if (previous && previous.s.run !== s.run) state.events.unshift({ at: new Date(now).toISOString(), sev: s.run ? 3 : 2, text: s.run ? 'Реактор: работает' : 'Реактор: остановлен', act: null });
  state.events = state.events.slice(0, 40);
  broadcast();
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, urlPath) {
  if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, {error:'Method not allowed'});
  const f = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  if (!['index.html', 'styles.css', 'app.js'].includes(f)) return json(res, 404, {error:'Not found'});
  const full = path.join(root, f);
  fs.readFile(full, (err, body) => {
    if (err) return json(res, 404, {error:'Not found'});
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options':'nosniff',
      'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'" });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}
function handler(req, res) {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { return json(res, 400, {error:'Invalid URL'}); }
  if (pathname === '/health') return json(res, 200, {ok:true});
  if (pathname === '/api/state' && req.method === 'GET') return json(res, 200, snapshot());
  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform',
      Connection:'keep-alive', 'X-Accel-Buffering':'no', 'X-Content-Type-Options':'nosniff' });
    res.write('retry: 3000\nevent: telemetry\ndata: ' + JSON.stringify(snapshot()) + '\n\n');
    clients.add(res);
    const heartbeat = setInterval(() => {
      if (res.destroyed) return;
      res.write(': ping\n\n');
      // Refresh online/offline status even when the bridge has stopped.
      res.write('event: status\ndata: ' + JSON.stringify({connected:snapshot().connected, ageSeconds:snapshot().ageSeconds}) + '\n\n');
    }, 5000);
    req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
    return;
  }
  if (pathname === '/api/ingest') {
    if (req.method !== 'POST') return json(res, 405, {error:'Use POST'});
    if (!TOKEN) return json(res, 503, {error:'Set INGEST_TOKEN on the host first'});
    if (!auth(req)) return json(res, 401, {error:'Unauthorized'});
    const ct = String(req.headers['content-type'] || '');
    if (!ct.toLowerCase().startsWith('application/json')) return json(res, 415, {error:'Expected application/json'});
    if (Number(req.headers['content-length'] || 0) > MAX_BODY) return json(res, 413, {error:'Payload too large'});
    let total = 0; const chunks=[]; let aborted = false;
    req.on('data', ch => {
      if (aborted) return;
      total += ch.length;
      if (total > MAX_BODY) { aborted = true; json(res, 413, {error:'Payload too large'}); req.destroy(); return; }
      chunks.push(ch);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!payload || typeof payload !== 'object' || !payload.s || typeof payload.s !== 'object' || Array.isArray(payload.s))
          return json(res, 422, {error:'Expected {"s": {...}} like SPHONE.NPP.S.st'});
        accept(payload);
        return json(res, 200, {ok:true, received: state.received, at: new Date(state.at).toISOString()});
      } catch { return json(res, 400, {error:'Invalid JSON'}); }
    });
    return;
  }
  return serveStatic(req, res, pathname);
}
if (require.main === module) {
  http.createServer(handler).listen(PORT, HOST, () => {
    console.log(`Syndicate NPP Monitor listening on http://${HOST}:${PORT}`);
    if (!TOKEN) console.warn('INGEST_TOKEN is not set: all telemetry ingestion is disabled.');
  });
}
module.exports = { handler, snapshot, accept, state, constantEqual };
