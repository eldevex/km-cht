const TARGET_DOMAINS = ['kimi.ai', 'kimi.com', 'moonshot.cn', 'moonshot.ai'];
const FILTER_URLS = ['https://*.kimi.ai/*','https://*.kimi.com/*','https://*.moonshot.cn/*','https://*.moonshot.ai/*'];
function isNoise(url) { return /analytics\.google\.com|googletagmanager\.com|google\.com\/ccm|google\.com\/g\/collect|doubleclick|\/ws\/tickets/.test(url); }
function isCandidate(url) { return /kimi\.gateway|ChatService|apiv2|auth\.kimi|RefreshToken/.test(url); }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'COLLECT') { collectAll().then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'SAVE_DUMP') { saveDump(msg.data).then(sendResponse).catch(e => sendResponse({ error: e.message })); return true; }
  if (msg.type === 'CAPTURED_REQUEST') { pushCapturedRequest(msg.data); return true; }
  if (msg.type === 'CLEAR_REQUESTS') { chrome.storage.local.set({ capturedRequests: [] }).then(() => sendResponse({ ok: true })); return true; }
});

async function pushCapturedRequest(req) {
  const { capturedRequests = [] } = await chrome.storage.local.get('capturedRequests');
  capturedRequests.push(req);
  while (capturedRequests.length > 500) capturedRequests.shift();
  await chrome.storage.local.set({ capturedRequests });
}

chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (isNoise(details.url)) return;
  let bodyPreview = null;
  if (details.requestBody) {
    try {
      if (details.requestBody.raw && details.requestBody.raw[0]?.bytes) {
        const u8 = new Uint8Array(details.requestBody.raw[0].bytes);
        let s = ''; const lim = Math.min(u8.length, 4000);
        for (let i = 0; i < lim; i++) { const c = u8[i]; s += (c >= 32 && c < 127) ? String.fromCharCode(c) : '.'; }
        bodyPreview = '[raw ' + u8.length + 'b] ' + s;
      } else if (details.requestBody.formData) bodyPreview = JSON.stringify(details.requestBody.formData).slice(0, 4000);
    } catch (e) { bodyPreview = '[unreadable]'; }
  }
  pushCapturedRequest({ kind: 'webRequest', method: details.method, url: details.url, type: details.type, tabId: details.tabId, requestBody: bodyPreview, interesting: isCandidate(details.url), ts: new Date().toISOString() });
}, { urls: FILTER_URLS }, ['requestBody']);

const INTERESTING_HEADERS = ['authorization','connect-protocol-version','content-type','accept','cookie','r-timezone','x-language','x-traffic-id','x-msh-platform','x-msh-version','x-msh-device-id','x-msh-session-id','x-msh-shield-data','origin','referer'];
chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  if (isNoise(details.url)) return;
  const raw = {}; for (const h of (details.requestHeaders || [])) raw[h.name.toLowerCase()] = h.value;
  const filtered = {}; for (const k of INTERESTING_HEADERS) if (raw[k] !== undefined) filtered[k] = raw[k];
  pushCapturedRequest({ kind: 'webRequest-headers', method: details.method, url: details.url, requestHeaders: filtered, interesting: isCandidate(details.url), ts: new Date().toISOString() });
}, { urls: FILTER_URLS }, ['requestHeaders', 'extraHeaders']);

chrome.webRequest.onCompleted.addListener((details) => {
  if (isNoise(details.url)) return; if (!isCandidate(details.url)) return;
  pushCapturedRequest({ kind: 'webRequest-completed', method: details.method, url: details.url, statusCode: details.statusCode, ts: new Date().toISOString() });
}, { urls: FILTER_URLS }, ['responseHeaders']);

async function collectAll() {
  const cookies = await collectCookies();
  const ls = await collectLocalStorage();
  return { timestamp: new Date().toISOString(), tabUrl: ls.url || null, userAgent: navigator.userAgent, region: 'international', cookies, localStorage: ls.data, capturedRequests: await getCapturedRequests() };
}
async function collectCookies() {
  const all = [];
  for (const d of TARGET_DOMAINS) { try { const list = await chrome.cookies.getAll({ domain: d }); for (const c of list) all.push({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, session: c.session, expirationDate: c.expirationDate }); } catch (_) {} }
  const seen = new Set();
  return all.filter(c => { const k = c.domain + '|' + c.name; if (seen.has(k)) return false; seen.add(k); return true; });
}
async function collectLocalStorage() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); const tab = tabs[0];
    if (!tab || !tab.url || !/kimi\.ai|kimi\.com|moonshot/.test(tab.url)) return { url: null, data: {} };
    const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } } catch (_) {} return { url: location.href, data: o }; } });
    return r[0]?.result || { url: null, data: {} };
  } catch (e) { return { url: null, data: {} }; }
}
async function getCapturedRequests() { const { capturedRequests = [] } = await chrome.storage.local.get('capturedRequests'); return capturedRequests.slice(-450); }
async function saveDump(data) {
  const ts = Date.now(); const filename = 'kimi-dump-' + ts + '.json';
  const json = JSON.stringify(data, null, 2);
  let url;
  try {
    if (json.length < 1500000) { const utf8 = unescape(encodeURIComponent(json)); url = 'data:application/json;base64,' + btoa(utf8); }
    else {
      const light = JSON.parse(json);
      for (const r of (light.capturedRequests || [])) { if (r.requestBody && r.requestBody.length > 4000) r.requestBody = r.requestBody.slice(0, 4000) + '...[truncated]'; }
      const lj = JSON.stringify(light, null, 2);
      url = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(lj)));
    }
  } catch (e) { return { error: 'encode failed: ' + e.message }; }
  await chrome.downloads.download({ url, filename, saveAs: true });
  return { ok: true, filename };
}
