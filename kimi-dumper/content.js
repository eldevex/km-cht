(function () {
  if (window.__kdInstalled) return; window.__kdInstalled = true;
  const MAX_BODY = 200000;
  function emit(p) { try { window.postMessage({ type: '__KD__', payload: p }, '*'); } catch (_) {} }
  function isKimiUrl(u) { return typeof u === 'string' && /kimi\.com|kimi\.ai|moonshot/.test(u); }
  function trunc(s) { return typeof s === 'string' && s.length > MAX_BODY ? s.slice(0, MAX_BODY) + '...[truncated]' : s; }
  function bodyToText(body) {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof ArrayBuffer) { try { return new TextDecoder('utf-8').decode(new Uint8Array(body)); } catch (_) { return null; } }
    if (ArrayBuffer.isView(body)) { try { return new TextDecoder('utf-8').decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)); } catch (_) { return null; } }
    return null;
  }
  function maybeUnwrap(text) { if (typeof text !== 'string') return text; const i = text.indexOf('{'); if (i > 0 && i <= 10) return text.slice(i); return text; }

  const XHR = window.XMLHttpRequest;
  const XHR_OPEN = XHR.prototype.open, XHR_SEND = XHR.prototype.send, XHR_SET = XHR.prototype.setRequestHeader;
  XHR.prototype.open = function (m, u) { this.__kd_m = String(m || 'GET').toUpperCase(); this.__kd_u = u; this.__kd_h = {}; return XHR_OPEN.apply(this, arguments); };
  XHR.prototype.setRequestHeader = function (n, v) { if (this.__kd_h) this.__kd_h[n] = v; return XHR_SET.apply(this, arguments); };
  XHR.prototype.send = function (body) {
    const self = this;
    if (isKimiUrl(self.__kd_u)) {
      const t0 = Date.now();
      const meta = { kind: 'xhr', method: self.__kd_m, url: self.__kd_u, requestHeaders: self.__kd_h || {}, responseStatus: 0, responseContentType: '', durationMs: 0, ts: new Date().toISOString() };
      try { const txt = bodyToText(body); meta.requestBody = trunc(maybeUnwrap(txt) || txt); meta.requestBodyLength = txt ? txt.length : 0; } catch (_) {}
      self.addEventListener('loadend', () => {
        try {
          meta.responseStatus = self.status; meta.responseContentType = self.getResponseHeader('content-type') || ''; meta.durationMs = Date.now() - t0;
          if (self.responseType === '' || self.responseType === 'text') { const rt = self.responseText || ''; meta.responseBody = trunc(maybeUnwrap(rt) || rt); }
          else meta.responseBody = '[responseType: ' + self.responseType + ']';
        } catch (_) {}
        emit(meta);
      }, { once: true });
    }
    return XHR_SEND.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url || '');
    if (!isKimiUrl(url)) return origFetch.apply(this, arguments);
    const method = (init && init.method || (input && input.method) || 'GET').toUpperCase();
    const t0 = Date.now(); const headers = {};
    try {
      const h = init && init.headers || (input && input.headers);
      if (h instanceof Headers) h.forEach((v, k) => { headers[k] = v; });
      else if (Array.isArray(h)) for (const [k, v] of h) headers[k] = v;
      else if (h && typeof h === 'object') Object.assign(headers, h);
    } catch (_) {}
    const bodyText = init && init.body ? bodyToText(init.body) : null;
    return origFetch.apply(this, arguments).then(res => {
      const clone = res.clone(); const ct = res.headers.get('content-type') || '';
      const meta = { kind: 'fetch', method, url, requestHeaders: headers, requestBody: trunc(maybeUnwrap(bodyText) || bodyText), requestBodyLength: bodyText ? bodyText.length : 0, responseStatus: res.status, responseContentType: ct, durationMs: Date.now() - t0, ts: new Date().toISOString() };
      if (/text\/event-stream|application\/connect/.test(ct)) { meta.responseBody = '[stream]'; emit(meta); }
      else clone.text().then(t => { meta.responseBody = trunc(maybeUnwrap(t) || t); emit(meta); }).catch(() => emit(meta));
      return res;
    });
  };

  const OrigWS = window.WebSocket; const wsUrl = new WeakMap();
  function PatchedWS(url, protocols) {
    const ws = new OrigWS(url, protocols); wsUrl.set(ws, url);
    if (isKimiUrl(url)) ws.addEventListener('message', (ev) => { try { const preview = typeof ev.data === 'string' ? ev.data.slice(0, 1000) : '[binary]'; emit({ kind: 'ws-message', url, data: preview, ts: new Date().toISOString() }); } catch (_) {} });
    return ws;
  }
  PatchedWS.prototype = OrigWS.prototype;
  PatchedWS.CONNECTING = OrigWS.CONNECTING; PatchedWS.OPEN = OrigWS.OPEN; PatchedWS.CLOSING = OrigWS.CLOSING; PatchedWS.CLOSED = OrigWS.CLOSED;
  window.WebSocket = PatchedWS;
  const origSend = OrigWS.prototype.send;
  OrigWS.prototype.send = function (data) {
    const url = wsUrl.get(this);
    if (url && isKimiUrl(url)) { try { const preview = typeof data === 'string' ? data.slice(0, 1000) : '[binary]'; emit({ kind: 'ws-send', url, data: preview, ts: new Date().toISOString() }); } catch (_) {} }
    return origSend.apply(this, arguments);
  };
})();
