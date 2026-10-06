#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 5001;
const HOST = process.env.HOST || '127.0.0.1';
const AUTH_FILE = path.join(__dirname, 'kimi-auth.json');
const DEBUG = process.env.DEBUG !== '0';
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS) || 600000;
const REFRESH_AHEAD_SEC   = Number(process.env.REFRESH_AHEAD_SEC)   || 300;
const KIMI_BASE = process.env.KIMI_BASE || 'https://www.kimi.ai';
const CHAT_PATH = '/apiv2/kimi.gateway.chat.v1.ChatService/Chat';
const REFRESH_URL = 'https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken';
const DEFAULT_MODEL = 'k2d6-chat';
const AVAILABLE_MODELS = ['k2d6-chat'];
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';

let auth = null, refreshTimer = null, authWatcher = null;
let lastRefresh = { at: null, ok: null, error: null };

function loadAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
      if (!auth.access_token || !auth.refresh_token) auth = null;
    } else auth = null;
  } catch (e) { auth = null; }
}
function saveAuth() { fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 }); }
function decodeJwt(t) { try { const [,p]=t.split('.'); return JSON.parse(Buffer.from(p,'base64').toString('utf8')); } catch(_){return {};} }

function buildHeaders(extra = {}) {
  const jwt = auth.access_token; const claims = decodeJwt(jwt);
  const h = {
    'accept': '*/*', 'accept-language': 'ru-RU,ru;q=0.9',
    'authorization': 'Bearer ' + jwt,
    'connect-protocol-version': '1',
    'content-type': 'application/connect+json',
    'origin': KIMI_BASE, 'referer': KIMI_BASE + '/',
    'user-agent': UA,
    'x-language': 'ru', 'x-msh-platform': 'web', 'x-msh-version': '2.3.0',
    'r-timezone': process.env.TZ_NAME || 'Europe/Moscow',
    'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
    'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"',
  };
  if (claims.device_id) h['x-msh-device-id'] = String(claims.device_id);
  if (claims.ssid) h['x-msh-session-id'] = String(claims.ssid);
  if (auth.user_id) h['x-traffic-id'] = auth.user_id;
  return Object.assign(h, extra);
}

function encodeFrame(s) { const b = Buffer.from(s, 'utf8'); const f = Buffer.alloc(5 + b.length); f[0] = 0; f.writeUInt32BE(b.length, 1); b.copy(f, 5); return f; }

async function refreshToken() {
  if (!auth || !auth.refresh_token) return false;
  try {
    const res = await fetch(REFRESH_URL, { method: 'POST', headers: { 'accept': '*/*', 'authorization': 'Bearer ' + auth.access_token, 'connect-protocol-version': '1', 'content-type': 'application/json', 'origin': KIMI_BASE, 'referer': KIMI_BASE + '/', 'user-agent': UA }, body: JSON.stringify({ refresh_token: auth.refresh_token }) });
    const text = await res.text();
    if (DEBUG) console.log('[auth] refresh HTTP', res.status);
    if (res.ok) {
      const j = JSON.parse(text);
      const na = j.access_token || j.accessToken || j.token;
      const nr = j.refresh_token || j.refreshToken;
      if (na && na.startsWith('eyJ')) {
        auth.access_token = na; if (nr) auth.refresh_token = nr; saveAuth();
        const exp = decodeJwt(na).exp || 0;
        lastRefresh = { at: Date.now(), ok: true, error: null };
        console.log('[auth] token updated. exp:', new Date(exp * 1000).toISOString());
        return true;
      }
    }
  } catch (e) { console.error('[auth] err:', e.message); }
  lastRefresh = { at: Date.now(), ok: false, error: 'refresh failed' };
  return false;
}

async function ensureFreshToken() {
  if (!auth) throw new Error('kimi-auth.json не найден. Запусти: ./update-auth.sh <dump.json>');
  const claims = decodeJwt(auth.access_token);
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && (claims.exp - now) < REFRESH_AHEAD_SEC) await refreshToken();
}

function startRefreshTimer() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = setInterval(() => refreshToken().catch(()=>{}), REFRESH_INTERVAL_MS); if (refreshTimer.unref) refreshTimer.unref(); }

function watchAuthFile() {
  if (authWatcher) return;
  try {
    authWatcher = fs.watch(AUTH_FILE, { persistent: false }, () => {
      clearTimeout(watchAuthFile._t);
      watchAuthFile._t = setTimeout(() => {
        try {
          const n = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
          const changed = n.access_token !== auth.access_token || n.chat_id !== auth.chat_id || n.parent_id !== auth.parent_id;
          if (changed && n.access_token) { auth = n; console.log('[auth] kimi-auth.json перезагружен'); }
        } catch (_) {}
      }, 500);
    });
  } catch (_) {}
}

function flattenMessages(msgs) { return msgs.map(m => m.role + ':' + (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'); }

async function kimiChat(userText, model, opts = {}) {
  await ensureFreshToken();
  const chatId = opts.chat_id || auth.chat_id;
  if (!chatId) throw new Error('chat_id missing. Обнови kimi-auth.json: ./update-auth.sh <dump.json>');
  const parentId = opts.parent_id || auth.parent_id || chatId;
  const payload = {
    chat_id: chatId,
    scenario: 'SCENARIO_CHAT',
    tools: [{ type: 'TOOL_TYPE_SEARCH', search: {} }, { type: 'TOOL_TYPE_CRON_JOB' }],
    message: { parent_id: parentId, role: 'user', blocks: [{ message_id: '', text: { content: userText } }], scenario: 'SCENARIO_CHAT', is_goal: false },
    options: { thinking: opts.thinking !== false, enable_plugin: opts.enable_plugin !== false, reasoning_effort: opts.reasoning_effort || 'REASONING_EFFORT_LOW', model: model || DEFAULT_MODEL },
    project_id: '',
  };
  const frame = encodeFrame(JSON.stringify(payload));
  console.log('[kimi] chat_id=' + chatId + ' parent_id=' + parentId + ' model=' + payload.options.model);
  return await fetch(KIMI_BASE + CHAT_PATH, { method: 'POST', headers: buildHeaders(), body: frame });
}

async function* parseConnectStream(res) {
  const reader = res.body.getReader(); let buffer = Buffer.alloc(0);
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buffer = Buffer.concat([buffer, Buffer.from(value)]);
    let offset = 0;
    while (buffer.length - offset >= 5) {
      const flags = buffer[offset]; const len = buffer.readUInt32BE(offset + 1);
      if (buffer.length - offset - 5 < len) break;
      const payload = buffer.slice(offset + 5, offset + 5 + len); offset += 5 + len;
      if (flags & 0x02) continue;
      try { yield JSON.parse(payload.toString('utf8')); } catch (_) {}
    }
    buffer = buffer.slice(offset);
  }
}

function extractDelta(evt) {
  if (!evt || typeof evt !== 'object') return null;
  if (evt.heartbeat) return { type: 'heartbeat' };
  if (evt.error) return { type: 'error', error: evt.error };
  if (evt.done) return { type: 'done' };
  const mask = evt.mask;
  if (mask === 'block.think' || mask === 'block.think.content') {
    const c = evt.block?.think?.content;
    if (typeof c === 'string' && c.length) return { type: 'reasoning', delta: c };
  }
  if (mask === 'block.text' || mask === 'block.text.content') {
    const c = evt.block?.text?.content;
    if (typeof c === 'string' && c.length) return { type: 'content', delta: c };
  }
  if (mask === 'message.status' && evt.message?.status === 'MESSAGE_STATUS_COMPLETED') return { type: 'done' };
  if (evt.message?.status === 'MESSAGE_STATUS_COMPLETED' && evt.message?.role === 'assistant') return { type: 'done' };
  return null;
}
function extractMessageId(evt) { if (!evt || typeof evt !== 'object') return null; if (evt.message?.id && evt.message?.role === 'assistant') return evt.message.id; return null; }

async function handleResponse(kres, res, model, stream) {
  const started = Date.now();
  if (stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const id = 'chatcmpl-' + crypto.randomUUID(); const created = Math.floor(Date.now() / 1000);
    res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }) + '\n\n');
    let chars = 0, reasonChars = 0, lastAssistantId = null, alreadyDone = false;
    for await (const evt of parseConnectStream(kres)) {
      const mid = extractMessageId(evt); if (mid) lastAssistantId = mid;
      const d = extractDelta(evt); if (!d) continue;
      if (d.type === 'content') { chars += d.delta.length; res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: d.delta }, finish_reason: null }] }) + '\n\n'); }
      else if (d.type === 'reasoning') { reasonChars += d.delta.length; res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { reasoning_content: d.delta }, finish_reason: null }] }) + '\n\n'); }
      else if (d.type === 'done' && !alreadyDone) { alreadyDone = true; res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n'); }
    }
    if (!alreadyDone) res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
    res.write('data: [DONE]\n\n'); res.end();
    if (lastAssistantId && auth) { auth.parent_id = lastAssistantId; saveAuth(); console.log('[kimi] parent_id -> ' + lastAssistantId); }
    console.log('[kimi] stream done: content=' + chars + ', reasoning=' + reasonChars + ', ' + (Date.now()-started) + 'ms');
  } else {
    let content = '', reasoning = '', lastAssistantId = null;
    for await (const evt of parseConnectStream(kres)) {
      const mid = extractMessageId(evt); if (mid) lastAssistantId = mid;
      const d = extractDelta(evt);
      if (d?.type === 'content') content += d.delta;
      if (d?.type === 'reasoning') reasoning += d.delta;
    }
    if (lastAssistantId && auth) { auth.parent_id = lastAssistantId; saveAuth(); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'chatcmpl-' + crypto.randomUUID(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: 'assistant', content, reasoning_content: reasoning || undefined }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }));
    console.log('[kimi] response: content=' + content.length + ', reasoning=' + reasoning.length + ', ' + (Date.now()-started) + 'ms');
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (url.pathname === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ object: 'list', data: AVAILABLE_MODELS.map(id => ({ id, object: 'model', created: 1700000000, owned_by: 'kimi' })) })); return; }
  if (url.pathname === '/v1/health') {
    if (!auth) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, auth_loaded: false, hint: 'kimi-auth.json не найден. Запусти ./update-auth.sh <dump.json>' })); return; }
    const claims = decodeJwt(auth.access_token); const nowSec = Math.floor(Date.now() / 1000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, token_expires_at: claims.exp ? new Date(claims.exp * 1000).toISOString() : null, token_seconds_left: claims.exp ? Math.max(0, claims.exp - nowSec) : null, has_refresh_token: !!auth.refresh_token, user_id: auth.user_id || null, region: auth.region || null, chat_id: auth.chat_id || null, parent_id: auth.parent_id || null, last_refresh: lastRefresh }));
    return;
  }
  if (url.pathname === '/v1/refresh' && req.method === 'POST') { const ok = await refreshToken(); res.writeHead(ok ? 200 : 502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok, last_refresh: lastRefresh })); return; }
  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const params = JSON.parse(body || '{}'); const messages = params.messages || [];
        let model = String(params.model || DEFAULT_MODEL); if (!AVAILABLE_MODELS.includes(model)) { console.log("[kimi] модель", model, "->", DEFAULT_MODEL); model = DEFAULT_MODEL; } const stream = params.stream === true;
        if (!messages.length) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'messages required' } })); return; }
        const userText = flattenMessages(messages);
        console.log('[kimi] model=' + model + ' msgs=' + messages.length + ' stream=' + stream);
        if (!auth) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'kimi-auth.json не найден. Запусти ./update-auth.sh <dump.json>' } })); return; }
        let kres = await kimiChat(userText, model, params);
        if (kres.status === 401) { await refreshToken(); kres = await kimiChat(userText, model, params); }
        if (!kres.ok) { const t = await kres.text(); console.error('[kimi] HTTP ' + kres.status + ': ' + t.slice(0, 500)); res.writeHead(kres.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: t.slice(0, 500) } })); return; }
        await handleResponse(kres, res, model, stream);
      } catch (e) { console.error('[err]', e.stack || e.message); if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: String(e.message || e) } })); } }
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

function shutdown() { if (refreshTimer) clearInterval(refreshTimer); if (authWatcher) try { authWatcher.close(); } catch (_) {} server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

loadAuth(); startRefreshTimer(); watchAuthFile();
server.listen(PORT, HOST, () => {
  const claims = decodeJwt(auth.access_token);
  console.log('[kimi-proxy] listening on http://' + HOST + ':' + PORT);
  console.log('[kimi-proxy] models: ' + AVAILABLE_MODELS.join(', '));
  console.log('[kimi-proxy] token exp: ' + (claims.exp ? new Date(claims.exp * 1000).toISOString() : 'unknown'));
  console.log('[kimi-proxy] chat_id: ' + (auth.chat_id || '(нет)'));
  console.log('[kimi-proxy] parent_id: ' + (auth.parent_id || '(нет)'));
});
