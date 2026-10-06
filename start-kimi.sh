#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
pkill -f "kimi-proxy.js" 2>/dev/null || true
sleep 1
REFRESH_INTERVAL_MS=600000 REFRESH_AHEAD_SEC=300 nohup node kimi-proxy.js > proxy.log 2>&1 &
echo "kimi-proxy запущен, PID $!"
echo "Health: curl -s http://localhost:5001/v1/health | python3 -m json.tool"
