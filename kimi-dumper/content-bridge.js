window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== '__KD__') return;
  const payload = event.data.payload; if (!payload) return;
  try { chrome.runtime.sendMessage({ type: 'CAPTURED_REQUEST', data: payload }).catch(() => {}); } catch (_) {}
}, false);
