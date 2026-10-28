'use strict';
// Public data allowlist. Deliberately omits players, SteamIDs, bank records, session IDs,
// server host addresses and any fields not explicitly needed for the dashboard.
function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function n(x) { return typeof x === 'number' && Number.isFinite(x) ? x : null; }
function b(x) { return typeof x === 'boolean' ? x : null; }
function t(x, max=140) { return typeof x === 'string' ? x.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0,max) : null; }
function nums(o, keys) {
  const src = obj(o), out={};
  for (const k of keys) if (n(src[k]) !== null) out[k] = n(src[k]);
  return out;
}
function bools(o, keys) {
  const src = obj(o), out={};
  for (const k of keys) if (b(src[k]) !== null) out[k] = b(src[k]);
  return out;
}
function strings(o, keys) {
  const src = obj(o), out={};
  for (const k of keys) if (t(src[k])) out[k] = t(src[k]);
  return out;
}
function problems(x) {
  if (!Array.isArray(x)) return [];
  return x.slice(0,40).map(p=> {
    const v = obj(p);
    return { text: t(v.text, 240) || 'Замечание', sev: n(v.sev) ?? 2,
      node: t(v.node, 30), act: t(v.act, 240), shop: t(v.shop, 200) };
  });
}
function sanitize(payload) {
  const p = obj(payload), s = obj(p.s);
  const city = { ...nums(s.city, ['station','load','reserve','gen']), ...bools(s.city,['blackout']), ...strings(s.city,['state'])};
  const rx = { ...nums(s.rx,['chans','fresh','spent','wear']), ...bools(s.rx,['found']), ...strings(s.rx,['stage']) };
  const tb = { ...nums(s.tb,['rpm','load','press','vac','oil','foul','foulMax','oilLeft','foulLeft','bear','energy']),
    ...bools(s.tb,['found','tripped','grid']) };
  const wsSrc = obj(s.ws);
  const ws = {};
  if (Object.keys(obj(wsSrc.st)).length) ws.st = { ...strings(wsSrc.st, ['name']), ...bools(wsSrc.st, ['halted','auto']) };
  if (Object.keys(obj(wsSrc.drum)).length) ws.drum = { ...nums(wsSrc.drum, ['rods','pockets']), ...bools(wsSrc.drum,['sealed']) };
  if (Object.keys(obj(wsSrc.lift)).length) ws.lift = nums(wsSrc.lift,['sent']);
  if (Object.keys(obj(wsSrc.rack)).length) ws.rack = nums(wsSrc.rack,['cases','n','rods']);
  const data = {
    source: p.source === 'demo' ? 'demo' : 'live',
    s: {
      ...nums(s, ['power','setp','fuelSec','fuelPct','wastePct','temp','press','nomT','pumps','slotsOk','slotsAll']),
      ...bools(s, ['found','run','tripped','panel','alarm','ventOn']),
      ...strings(s, ['mode']),
      city, rx, tb, ws,
      probs: problems(s.probs), faults: problems(s.faults),
    },
  };
  return data;
}
module.exports = { sanitize };
