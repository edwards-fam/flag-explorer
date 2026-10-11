// A stand-in for the parts of Google Firestore's web interface that the game uses, for automated tests.
// It keeps documents in memory and applies the same access rules as site/firestore.rules, written out by hand below.
import http from 'http';

export function startMock() {
  const docs = new Map(), log = [];          // path → { fields, createTime, updateTime }
  const now = () => new Date().toISOString();
  const typeOf = v => v && typeof v === 'object' ? Object.keys(v)[0] : null;
  const plainVal = v => { const t = typeOf(v); if (t === 'stringValue') { if (typeof v[t] !== 'string') throw 'bad string'; return v[t]; } if (t === 'integerValue') { if (!/^-?\d+$/.test(String(v[t]))) throw 'bad integer'; return Number(v[t]); }
    if (t === 'booleanValue') { if (typeof v[t] !== 'boolean') throw 'bad boolean'; return v[t]; } if (t === 'arrayValue') return (v[t].values || []).map(plainVal); if (t === 'timestampValue') return { ts: v[t] }; if (t === 'nullValue') return null; throw 'unknown value type ' + t; };
  const isInt = x => Number.isInteger(x), isStr = x => typeof x === 'string';
  const goodName = d => isStr(d.name) && d.name.length > 0 && [...d.name].length <= 14 && isStr(d.avatar) && d.avatar.length <= 16;
  const SCORE_KEYS = ['name', 'avatar', 'score', 'streak', 'clock', 'perfect', 't'], PLAYER_KEYS = ['name', 'avatar', 'stamps', 'perfect', 'updated', 'best_world', 'best_known', 'best_daily', 'streak_world', 'streak_known', 'streak_daily'];
  const goodScore = d => Object.keys(d).every(k => SCORE_KEYS.includes(k)) && SCORE_KEYS.every(k => k in d) && goodName(d) && isInt(d.score) && d.score >= 0 && d.score <= 2300 && isInt(d.streak) && d.streak >= 0 && d.streak <= 10 && typeof d.clock === 'boolean' && typeof d.perfect === 'boolean' && isInt(d.t) && d.t > 0;
  const goodPlayer = d => Object.keys(d).every(k => PLAYER_KEYS.includes(k)) && goodName(d) && (!('stamps' in d) || (Array.isArray(d.stamps) && d.stamps.length <= 250)) && (!('perfect' in d) || (Array.isArray(d.perfect) && d.perfect.length <= 3000));
  // what the rules allow: returns 'read' / 'create' / 'write' permissions for a document path
  function rule(path) {
    const seg = path.split('/');
    if (seg[0] !== 'families' || !/^[0-9a-f]{32}$/.test(seg[1] || '')) return null;
    if (seg.length === 4 && seg[2] === 'players') return { read: true, create: goodPlayer, update: goodPlayer };
    if (seg.length === 6 && seg[2] === 'tables' && ['world', 'known'].includes(seg[3]) && seg[4] === 'entries') return { read: true, create: goodScore, update: null };
    if (seg.length === 6 && seg[2] === 'days' && /^\d{4}-\d{2}-\d{2}$/.test(seg[3]) && seg[4] === 'entries') return { read: true, create: goodScore, update: null };
    return null;
  }
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' }); res.end(JSON.stringify(body)); };
  const fail = (res, status, code) => send(res, status, { error: { code: status, status: code, message: code } });
  const state = { down: false, requests: 0, withKey: 0, noKey: 0, validKey: null, keyRequired: false };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    state.requests++;
    if (state.down) return req.destroy();
    const key = new URL(req.url, 'http://x').searchParams.get('key');
    if (key !== null) state.withKey++; else state.noKey++;
    if (key !== null && state.validKey && key !== state.validKey) return send(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
    if (key === null && state.keyRequired) return send(res, 403, { error: { code: 403, message: "Method doesn't allow unregistered callers (callers without established identity). Please use API Key or other form of API consumer identity to call this API.", status: 'PERMISSION_DENIED' } });
    const url = new URL(req.url, 'http://x'), m = decodeURIComponent(url.pathname).match(/^\/v1\/projects\/([^/]+)\/databases\/\(default\)\/documents(?:\/(.*?))?(:commit)?$/);
    if (!m) return fail(res, 404, 'NOT_FOUND');
    const base = `projects/${m[1]}/databases/(default)/documents`, path = m[2] || '';
    if (req.method === 'GET') {
      const seg = path.split('/').filter(Boolean);
      log.push('GET ' + path);
      if (seg.length % 2 === 0) {          // a document
        const r = rule(path); if (!r || !r.read) return fail(res, 403, 'PERMISSION_DENIED');
        const d = docs.get(path); if (!d) return fail(res, 404, 'NOT_FOUND');
        return send(res, 200, { name: `${base}/${path}`, ...d });
      }
      const probe = rule(path + '/x'); if (!probe || !probe.read) return fail(res, 403, 'PERMISSION_DENIED');      // a collection: listing needs read on its documents
      let list = [...docs.entries()].filter(([p]) => p.startsWith(path + '/') && p.split('/').length === seg.length + 1).map(([p, d]) => ({ name: `${base}/${p}`, ...d }));
      const order = url.searchParams.get('orderBy');
      if (order) { const [field, dir] = order.split(' '); list = list.filter(d => field in d.fields); list.sort((a, b) => (plainVal(a.fields[field]) - plainVal(b.fields[field])) * (dir === 'desc' ? -1 : 1) || (a.name < b.name ? -1 : 1) * (dir === 'desc' ? -1 : 1)); }
      else list.sort((a, b) => a.name < b.name ? -1 : 1);
      const size = +url.searchParams.get('pageSize') || 300;
      return send(res, 200, list.length ? { documents: list.slice(0, size) } : {});
    }
    if (req.method === 'POST' && m[3]) {
      let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
        let body; try { body = JSON.parse(raw); } catch (e) { return fail(res, 400, 'INVALID_ARGUMENT'); }
        const staged = new Map();
        try {
          for (const w of body.writes || []) {
            if (!w.update || !w.update.name.startsWith(base + '/')) return fail(res, 400, 'INVALID_ARGUMENT');
            const p = w.update.name.slice(base.length + 1), r = rule(p), old = staged.get(p) || docs.get(p);
            log.push('WRITE ' + p);
            if (w.currentDocument && w.currentDocument.exists === false && old) return fail(res, 409, 'ALREADY_EXISTS');
            let fields = w.updateMask ? Object.assign({}, old ? old.fields : {}) : {};
            if (w.updateMask) { for (const k of w.updateMask.fieldPaths) { if (k in (w.update.fields || {})) fields[k] = w.update.fields[k]; else delete fields[k]; } }
            else fields = Object.assign({}, w.update.fields || {});
            for (const t of w.updateTransforms || []) {
              if (t.appendMissingElements) { const have = fields[t.fieldPath] && fields[t.fieldPath].arrayValue ? [...(fields[t.fieldPath].arrayValue.values || [])] : []; for (const v of t.appendMissingElements.values || []) if (!have.some(h => JSON.stringify(h) === JSON.stringify(v))) have.push(v); fields[t.fieldPath] = { arrayValue: { values: have } }; }
              else if (t.maximum) { const cur = fields[t.fieldPath] && 'integerValue' in fields[t.fieldPath] ? Number(fields[t.fieldPath].integerValue) : null, next = plainVal(t.maximum); fields[t.fieldPath] = { integerValue: String(cur === null ? next : Math.max(cur, next)) }; }
              else if (t.setToServerValue === 'REQUEST_TIME') fields[t.fieldPath] = { timestampValue: now() };
              else return fail(res, 400, 'INVALID_ARGUMENT');
            }
            const data = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, plainVal(v)]));
            const check = r && (old ? r.update : r.create);
            if (!check || !check(data)) return fail(res, 403, 'PERMISSION_DENIED');
            staged.set(p, { fields, createTime: old ? old.createTime : now(), updateTime: now() });
          }
        } catch (e) { return fail(res, 400, 'INVALID_ARGUMENT'); }
        for (const [p, d] of staged) docs.set(p, d);
        send(res, 200, { writeResults: [...staged].map(() => ({ updateTime: now() })), commitTime: now() });
      });
      return;
    }
    fail(res, 404, 'NOT_FOUND');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/v1`, docs, log, state, plain: d => Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, plainVal(v)])), close: () => server.close() })));
}
