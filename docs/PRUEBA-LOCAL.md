# Kooni — Prueba en modo local (paso a paso)

> Runbook para desplegar Kooni **en tu máquina** (`wrangler dev`) y probarlo de
> punta a punta: infraestructura, panel, canales y un **flujo real de IA**
> (mensaje → respuesta → captura de lead). Verificado en Windows 11.

---

## 0. Cuántos pasos antes de ver tu dashboard

El dashboard se ve al terminar la **Fase 1 (TU PLATAFORMA)**:
~4 sub-pasos (login, recursos, secrets, deploy) y ~10 minutos. Kooni replica
exactamente eso:

| Modo | Pasos | Dashboard |
|---|---|---|
| `kooni-init.ps1 local` | **2 pasos**: 1 config + 2 prueba | panel local al instante (`localhost:8787/admin`) |
| `kooni-init.ps1 deploy` | **6 pasos**: 1 config · 2-6 infra/deploy | **dashboard en vivo al terminar el PASO 6** (`https://kooni-bot-<slug>.workers.dev/admin`) |

> Ejemplo real: `kooni-bot-bot-demo.joeldavidar.workers.dev` — desplegado con
> `kooni-init.ps1 deploy` + fixes (Windows deploy-check, gateway var, R2 opcional).

El instalador te dice en cada paso *"faltan N para ver tu dashboard"* (como el
Resumen de los 6 pasos de deploy:
`PASO 1 config → PASO 2 login → PASO 3 recursos → PASO 4 secrets → PASO 5 migraciones → PASO 6 deploy → 🎉 DASHBOARD`.

## 0b. Instalador interactivo (lo más fácil — `npx kooni-bot init`)

```bash
bash scripts/kooni-init.sh local      # te pregunta todo y prueba local
bash scripts/kooni-init.sh deploy     # te pregunta todo y despliega en Cloudflare
bash scripts/kooni-init.sh config     # solo configura (sin probar/desplegar)
```

El instalador te pregunta (en español, una a la vez): slug, negocio, nombre del
bot, idioma, **plan free/pro**, proveedor de IA + **tu API key (oculta)**,
contraseña del panel y datos del negocio. Escribe por ti `.dev.vars`,
`wrangler.toml` y `member/config.local.ts`. En modo `deploy` además hace el
flujo de Cloudflare (login, D1/Vectorize/R2, secrets, migraciones, deploy y te
da la URL). Lo demás de esta guía es el "por dentro".

## 1. Requisitos

| Pieza | Cómo saber si la tienes |
|---|---|
| Node ≥ 18 | `node -v` |
| pnpm | `pnpm -v` (si falta: `corepack enable pnpm`) |
| Cuenta de IA (una llave) | Anthropic (`sk-ant-…`), OpenAI (`sk-…`) o **cualquier gateway OpenAI-compatible** (AIsa/OpenRouter) |

> **Probar sin llave directa:** este repo se probó con el gateway **AIsa**
> (`OPENAI_API_BASE_URL=https://api.aisa.one/v1` + `OPENAI_API_KEY` de AIsa),
> porque expone los mismos modelos del bot (`gpt-4o-mini`, `gpt-4o`,
> `claude-haiku-4-5`…) con tool calling. Cualquier endpoint OpenAI-compatible
> sirve — es la var `OPENAI_API_BASE_URL` (agregada a `src/llm/provider.ts`).

## 2. Preparar la config local

```bash
cd kooni
pnpm install

# Secrets locales (NUNCA se commitean) — edita .dev.vars:
cp .dev.vars.example .dev.vars
```

En `.dev.vars` deja listo **uno** de estos dos modos:

```ini
# Modo A — llave directa:
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# Modo B — gateway OpenAI-compatible (lo usado en la prueba):
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_API_BASE_URL=https://api.aisa.one/v1
```

Además: `DASHBOARD_PASSWORD` (panel) y `KB_REINDEX_TOKEN`. Opcional:
`TELEGRAM_BOT_TOKEN` (crea un bot con @BotFather) y vars de Zernio.

`wrangler.toml` ya trae valores locales (`kooni-bot-local`, D1 con ID ficticio).

## 3. Arrancar

```bash
# Aplica el esquema a la D1 local (una vez):
npx wrangler d1 execute kooni_db --local --file=src/db/schema.sql

# Levanta el worker (hot-reload):
npx wrangler dev --port 8787
```

Espera a ver `Ready on http://127.0.0.1:8787` (~30-45s la primera vez).

> **Windows:** si el puerto 8787 falla con `bind() #10013`, hay un proceso
> fantasma ocupándolo: `netstat -ano | findstr :8787` → `taskkill /F /PID <pid>`.
> Si workerd crashea, actualiza wrangler: `pnpm add -D wrangler@latest`.

## 3b. Prueba automática (recomendada)

```bash
bash scripts/test-local.sh
```

Corre TODO el checklist solo: preflight, esquema D1, server, `/health`, `/admin`
(401 + dashboard), **flujo de IA real** (mensaje → respuesta → lead en D1),
webhooks Zernio, typecheck y tests. Imprime un reporte `N OK · M FAIL`.
(Requisito: `.dev.vars` con llave de IA real + `DASHBOARD_PASSWORD`.)

## 4. Pruebas manuales (checklist)

### 4.1 Infraestructura
```bash
curl http://localhost:8787/health          # → ok
curl -u admin:TU_PASSWORD -L http://localhost:8787/admin   # → dashboard Kooni
```
En el panel verifica: marca **Kooni**, tema teal, `BOT EN LÍNEA`, secciones
(Resumen, Bandeja, Mi Agente, Análisis).

### 4.2 Flujo de IA real (Telegram webhook)
Simula el mensaje de un cliente (no necesitas Telegram real para probar el
cerebro — el envío fallará solo al final por el token fake, lo que importa es la
respuesta generada y guardada en D1):

```bash
curl -X POST http://localhost:8787/webhooks/telegram \
  -H "Content-Type: application/json" \
  -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":555},"from":{"id":555},"text":"hola, quiero agendar un corte para el sábado"}}'
```

Espera ~15-20s (buffer) y mira la conversación en D1:

```bash
npx wrangler d1 execute kooni_db --local --command \
  "SELECT role, content FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE channel='telegram' AND channel_user_id='555') ORDER BY created_at;"
```

**Qué debes ver (flujo correcto):**
1. El bot hace **una pregunta** (ej. "¿a qué hora te gustaría?")
2. Contestas (`"5pm, me llamo Luis, mi teléfono es 5551234"`)
3. El bot **captura el lead** y dice "el negocio te confirmará"
4. `leads` tiene la fila: `SELECT name, contact, intent, status FROM leads;`

### 4.3 Otros canales (mismos pasos, distinto webhook)
| Canal | POST a | Payload de prueba |
|---|---|---|
| Zernio (DM) | `/webhooks/zernio` | `{"event":"message.received","message":{"direction":"incoming","text":"hola"},"conversation":{"id":"c1"},"account":{"id":"a1"}}` |
| Zernio (comentario→DM) | `/webhooks/zernio` | `{"event":"comment.received","comment":{"postId":"p1","text":"claude"},"account":{"id":"a1"}}` con `ZERNIO_AUTO_DM_KEYWORD=claude` |
| Meta | `/webhooks/meta` | GET de handshake con `hub.verify_token`, luego POST de `messaging` |
| Twilio | `/webhooks/twilio` | form-urlencoded `Body`, `From`, `FromCountry` |

## 5. Dónde está cada dato en local

| Dato | Dónde |
|---|---|
| Base D1 | `.wrangler/state/v3/d1/` (local, no se sube) |
| Secrets | `.dev.vars` (gitignored) |
| Logs del worker | la terminal donde corre `wrangler dev`, o `npx wrangler tail` en remoto |
| Panel | `http://localhost:8787/admin` |

## 6. Verificación del código (antes de cada cambio)

```bash
pnpm typecheck        # sin errores
pnpm test             # 498 tests (73 archivos)
```

## 7. Hallazgos de esta prueba (ya corregidos)

1. **`captureLead` no guardaba campos de giro** → ahora acepta `metadata` (JSON)
   y el panel los muestra como columnas.
2. **Sin Cal.com el bot alucinaba reservas** ("he agendado tu cita" sin agendar)
   → ahora: la tool devuelve guía explícita (`booking_unavailable` + "captura el
   lead") y el prompt inyecta la instrucción "no hay agenda en línea; nunca
   confirmes una cita" cuando Cal.com no está configurado.
3. **Zernio** (multicanal + comentario→DM) integrado como canal adicional.

Detalle de la lógica de flujos: [`FLUJOS.md`](./FLUJOS.md).
