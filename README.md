# kimi-proxy

OpenAI-совместимый прокси для Kimi через web-аккаунт kimi.ai.

## Установка

1. termux-setup-storage
2. chrome://extensions → Load unpacked → ~/kimi-dumper

## Порядок

1. Открой www.kimi.ai, залогинься, зайди в чат
2. Иконка расширения → Очистить буфер
3. Отправь сообщение, дождись ответа
4. Иконка расширения → Снять дамп
5. cd ~/kimi-proxy
   ./update-auth.sh ~/storage/downloads/kimi-dump-XXXX.json
   ./start-kimi.sh
   ./status.sh

## Подключение клиентов

- Base URL: http://127.0.0.1:5001/v1
- API Key: любой
- Model: k2d6-chat
