#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"
if [ -z "$1" ]; then echo "Usage: $0 <dump.json>"; echo "Пример: $0 ~/storage/downloads/kimi-dump-XXXX.json"; exit 1; fi
SRC="$1"
if [ ! -f "$SRC" ]; then
  for cand in "$HOME/storage/downloads/$SRC" "$HOME/storage/shared/Download/$SRC" "/sdcard/Download/$SRC" "$HOME/$SRC"; do
    if [ -f "$cand" ]; then SRC="$cand"; break; fi
  done
fi
if [ ! -f "$SRC" ]; then echo "Файл не найден: $1"; echo "Запусти: termux-setup-storage"; exit 1; fi
if ! cp "$SRC" ./dump-tmp.json 2>/dev/null; then cat "$SRC" > ./dump-tmp.json || { echo "Не могу прочитать"; exit 1; }; fi
chmod 644 ./dump-tmp.json
node extract-kimi-auth.js dump-tmp.json
rm -f ./dump-tmp.json
echo ""
echo "Прокси подхватит токен автоматически. Если chat_id/parent_id изменились — перезапусти."
