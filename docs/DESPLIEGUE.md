# Kooni — Guía de despliegue

> ✅ **Desplegado en producción:** https://kooni-bot-bot-demo.joeldavidar.workers.dev
> (panel: `/admin`). IA verificada respondiendo con el contexto del negocio.

> Despliegue de cero a **dashboard vivo** en **6 pasos / ~15 min** (lógica de
> La Fase 1 termina con el panel en el navegador) y ~10 min más por canal.
> El instalador `.\scripts\kooni-init.ps1 deploy` hace todo esto numerando los
> pasos y avisándote cuántos faltan.
>
> Resumen: config → login → recursos (D1/Vectorize/R2) → secrets → migraciones → deploy → **panel**. Todo corre en **tu** cuenta de Cloudflare.
> Con Claude Code, el skill `/configurar-mi-chatbot` guía todo esto en 4 fases
> (para personas sin experiencia técnica).

---

## 0. Requisitos

- **Node.js ≥ 18** y **pnpm** (`corepack enable pnpm` si no lo tienes).
- **Cuenta de Cloudflare** (gratis) → https://dash.cloudflare.com/sign-up
- **Llave de IA** (una de):
  - Anthropic: https://console.anthropic.com/api-keys
  - OpenAI: https://platform.openai.com/api-keys
  - xAI (Grok): https://console.x.ai

---

## 1. Clonar e instalar

```bash
git clone <tu-repo-kooni> mi-bot
cd mi-bot
pnpm install
```

## 2. Login de Cloudflare

```bash
npx wrangler login
```

(Abre el navegador; autoriza con "Allow".)

## 3. Crear los recursos

```bash
# Base de datos (conversaciones, leads, config)
npx wrangler d1 create kooni_db
#   → copia el "database_id" de la salida y pégalo en wrangler.toml
#     ([[d1_databases]] → database_id = "tu-id-real")

# Índice vectorial para la base de conocimiento (embeddings bge-m3, 1024 dims)
npx wrangler vectorize create kooni_kb --dimensions=1024 --metric=cosine

# Bucket R2 para media y catálogo
npx wrangler r2 bucket create kooni-bot-catalog
```

> El nombre del Worker (`kooni-bot-<slug>`) lo define `wrangler.toml` →
> `name`. Cambia `<slug>` por un slug corto (ej. `panaderia-luna`). El
> `database_id` real es lo único que se reemplaza a mano.

## 4. Secrets

Los secrets **nunca se commitean**; se guardan cifrados en Cloudflare:

```bash
npx wrangler secret put ANTHROPIC_API_KEY      # o OPENAI_API_KEY (ver paso 6)
npx wrangler secret put DASHBOARD_PASSWORD     # contraseña del panel /admin (usuario: admin)
npx wrangler secret put KB_REINDEX_TOKEN       # protege POST /kb/reindex (genera una cadena larga)
npx wrangler secret put TELEGRAM_BOT_TOKEN     # solo si conectas Telegram (paso 8)
```

## 5. Migraciones + deploy

```bash
pnpm db:apply:remote     # aplica src/db/schema.sql en la nube (idempotente)
pnpm run deploy
```

Al finalizar imprime la **URL del Worker** (ej. `https://kooni-bot-x.<tu-cuenta>.workers.dev`).
Actualiza `DASHBOARD_BASE_URL` en `wrangler.toml` con esa URL y vuelve a
`pnpm run deploy` (para que los enlaces del panel apunten bien).

✅ Tu panel ya vive en: `https://<worker>.workers.dev/admin` (usuario `admin`,
contraseña del paso 4).

## 6. Cerebro del bot (proveedor de IA)

`wrangler.toml` → `[vars]`:

| Proveedor | Var | Default |
|---|---|---|
| Anthropic (Claude) | (omite `LLM_PROVIDER`) | **recomendado** |
| OpenAI (GPT) | `LLM_PROVIDER = "openai"` | — |
| xAI (Grok) | `LLM_PROVIDER = "xai"` | — |

Guarda la llave del proveedor elegido (paso 4). Modelos ajustables con
`ANTHROPIC_MODEL_FAST/SMART` y `OPENAI_MODEL_FAST/SMART`. El bot usa el modelo
**fast** por defecto y sube a **smart** cuando la conversación lo amerita.
Se puede cambiar después desde el panel → **Configuración → Modelo de IA**.

## 7. Identidad del bot

En `wrangler.toml` → `[vars]`:

```toml
BOT_NAME = "Asistente"
BUSINESS_NAME = "Mi Negocio"
BOT_LANGUAGE = "es"            # es, en, pt-BR…
BOT_TIER = "pro"               # free | pro (pro desbloquea insights, costos, campañas…)
BOT_NICHE = ""                 # ej. "restaurante" (ver docs/ARQUITECTURA.md §7)
BUFFER_SECONDS = "15"
```

Y los datos del negocio (horarios, servicios, precios, ubicación, métodos de pago,
FAQ) en `member/config.local.ts` → `businessConfig`. Todo se edita después desde el
panel → **Configuración → Información del negocio** (aplica al instante, sin redeploy).

## 8. Canales (uno por uno)

> Después de cada canal, recarga el panel → **Conexiones**: debe ponerse **VERDE**.

### Telegram (el más rápido, ~5 min)
1. En Telegram, abre **@BotFather** → `/newbot` → nombre + username (termina en `_bot`).
2. Guarda el token: `npx wrangler secret put TELEGRAM_BOT_TOKEN`
3. Registra el webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>/webhooks/telegram"
   ```
   Debe responder `{"ok":true}`.

### WhatsApp — Twilio (escalable, cobra por mensaje)
Guía: `skill/references/channel-setup-guides/twilio-whatsapp.md`
```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_WA_FROM
```
Webhook en Twilio: `<WORKER_URL>/webhooks/twilio`

### WhatsApp — Cloud API de Meta (oficial, sin BSP)
Guía: `skill/references/channel-setup-guides/whatsapp-cloud.md`
```bash
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
```
Webhook en Meta: `<WORKER_URL>/webhooks/whatsapp`

### Zernio — varias redes con una sola api key (IG, FB, X, TG, WhatsApp…)

Con una cuenta de **zernio.com** conectas varias redes con OAuth de un clic y una
sola key. Incluye **comentario → DM automático por keyword** (alguien comenta tu
keyword en un post → el bot le manda DM con mensaje + botón). Guía completa:
`skill/references/channel-setup-guides/zernio-webhook.md`

```bash
npx wrangler secret put ZERNIO_API_KEY
npx wrangler secret put ZERNIO_WEBHOOK_SECRET
# vars en wrangler.toml ([vars]):
# ZERNIO_AUTO_DM_KEYWORD / ZERNIO_AUTO_DM_MESSAGE / ZERNIO_AUTO_DM_BUTTON_URL
```
Webhook en Zernio: `<WORKER_URL>/webhooks/zernio` (eventos: message.received + comment.received)

### Notas de esta instalación (lecciones reales)
- **R2 no habilitado en la cuenta** → el bot funciona sin él (el código no usa
  `CATALOG`); el binding queda comentado en `wrangler.toml`. Habilítalo gratis en
  dash.cloudflare.com → R2 y descomenta cuando quieras.
- **Gateway AIsa** → la llave es del gateway y requiere
  `OPENAI_API_BASE_URL = "https://api.aisa.one/v1"` en `[vars]` (ya está). Si usas
  llave directa de OpenAI, quítala.
- **deploy-check en Windows** → ya corregido (usaba `npx` directo, fallaba con
  `EINVAL` en `.cmd`).

### Instagram + Messenger — Meta oficial (gratis)
Guía: `skill/references/channel-setup-guides/meta-oficial.md`
```bash
npx wrangler secret put META_VERIFY_TOKEN
npx wrangler secret put META_APP_SECRET
npx wrangler secret put META_PAGE_ACCESS_TOKEN
```
Webhook en Meta: `<WORKER_URL>/webhooks/meta` (un solo webhook cubre IG + Messenger)

### Instagram/Messenger/WhatsApp — ManyChat (visual, sin código)
Guía: `skill/references/channel-setup-guides/manychat-webhook.md`
```bash
npx wrangler secret put MANYCHAT_API_KEY
```
External Request en ManyChat: `<WORKER_URL>/webhooks/manychat`

## 9. Avisos al dueño (handoff)

Cuando el bot no puede resolver o el cliente pide humano, avisa al dueño:

| Medio | Secrets |
|---|---|
| **Telegram DM** (recomendado, gratis) | `OWNER_TELEGRAM_CHAT_ID` (el dueño le manda `/start` al bot y usa @userinfobot para ver su id) |
| **Correo** | `RESEND_API_KEY` + `OWNER_EMAIL` |
| **WhatsApp DM** (Pro) | `TWILIO_HANDOFF_CONTENT_SID` + `OWNER_WA_NUMBER` (requiere plantilla aprobada en Twilio) |

## 10. Base de conocimiento (KB)

1. Panel → **Conocimiento → Agregar documento** (FAQ, políticas, descripciones).
   Cada documento se **indexa solo al instante** en Vectorize — sin redeploy.
2. Datos estructurados (horarios, precios): panel → **Configuración →
   Información del negocio** (viven en el system prompt, no en la KB).

## 11. Prueba final

1. Manda un mensaje real al bot (ej. Telegram: "hola"). Debe responder con los
   datos de tu negocio.
2. Panel → **Resumen**: sin badges rojos (≥1 canal conectado, handoff configurado).
3. Guarda el estado: crea `.bot-state.json` con `{ "bot_slug", "worker_url", ... }`
   (lo usa el skill `/actualizar-mi-bot`).

## 12. Actualizaciones

`/actualizar-mi-bot` (skill) trae la última versión del template por `git` sin
perder `member/`, secrets ni datos de D1. Manual:

```bash
git fetch upstream main && git merge upstream/main --no-edit -X theirs
pnpm install
pnpm db:apply:remote     # si cambió src/db/schema.sql
pnpm run deploy
```

---

## Troubleshooting rápido

| Error | Fix |
|---|---|
| `Missing binding DB / KB / CATALOG` | El recurso no existe: créalo (paso 3) y verifica `wrangler.toml` |
| `D1 create ... already exists` | Copia el `database_id` real de `npx wrangler d1 list` |
| Webhook de Telegram responde 404 | Verifica la URL completa `<WORKER_URL>/webhooks/telegram` |
| Panel no abre / 401 | ¿`DASHBOARD_PASSWORD` seteado? ¿`DASHBOARD_PUBLIC` accidentalmente en "1"? |
| El bot no responde | ¿Secret del proveedor de IA seteado? `npx wrangler secrets list` |

Lista completa: `skill/references/troubleshooting.md`.
