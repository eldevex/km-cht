# km-cht — OpenAI-совместимый прокси для Kimi

<div align="center">

**Используй свой web-аккаунт kimi.ai как обычный OpenAI API.**

Работает с **Kai 9000**, **Open WebUI**, **Continue**, **Cline**, **Roo Code**, **LM Studio** и любым клиентом, поддерживающим OpenAI API.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform: Termux](https://img.shields.io/badge/Platform-Android%20%7C%20Termux-blue)](#требования)
[![Node](https://img.shields.io/badge/Node.js-%E2%89%A518-green)](#требования)

</div>

---

## Что это

Два компонента, работающие вместе:

| Компонент | Назначение |
|-----------|-----------|
| **`kimi-dumper/`** | Расширение Chrome — снимает cookies, localStorage и сетевые запросы с `www.kimi.ai` в JSON-файл |
| **`kimi-proxy/`** | Node.js-сервер — принимает дамп, держит токен свежим и отдаёт `/v1/chat/completions` в формате OpenAI |

Работает **без** `chrome.debugger`, **без** плашек «Debugging this tab», **без** root. Только официальные WebExtension API + прототип-патчинг XHR/fetch.

---

## Возможности

- ✅ **Полностью OpenAI-совместимый API** — `/v1/models`, `/v1/chat/completions`, `/v1/health`
- ✅ **Стриминг (`stream: true`)** — SSE-чанки как у OpenAI, с `reasoning_content`
- ✅ **Автоматический refresh токена** — прокси сам обновляет `access_token` каждые 10 минут
- ✅ **Автообновление `parent_id`** — диалог продолжается в том же треде Kimi
- ✅ **Fallback моделей** — любое имя модели подменяется на рабочую `k2d6-chat`
- ✅ **Работает на телефоне** — Termux + Chrome/Kiwi, без ПК
- ✅ **Хранение в файле** — `kimi-auth.json` в проекте, никаких внешних сервисов

---

## Требования

- **Android** + [Termux](https://f-droid.org/packages/com.termux/) (из F-Droid, не из Play Store)
- **Node.js** ≥ 18 (`pkg install nodejs`)
- **Chrome / Kiwi Browser / Titanium** с поддержкой расширений
- **Аккаунт на [www.kimi.ai](https://www.kimi.ai)**

---

## Установка

### 1. Подготовка Termux

```bash
pkg update && pkg upgrade
pkg install nodejs git
termux-setup-storage
```

Последняя команда даст доступ к общей памяти телефона — это позволит читать дамп из `~/storage/downloads/`.

### 2. Клонирование

```bash
cd ~
git clone https://github.com/eldevex/km-cht.git
cd km-cht
```

### 3. Установка расширения

1. Открой `chrome://extensions` в браузере
2. Включи **Режим разработчика**
3. Нажми **Load unpacked**
4. Выбери папку `~/km-cht/kimi-dumper`

### 4. Первый дамп

1. Открой [www.kimi.ai](https://www.kimi.ai), залогинься
2. Зайди в **любой чат** (важно — не пустой, а где уже есть хоть одно сообщение)
3. Кликни иконку расширения → **Очистить буфер**
4. Отправь в чат любое сообщение, дождись **полного** ответа Kimi
5. Иконка расширения → **Снять дамп** → файл сохранится в `~/storage/downloads/kimi-dump-XXXX.json`

### 5. Запуск прокси

```bash
cd ~/km-cht/kimi-proxy
./update-auth.sh ~/storage/downloads/kimi-dump-XXXX.json
./start-kimi.sh
./status.sh
```

В выводе `status.sh` должно быть:

```json
{
  "ok": true,
  "has_refresh_token": true,
  "chat_id": "1a110ae6-...",
  "parent_id": "1a110ba5-..."
}
```

**Ключевое:** `chat_id` и `parent_id` заполнены и **разные**.

---

## Использование

### Проверка

```bash
curl -s http://localhost:5001/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"k2d6-chat","messages":[{"role":"user","content":"привет"}]}' \
  | python3 -m json.tool
```

Должен вернуться полный ответ Kimi:

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Привет! 😊 Чем помочь?",
      "reasoning_content": "Greeting. Respond briefly."
    },
    "finish_reason": "stop"
  }]
}
```

### Подключение клиентов

| Параметр | Значение |
|----------|----------|
| **Base URL** | `http://127.0.0.1:5001/v1` |
| **API Key**  | `sk-kimi` (любой) |
| **Model**    | `k2d6-chat` (или любое — подменится) |

#### Kai 9000

Настройки → LLM Provider → **OpenAI-compatible** → впиши Base URL и Model.

#### Open WebUI

Settings → Connections → **OpenAI API** → добавь `http://127.0.0.1:5001/v1`.

#### Python (официальный SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:5001/v1",
    api_key="sk-kimi",
)

stream = client.chat.completions.create(
    model="k2d6-chat",
    messages=[{"role": "user", "content": "расскажи анекдот"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

#### Другие клиенты

Continue, Cline, Roo Code, LM Studio, Cherry Studio, ChatBox — все работают через стандартный OpenAI-провайдер.

---

## Управление

```bash
cd ~/km-cht/kimi-proxy

./start-kimi.sh     # запустить прокси
./stop-kimi.sh      # остановить
./status.sh         # статус + health + логи
tail -f proxy.log   # логи в реальном времени
```

### Автозапуск

Добавь в `~/.bashrc`:

```bash
pgrep -f kimi-proxy.js > /dev/null || (cd ~/km-cht/kimi-proxy && ./start-kimi.sh)
```

Тогда прокси будет подниматься при каждом открытии Termux.

---

## Обновление токенов

Refresh-токен Kimi живёт ~30 дней, но `access_token` может умереть раньше — при выходе из аккаунта в браузере, смене IP и т.п.

**Признак:** в логе `[auth] refresh failed` или клиент отвечает `401`.

**Что делать:**

1. Открой www.kimi.ai, зайди в чат, отправь сообщение
2. Сними новый дамп через расширение
3. Прогони:

```bash
cd ~/km-cht/kimi-proxy
./update-auth.sh ~/storage/downloads/kimi-dump-XXXX.json
pkill -f kimi-proxy.js
./start-kimi.sh
```

---

## Архитектура

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│  Kai 9000 /     │  HTTP   │                  │  HTTPS  │             │
│  Open WebUI /   │────────▶│   kimi-proxy     │────────▶│  kimi.ai    │
│  Python SDK     │  :5001  │   (Node.js)      │ Connect │  apiv2      │
└─────────────────┘         └────────┬─────────┘         └─────────────┘
                                     │
                                     │ fs.watch
                                     ▼
                            ┌──────────────────┐         ┌─────────────┐
                            │  kimi-auth.json  │◀────────│  Chrome     │
                            │  (токены, ids)   │  dump   │  extension  │
                            └──────────────────┘         └─────────────┘
```

### Что происходит под капотом

1. **Расширение** патчит `XMLHttpRequest.prototype`, `fetch`, `WebSocket` в **MAIN world** — перехватывает сетевые вызовы страницы Kimi.
2. **webRequest** в background-сервисе собирает заголовки и тела запросов, включая `ChatService/Chat` и `ListMessages`.
3. При **«Снять дамп»** — всё собирается в JSON: cookies, localStorage, токены, сетевые запросы.
4. **`extract-kimi-auth.js`** парсит дамп: достаёт `access_token`, `refresh_token`, `chat_id` из URL вкладки, `parent_id` из `ListMessages.start_message_id`.
5. **`kimi-proxy.js`** — держит токен свежим, шлёт Connect-RPC запросы к Kimi в 5-байтовом envelope, парсит стрим и отдаёт в OpenAI-формате.
6. **Автообновление `parent_id`** — после каждого ответа Kimi возвращает новый `message_id`, прокси записывает его и использует при следующем запросе.

---

## Структура репозитория

```
km-cht/
├── kimi-dumper/              # Chrome-расширение
│   ├── manifest.json         # MV3, без debugger
│   ├── background.js         # cookies, localStorage, webRequest
│   ├── content.js            # патч прототипов XHR/fetch/WS (MAIN world)
│   ├── content-bridge.js     # ISOLATED-world мост
│   ├── popup.html/js         # UI попапа
│   └── icons/
│
├── kimi-proxy/               # Node.js-сервер
│   ├── kimi-proxy.js         # главный сервер
│   ├── extract-kimi-auth.js  # парсер дампа
│   ├── update-auth.sh        # обёртка
│   ├── start-kimi.sh         # запуск в фоне
│   ├── stop-kimi.sh
│   ├── status.sh             # статус + health + логи
│   └── README.md
│
├── README.md                 # этот файл
└── LICENSE
```

---

## FAQ

<details>
<summary><b>Это безопасно?</b></summary>

Да, но с оговорками:

- Токены **никогда не покидают твой телефон** — всё лежит в `kimi-auth.json` локально.
- Расширение **не отправляет данные никуда**, кроме локального скачивания файла.
- Единственное соединение — между твоим телефоном и `kimi.ai`. Ровно то же, что делает браузер.
- **Не публикуй** `kimi-auth.json` и дампы в интернете — там живые токены твоего аккаунта.
</details>

<details>
<summary><b>Почему только <code>k2d6-chat</code>?</b></summary>

Kimi часто переименовывает модели. На момент написания рабочая модель — `k2d6-chat`. В прокси встроен fallback: любое имя модели автоматически подменяется на актуальную. Обновление — одна строка в `kimi-proxy.js` (переменная `AVAILABLE_MODELS`).
</details>

<details>
<summary><b>Клиент возвращает пустой ответ, что делать?</b></summary>

Проверь лог:

```bash
tail -n 30 ~/km-cht/kimi-proxy/proxy.log
```

Ищи строку `[kimi] response: content=X`. Если `X = 0`:
- модель не в списке `AVAILABLE_MODELS` (должна подменяться на `k2d6-chat`)
- чат пустой (нет `parent_id`)
- токен отозван (`[auth] refresh failed`)

Если `X > 0`, но клиент показывает пусто — пришли лог, разберёмся.
</details>

<details>
<summary><b>Прокси не отвечает на <code>localhost:5001</code></b></summary>

```bash
pgrep -f kimi-proxy.js
```

Если пусто — прокси не запущен: `cd ~/km-cht/kimi-proxy && ./start-kimi.sh`.
Если PID есть — проверь `curl http://localhost:5001/v1/health`. Если не отвечает, смотри `proxy.log`.

**Kai 9000 в другом приложении?** Тогда `127.0.0.1` не сработает — запусти прокси с `HOST=0.0.0.0` и указывай IP телефона:

```bash
HOST=0.0.0.0 nohup node kimi-proxy.js > proxy.log 2>&1 &
ifconfig | grep inet
```
</details>

<details>
<summary><b>Можно создавать новые чаты?</b></summary>

На текущей версии — нет. Прокси пишет в тот же `chat_id`, что был в дампе. Для нового чата — открой его в браузере, отправь сообщение, снять новый дамп. Kimi использует кастомный формат xid, воспроизвести его с нуля — отдельная задача.
</details>

<details>
<summary><b>Как это вообще работает технически?</b></summary>

Kimi использует протокол **Connect-RPC** поверх HTTP с 5-байтовым бинарным префиксом перед каждым JSON-фреймом. Запросы идут из Web Worker, поэтому обычные хуки на `window.fetch` их не ловят — расширение патчит прототипы XHR/fetch и работает в MAIN world. Все детали — в разделе **Архитектура**.
</details>

---

## Roadmap

- [ ] Свой xid-генератор — создание новых чатов без браузера
- [ ] Мульти-чат: `chat_id` в теле запроса
- [ ] Поддержка вложений (изображения, файлы)
- [ ] Веб-панель управления
- [ ] Docker-образ

---

## Ограничения

- Только **Android + Termux** (можно и на Linux/macOS, но скрипты заточены под Termux)
- Требуется **браузер с поддержкой расширений** (Chrome, Kiwi, Titanium)
- **Не для продакшена** — один пользователь, один аккаунт, один прокси
- Может перестать работать при изменениях на стороне Kimi

---

## Лицензия

[MIT](LICENSE) — делай что хочешь, только не жалуйся если что-то сломается.

---

<div align="center">

**Если проект оказался полезен — поставь ⭐ на GitHub.**

Сделано для тех, кто хочет использовать Kimi из своего любимого клиента.

</div>
