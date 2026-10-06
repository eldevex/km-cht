const $ = (s) => document.querySelector(s);
async function refresh() {
  const d = await chrome.runtime.sendMessage({ type: 'COLLECT' });
  if (!d || d.error) return;
  const ls = d.localStorage || {};
  $('#s-tok').textContent = ls.access_token ? 'OK' : 'NO';
  $('#s-rtok').textContent = ls.refresh_token ? 'OK' : 'NO';
  $('#s-req').textContent = (d.capturedRequests || []).length;
}
async function doDump() {
  const b = $('#b-dump'); const st = $('#st');
  b.disabled = true; b.textContent = '...'; st.className = 'status';
  try {
    const d = await chrome.runtime.sendMessage({ type: 'COLLECT' });
    if (d.error) throw new Error(d.error);
    const r = await chrome.runtime.sendMessage({ type: 'SAVE_DUMP', data: d });
    if (r.error) throw new Error(r.error);
    st.className = 'status ok'; st.textContent = 'OK: ' + r.filename;
    await refresh();
  } catch (e) { st.className = 'status err'; st.textContent = 'Ошибка: ' + e.message; }
  finally { b.disabled = false; b.textContent = 'Снять дамп'; }
}
$('#b-dump').addEventListener('click', doDump);
$('#b-ref').addEventListener('click', refresh);
$('#b-clr').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' });
  await refresh();
  $('#st').className = 'status ok'; $('#st').textContent = 'Буфер очищен';
});
refresh();
