#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const dumpFile = process.argv[2];
if (!dumpFile) { console.error('Usage: node extract-kimi-auth.js <dump.json>'); process.exit(1); }
const dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
const ls = dump.localStorage || {};
const access_token = ls.access_token || ''; const refresh_token = ls.refresh_token || ''; const user_id = ls.msh_user_id || '';
if (!access_token) { console.error('access_token не найден'); process.exit(1); }
if (!refresh_token) { console.error('refresh_token не найден'); process.exit(1); }
function decodeJwt(t) { try { const [,p]=t.split('.'); return JSON.parse(Buffer.from(p,'base64').toString('utf8')); } catch(_){return {};} }
const claims = decodeJwt(access_token);
let chat_id = '';
const urlMatch = String(dump.tabUrl || '').match(/\/chat\/([0-9a-f-]{36})/);
if (urlMatch) chat_id = urlMatch[1];
let parent_id = '';
const reqs = dump.capturedRequests || [];
for (let i = reqs.length - 1; i >= 0; i--) {
  const r = reqs[i]; if (!r.requestBody) continue;
  if (!/ChatService\/ListMessages/.test(r.url || '')) continue;
  const body = String(r.requestBody).replace(/^\[raw \d+b\]\s*/, '');
  try { const j = JSON.parse(body); if (j.chat_id) chat_id = j.chat_id; if (j.start_message_id) { parent_id = j.start_message_id; break; } } catch (_) {}
}
if (!parent_id && chat_id) parent_id = chat_id;
const cookieParts = [];
for (const c of (dump.cookies || [])) cookieParts.push(c.name + '=' + c.value);
const result = { access_token, refresh_token, user_id, device_id: claims.device_id || '', session_id: claims.ssid || '', region: claims.region || 'overseas', chat_id, parent_id, cookie: cookieParts.join('; '), saved_at: new Date().toISOString(), access_exp: claims.exp || 0, access_iat: claims.iat || 0 };
const outFile = path.join(path.dirname(dumpFile), 'kimi-auth.json');
fs.writeFileSync(outFile, JSON.stringify(result, null, 2), { mode: 0o600 });
console.log('kimi-auth.json: ' + outFile);
console.log('  user_id:    ' + (user_id || '(пусто)'));
console.log('  chat_id:    ' + (chat_id || 'НЕ НАЙДЕН'));
console.log('  parent_id:  ' + (parent_id || 'НЕ НАЙДЕН'));
console.log('  access exp: ' + (claims.exp ? new Date(claims.exp * 1000).toISOString() : '(unknown)'));
