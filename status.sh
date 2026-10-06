#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
echo "-- status --"
if pgrep -f kimi-proxy.js > /dev/null; then echo "  запущен: PID $(pgrep -f kimi-proxy.js | head -1)"; else echo "  не запущен"; fi
echo ""
echo "-- health --"
curl -s --max-time 2 http://localhost:5001/v1/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  (нет ответа)"
echo ""
echo "-- log --"
tail -n 10 proxy.log 2>/dev/null || echo "  (нет лога)"
