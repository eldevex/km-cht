# km-cht — OpenAI-совместимый прокси для Kimi

Использует твой web-аккаунт на [kimi.ai](https://www.kimi.ai) как обычный OpenAI API.  
Работает с Kai 9000, Open WebUI, Continue, Cline, Roo Code, LM Studio, официальным OpenAI SDK.

---

## Что внутри

| Папка | Назначение |
|---|---|
| `kimi-dumper/` | Расширение Chrome — снимает cookies, localStorage и токены с kimi.ai в JSON-файл |
| `kimi-proxy/` | Node.js-сервер — отдаёт `/v1/chat/completions` в формате OpenAI |

---

## Требования

- Android + [Termux](https://f-droid.org/packages/com.termux/) (из F-Droid, не из Play Store)
- Node.js (`pkg install nodejs`)
- Chrome / Kiwi Browser / Titanium
- Аккаунт на [www.kimi.ai](https://www.kimi.ai)

---

## Установка

### 1. Подготовка Termux

```bash
pkg update && pkg upgrade
pkg install nodejs git
termux-setup-storage
```

### 2. Клонирование

```bash
cd ~
git clone https://github.com/eldevex/km-cht.git
cd km-cht
```

### 3. Установка расширения

1. Открой `chrome://extensions`
2. Включи **Режим разработчика**
3. **Load unpacked** → выбери папку `~/km-cht/kimi-dumper`

### 4. Снятие дампа

1. Открой [www.kimi.ai](https://www.kimi.ai), залогинься
2. Зайди в чат, где уже есть **хотя бы одно сообщение** (не пустой!)
3. Иконка расширения → **Очистить буфер**
4. Отправь в чат любое сообщение, дождись **полного** ответа Kimi
5. Иконка расширения → **Снять дамп** → файл сохранится в `~/storage/downloads/`

### 5. Запуск прокси

```bash
cd ~/km-cht/kimi-proxy
./update-auth.sh ~/storage/downloads/kimi-dump-XXXX.json
./start-kimi.sh
./status.sh
```

В `status.sh` должно быть: `chat_id` и `parent_id` заполнены и **разные**.

---

## Подключение клиентов

| Параметр | Значение |
|---|---|
| Base URL | `http://127.0.0.1:5001/v1` |
| API Key | `sk-kimi` (любой) |
| Model | `k2d6-chat` |

### Проверка

```bash
curl -s http://localhost:5001/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"k2d6-chat","messages":[{"role":"user","content":"привет"}]}' \
  | python3 -m json.tool
```

Должен вернуться JSON с непустым `choices[0].message.content`.

### Python SDK

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:5001/v1", api_key="sk-kimi")
r = client.chat.completions.create(
    model="k2d6-chat",
    messages=[{"role": "user", "content": "привет"}],
    stream=True,
)
for chunk in r:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

---

## Управление

```bash
cd ~/km-cht/kimi-proxy
./start-kimi.sh     # запустить
./stop-kimi.sh      # остановить
./status.sh         # статус + health + последние логи
tail -f proxy.log   # логи в реальном времени
```

### Автозапуск

Добавь в `~/.bashrc`:

```bash
pgrep -f kimi-proxy.js > /dev/null || (cd ~/km-cht/kimi-proxy && ./start-kimi.sh)
```

---

## Обновление токена

`access_token` живёт ~10 минут (обновляется прокси автоматически).  
`refresh_token` живёт ~30 дней — после этого нужен новый дамп.

**Признаки истёкшего refresh-токена:**
- В логе `[auth] refresh failed` или `invalid_grant`
- Клиент отвечает `401`

**Что делать:**

```bash
# 1. Снять новый дамп через расширение (шаги 1-5 выше)
# 2. Прогнать:
cd ~/km-cht/kimi-proxy
./update-auth.sh ~/storage/downloads/kimi-dump-XXXX.json
pkill -f kimi-proxy.js; sleep 1
./start-kimi.sh
```

---

## Решение проблем

**`kimi-auth.json не найден`**  
Не прогнан `update-auth.sh`, либо в дампе нет токенов. Снять новый дамп.

**`chat_id missing` / `parent_id == chat_id`**  
Дамп снят на пустом чате. Открой kimi.ai, зайди в непустой чат, отправь сообщение, дождись ответа, снять новый дамп.

**Ответ пустой (`content: ""`)**  
В логе `[kimi] response: content=0`. Причины: чат пустой, токен отозван, модель не поддерживается. Проверь `tail -n 30 proxy.log`.

**Прокси не отвечает на `localhost:5001`**

```bash
pgrep -f kimi-proxy.js   # если пусто — запусти: ./start-kimi.sh
tail -n 30 proxy.log
```

**Клиент в другом приложении**  
`127.0.0.1` не сработает. Запусти с `HOST=0.0.0.0` и используй IP телефона:

```bash
HOST=0.0.0.0 nohup node kimi-proxy.js > proxy.log 2>&1 &
ifconfig | grep inet
```

В клиенте: `http://192.168.x.x:5001/v1`

---

## Ограничения

- Прокси работает в **одном чате** — том, что был в дампе. Новый чат → новый дамп.
- Создавать новые чаты без браузера нельзя — Kimi использует кастомный формат xid.
- Обновление модели: открой `kimi-proxy.js`, переменная `AVAILABLE_MODELS`.
- Может сломаться при изменениях на стороне Kimi.

---

## Безопасность

- Токены хранятся **только локально** в `kimi-auth.json`. Никуда не отправляются.
- Расширение работает **без** `chrome.debugger`, не открывает внешних соединений.
- Единственное соединение — твой телефон ↔ `kimi.ai`, как в браузере.
- **Никогда не публикуй** `kimi-auth.json` и `kimi-dump-*.json` — там живые токены твоего аккаунта.

---

## ⚠️ Отказ от ответственности

Проект предоставляется **«как есть»**, без каких-либо гарантий.

- Автор **не несёт ответственности** за любые последствия использования: блокировки аккаунта, потерю данных, нарушение условий сервиса Kimi, финансовые потери, утечку токенов.
- Проект **не аффилирован** с Moonshot AI / Kimi. Все товарные знаки принадлежат их владельцам.
- Использование прокси может нарушать пользовательское соглашение kimi.ai. **Ты используешь на свой риск.**
- Автор не отвечает за действия третьих лиц, использующих этот код.
- Перед использованием ознакомься с ToS kimi.ai и убедись, что твой сценарий не нарушает их.
- Для коммерческого использования — согласуй с правообладателем сервиса.

Если не согласен с этими условиями — **не используй проект**.

---

## Лицензия

MIT. См. [LICENSE](LICENSE).
