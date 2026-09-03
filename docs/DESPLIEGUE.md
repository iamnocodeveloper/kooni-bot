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

### 2.1 Subdominio workers.dev (error 10063)

Cloudflare exige que tu cuenta tenga un **subdominio `workers.dev`** para poder
publicar workers (la URL final es `<worker>.<tu-subdominio>.workers.dev`). Se crea
**una sola vez por cuenta**. Si falta, el deploy falla con:

```
[ERROR] You need a workers.dev subdomain in order to proceed. [code: 10063]
```

**Ya está automatizado**: el CLI (`npx kooni-bot` v0.2.14+) y los instaladores
(`scripts/kooni-init.sh` / `kooni-init.ps1`) detectan el error 10063, **crean el
subdominio solos** reutilizando tu sesión OAuth de wrangler y **reintentan el
deploy** automáticamente. No tienes que hacer nada.

**Manual (fallback, 1 min):**

1. Abre https://dash.cloudflare.com/?to=/:account/workers-and-pages
2. Junto a **"Your subdomain"** clic en **Change**
3. Escribe un nombre corto y único (ej. `kooni`) → guarda
4. Reintenta el deploy (`npx kooni-bot deploy` o `pnpm run deploy`)

**Con API token (alternativa):** crea un token en
https://dash.cloudflare.com/profile/api-tokens con permiso **Workers Scripts → Edit**
y corre:

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/subdomain" \
  -H "Authorization: Bearer <TU_TOKEN>" -H "Content-Type: application/json" \
  -d '{"subdomain":"kooni"}'
```

(El `<ACCOUNT_ID>` está en `npx wrangler whoami`.)

> ⚠️ **Error 9109 / "Invalid access token":** si el deploy responde así, tu sesión
> OAuth de wrangler quedó invalidada (por ejemplo, tras un segundo `wrangler login`
> que rota el token). Corre `npx wrangler login` de nuevo para renovarla.

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

### 4.1 Cambiar / restablecer contraseñas y secrets

> Los secrets de Cloudflare **no se pueden leer de vuelta** (solo sobrescribir o
> borrar). Todos los `secret put` aplican **al instante, sin redeploy** (el worker
> los lee en cada request). Siempre corre los comandos **dentro de la carpeta del
> bot** (`cd <carpeta-del-bot>`), con la sesión de wrangler activa (`wrangler
> whoami` para comprobarla; `wrangler login` si hace falta).

**Contraseña del panel `/admin` (usuario `admin`)** — la que pides aquí es la nueva:

```bash
npx wrangler secret put DASHBOARD_PASSWORD
```

(Se pega en la entrada oculta y listo. Para probar: entra a `<worker>/admin` con
`admin` + la nueva. Si también quieres sincronizar el dev local, edita la línea
`DASHBOARD_PASSWORD=` en `.dev.vars`.)

**Llave del cerebro (IA):**

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # Claude
npx wrangler secret put OPENAI_API_KEY      # ChatGPT / AIsa / Gateway
npx wrangler secret put XAI_API_KEY         # Grok / MiniMax
```

**Canales:**

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN            # Telegram
npx wrangler secret put ZERNIO_API_KEY                # Zernio (IG, FB, X, TG, WhatsApp…)
npx wrangler secret put TWILIO_ACCOUNT_SID            # WhatsApp — Twilio
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_WA_FROM
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID      # WhatsApp — Meta Cloud API
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put META_PAGE_ACCESS_TOKEN        # Instagram + Messenger (Meta)
npx wrangler secret put META_VERIFY_TOKEN
npx wrangler secret put META_APP_SECRET
npx wrangler secret put MANYCHAT_API_KEY              # ManyChat
```

**Avisos al dueño (handoff):**

```bash
npx wrangler secret put OWNER_TELEGRAM_CHAT_ID        # DM de Telegram (recomendado)
npx wrangler secret put RESEND_API_KEY                # correo
npx wrangler secret put OWNER_EMAIL
npx wrangler secret put OWNER_WA_NUMBER               # WhatsApp DM (Pro)
```

**Ver qué secrets existen** (solo nombres, nunca valores):

```bash
npx wrangler secret list
```

**Borrar un secret** (ej. desactivar un canal):

```bash
npx wrangler secret delete TELEGRAM_BOT_TOKEN
```

**Varios a la vez** desde un JSON (no lo commitees):

```bash
npx wrangler secret bulk secrets.json
```

**Dev local:** los secrets locales viven en `.dev.vars` (fuera de git). El valor
que pongas ahí es el que usa `wrangler dev` — el remoto manda en producción.

### 4.2 Licencia Pro en el instalador (correo + código)

Desde `kooni-bot` v0.2.16, `init` **pide siempre el correo del dueño** (registra
la instalación en el panel de licencias — gratis o paga — y es el canal de
contacto/renovación) y pregunta si el bot será **Pro con licencia**: si el usuario
pega un código `KOONI-PRO-…`, se valida localmente (HMAC) y se activa al terminar
la instalación (se guarda en `settings → pro_license`, igual que pegarlo en el
panel). Con `--yes` para agentes/CI: `--email <correo> --license <código>`.

### 4.3 Métricas del sistema (panel de licencias)

Cada bot ya calcula sus métricas (mensajes, conversaciones, mensajes del bot,
canales, leads, contactos…) y su **costo de IA exacto** (tokens × precio del
modelo, ver `src/pricing.ts`). Para verlas agregadas en el panel de licencias
(dashboard del dueño, f5gacw7g.insforge.site → "Estadísticas del sistema"):

- El worker envía el reporte con el **cron nocturno** si tiene la var
  `USAGE_PUSH_URL` apuntando a la función `registrar-uso` (el CLI del dueño la
  estampa en cada instalación).
- También hay trigger manual protegido: `POST <worker>/usage/push` con header
  `X-Reindex-Token: <KB_REINDEX_TOKEN>`.

### 4.4 Marca blanca del panel (revendedores)

El panel `/admin` se puede revender con la marca del revendedor (misma licencia
de permisos, otro nombre/logo/colores) definiendo vars `BRAND_*` en `wrangler.toml`:
`BRAND_NAME`, `BRAND_LOGO_URL`, `BRAND_PRIMARY`, `BRAND_PRIMARY_SOFT`,
`BRAND_ACCENT2`, `BRAND_BG`, `BRAND_PANEL` (sin ellas, se usa la identidad Kooni).
Detalle en `wrangler.toml.example`.

### 4.5 Dominio propio (custom domain)

El bot responde en `<worker>.<cuenta>.workers.dev` por defecto. Para un dominio
propio (ej. `bot.minegocio.com`):

1. En el dashboard de Cloudflare: **Workers & Pages → tu worker → Settings →
   Domains & Routes → Add → Custom Domain** (o `npx wrangler domains add`).
   Cloudflare crea el DNS y el certificado solo (la zona debe estar en tu cuenta).
2. Actualiza `DASHBOARD_BASE_URL` en `wrangler.toml` con el dominio nuevo y
   redespliega (`pnpm run deploy`).
3. Opcional: oculta la URL de workers.dev con `workers_dev = false` en
   `wrangler.toml`.
4. Re-registra los webhooks de los canales con la URL nueva (Telegram/Zernio los
   actualiza desde el panel → Conexiones; Twilio/Meta: ver §8).

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
BOT_TIER = "pro"               # free | pro — SOLO informativo desde v2; para desbloquear insights,
                                # costos, campañas… activa una licencia en /admin/licencia (§4.6)
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

### MercadoLibre — preguntas + mensajería post-venta (gratis)

La IA responde las **preguntas de tus publicaciones** y los **mensajes post-venta**
con el comprador. Cada bot usa **su propia app** (gratis) creada en la cuenta de
vendedor — no hay app central. **Todo se conecta desde el panel** (`/admin/conexiones`
→ tarjeta MercadoLibre), sin `wrangler secret put` ni redeploy.
Guía completa: `skill/references/channel-setup-guides/mercadolibre-oauth.md`

1. Entra a **developers.mercadolibre.com** con la cuenta de MercadoLibre del dueño
   (necesita 2FA activado) → **Crear aplicación**.
2. **URI de redirect (redirect_uri):** `<WORKER_URL>/webhooks/mercadolibre/oauth`
3. **Notificaciones (callbacks):** `<WORKER_URL>/webhooks/mercadolibre` y activa los
   tópicos **`questions`** y **`messages`**.
4. Permisos (scopes): **read**, **write**, **offline_access**.
5. Copia el **App ID** y la **Secret Key**, y en el panel: elige el país, pégalos,
   **Guardar datos** → **Autorizar con MercadoLibre** (el dueño inicia sesión y
   acepta). La tarjeta se pone verde.

Notas:
- MercadoLibre **no firma** los webhooks: solo manda un puntero al recurso. Kooni
  valida que el `user_id` sea el del vendedor conectado y va a buscar el contenido
  con su token.
- El token de acceso dura ~6 h y **se refresca solo**. El refresh token dura 6
  meses; si el bot queda inactivo más tiempo, hay que volver a **Autorizar**.
- Las **preguntas** son públicas: MercadoLibre prohíbe compartir datos de contacto
  o links externos en la respuesta. La mensajería post-venta es más flexible.

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

Con el CLI (recomendado):

```bash
npx kooni-bot update           # una instalación (o te pregunta cuál)
npx kooni-bot update --all     # TODAS las instalaciones registradas en esta máquina
```

Cada instalación tiene un `uid` único y su propio Worker/D1/Vectorize, así que
`update --all` actualiza cada una por separado sin cruzar datos.

Manual (por `git`, dentro de la carpeta del bot):

```bash
git fetch upstream main && git merge upstream/main --no-edit -X theirs
pnpm install
pnpm db:apply:remote     # si cambió src/db/schema.sql
pnpm run deploy
```

## 13. Licencias por instalación

Cada código `KOONI-PRO-...` puede ligarse a una instalación concreta (su `uid` de
6 caracteres). Para generarlo por instalación:

```bash
npx tsx scripts/gen-license.ts --privkey <clave privada Ed25519> --kind lifetime --inst <uid>
```

Ese código solo funciona en la instalación con ese `uid`; si lo pegas en otra, el
panel lo rechaza. El `uid` está en el marker `.kooni-bot.json` de cada instalación
y en su `wrangler.toml` (`BOT_INSTANCE_ID`).

---

## Troubleshooting rápido

| Error | Fix |
|---|---|
| `You need a workers.dev subdomain [code: 10063]` | La cuenta no tiene subdominio. Automático en el CLI/instaladores; manual: §2.1 (dashboard o API token) |
| `Invalid access token [code: 9109]` | Sesión OAuth de wrangler invalidada → `npx wrangler login` |
| `Missing binding DB / KB / CATALOG` | El recurso no existe: créalo (paso 3) y verifica `wrangler.toml` |
| `D1 create ... already exists` | Copia el `database_id` real de `npx wrangler d1 list` |
| Webhook de Telegram responde 404 | Verifica la URL completa `<WORKER_URL>/webhooks/telegram` |
| Panel no abre / 401 | ¿`DASHBOARD_PASSWORD` seteado? ¿`DASHBOARD_PUBLIC` accidentalmente en "1"? |
| El bot no responde | ¿Secret del proveedor de IA seteado? `npx wrangler secrets list` |

Lista completa: `skill/references/troubleshooting.md`.
