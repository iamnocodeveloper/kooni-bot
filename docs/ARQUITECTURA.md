# Kooni — Arquitectura

> Documentación técnica del bot Kooni: piezas, flujo de un mensaje, base de datos,
> canales, panel y extensiones. Para el *cómo desplegar* ver
> [`DESPLIEGUE.md`](./DESPLIEGUE.md); para el día a día, [`USO.md`](./USO.md).

---

## 1. Resumen

Kooni es un **Cloudflare Worker** (framework **Hono**) que recibe mensajes de varios
canales (WhatsApp, Instagram, Messenger, Telegram), los procesa con un agente
(**Durable Object**) que usa tu **llave de IA** para responder, y guarda todo en la
base de datos (**D1**, SQLite) de tu cuenta. Incluye un **panel de administración**
en `/admin` con autenticación y una **base de conocimiento** vectorial (Vectorize)
para responder con tus propios documentos.

```
                      ┌──────────────────────────────────────────────┐
   WhatsApp/Twilio ──►│                                              │
   WhatsApp/Meta  ──►│           KOONI (Cloudflare Worker)          │
   Instagram/Meta ──►│  Hono: /webhooks/* → Durable Object (agente)  │
   Messenger/Meta ──►│        │                                      │
   ManyChat       ──►│        ├─► KB (Vectorize, bge-m3)  [RAG]      │
   Telegram       ──►│        ├─► LLM (Anthropic/OpenAI/xAI)         │
                      │        ├─► D1 (conversaciones, leads, ...)   │
                      │        └─► R2 (media, catálogo)              │
                      │                                              │
                      │  /admin  → panel (Basic Auth)                │
                      │  /api/*  → endpoints de conteos (opcional)   │
                      └──────────────────────────────────────────────┘
```

**Dependencias principales** (ver `package.json`):

| Paquete | Rol |
|---|---|
| `hono` | Framework HTTP del Worker (rutas, middlewares) |
| `ai` + `@ai-sdk/anthropic|openai|xai` | Vercel AI SDK — capa de LLM |
| `agents` | SDK de Cloudflare Agents (Durable Objects + RPC) |
| `@anthropic-ai/sdk` | Cliente directo de Anthropic (insights, análisis) |
| `zod` | Validación de payloads |
| `resend` | Correos de handoff (avisos al dueño) |

---

## 2. Piezas del código (`src/`)

| Archivo / carpeta | Qué es |
|---|---|
| `src/index.ts` | Worker principal: rutas de webhooks por canal, `/health`, `/kb/reindex`, monta `/admin` y `/api`. |
| `src/agent.ts` | `SupportAgent` (Durable Object): buffer de mensajes, contexto, tools, genera respuestas. |
| `src/env.ts` | Tipos de `Env`: bindings, vars y secrets (fuente de verdad de configuración). |
| `src/config.ts` | Tier (free/pro), tools y tabs Pro, buffer de segundos. |
| `src/llm/provider.ts` | Selección de proveedor/modelo (fast/smart) y llamadas de chat. |
| `src/channels/` | Adaptadores por canal: `telegram`, `twilio` (WhatsApp), `meta` (IG+Messenger), `manychat`, `whatsapp` (Cloud API), `shared`. |
| `src/tools/` | Herramientas del agente: `searchKb`, `handoffHuman`, `captureLead`, `scheduleAppointment`, `catalogQuery`, `pauseBot`, `snoozeUser`. |
| `src/kb/` | Documentos de la base de conocimiento (chunking + indexado a Vectorize). |
| `src/db/` | Cliente D1 y capas por tabla (conversations, messages, leads, tickets, settings, insights, magicLinks, adminEmails, suggestions…). |
| `src/admin/` | Panel: auth (magic links + Basic Auth), rutas y vistas (`layout.ts` = shell + tema). |
| `src/niches/` | Packs por giro (`types.ts`, `index.ts`, `generico.ts`). Re-etiquetan el panel y aportan playbook. |
| `src/crons/` | Trabajos nocturnos (purga de mensajes >90 días, insights, flywheel, reporte al dueño). |
| `src/flywheel/` | Mejora automática: detecta huecos de conocimiento y propone entradas de KB/lecciones. |
| `src/insights/` | Analizador de conversaciones (Haiku): sentimiento, resolución, oportunidad de venta. |
| `src/followup/` | Seguimiento automático (un follow-up por conversación, con candado anti-duplicado). |
| `src/campaigns.ts` | Difusiones y segmentación (intereses/objeciones). |
| `src/spam.ts` | Filtros anti-spam. |
| `src/budget.ts` | Tope de presupuesto mensual de IA. |
| `src/media/` | Transcripción de audio (Workers AI) y descripción de imágenes (visión). |
| `src/integrations/calcom.ts` | Agenda real con Cal.com (disponibilidad + reserva). |
| `src/watchdog.ts` | Salud del agente / auto-recuperación. |

---

## 3. Flujo de un mensaje

1. **Entrada.** El canal llama al webhook (`/webhooks/telegram`, `/webhooks/twilio`,
   `/webhooks/meta`, `/webhooks/manychat`, `/webhooks/whatsapp`).
2. **Adaptador.** `src/channels/*` normaliza el payload a un mensaje interno
   (canal, id de usuario, texto, audio/imagen si aplica).
3. **Agente.** Se obtiene el Durable Object de la conversación (`AGENT`) y se le
   pasa el mensaje (`stub.ingest()`). El agente:
   - espera el **buffer** (`BUFFER_SECONDS`, default 15s) para juntar mensajes;
   - arma el **contexto**: datos del negocio (system prompt), memoria del cliente
     (`customer_facts`), resultados de búsqueda en la KB (`searchKb`);
   - llama al **LLM** (fast por defecto; sube a smart si la conversación lo amerita);
   - ejecuta **tools** si el modelo decide (capturar lead, agendar, handoff…).
4. **Salida.** El adaptador envía la respuesta por el canal correspondiente
   (Telegram API, Twilio WhatsApp API, Graph API de Meta, ManyChat).
5. **Persistencia.** Todo se guarda en D1 (mensaje, tokens usados para costos).
6. **Post-proceso.** Cuando la conversación queda inactiva: insights (Haiku),
   posible handoff al dueño, y sugerencias de mejora (flywheel).

---

## 4. Base de datos (D1) — `src/db/schema.sql`

| Tabla | Contenido |
|---|---|
| `conversations` | Una fila por (canal, usuario). Última actividad, pausas, ticket abierto. |
| `messages` | Mensajes con rol, tokens, modelo usado. Se **purgan a los 90 días**. |
| `leads` | Prospectos: nombre, contacto, intención, notas, status, `metadata` JSON del nicho. |
| `tickets` | Escalaciones a humano: categoría, resumen, transcripción. |
| `kb_docs` | Documentos de conocimiento editables (se indexan a Vectorize al guardar). |
| `conversation_insights` | Análisis por conversación (sentimiento, resolución, bot_score, oportunidad de venta). |
| `customer_facts` | Memoria por cliente (hechos deducidos, inyectados en el contexto). |
| `improvement_suggestions` | Propuestas del flywheel (entradas KB / lecciones), revisables en el panel. |
| `followup_sends` | Candado anti-doble-follow-up por conversación. |
| `settings` | Overlay key/value editado desde el panel (sin redeploy). |
| `admin_emails`, `magic_links` | Autenticación del panel (magic links por email). |
| `tracked_links`, `keyword_hits`, `conv_labels`, `template_sends` | Segmentación y campañas. |

**Migraciones:** `pnpm db:apply:remote` aplica `schema.sql` en la nube (idempotente).

---

## 5. Canales y secrets

| Canal | Webhook | Secrets necesarios |
|---|---|---|
| Telegram | `/webhooks/telegram` | `TELEGRAM_BOT_TOKEN` (se conecta desde el panel) |
| WhatsApp (Twilio) | `/webhooks/twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WA_FROM` |
| WhatsApp (Cloud API Meta) | `/webhooks/whatsapp` | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |
| Instagram + Messenger (Meta oficial) | `/webhooks/meta` | `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN` (+ `INSTAGRAM_*` si IG Login standalone) |
| ManyChat (IG/WA/Messenger) | `/webhooks/manychat` | `MANYCHAT_API_KEY` |
| Zernio (unificado: IG/FB/X/TG/WhatsApp/Bluesky/Reddit…) | `/webhooks/zernio` | `ZERNIO_API_KEY` (+`ZERNIO_WEBHOOK_SECRET`; se conecta desde el panel) |

Telegram y Zernio se conectan desde `/admin/conexiones` pegando el token/API key: se
guardan en D1 (`settings`) y el canal se pone verde sin `wrangler secret put` ni
redeploy. Cada card muestra su webhook URL (con botón copiar) — aunque
`DASHBOARD_BASE_URL` esté vacío, se usa el origin real del request.

**Avisos al dueño (handoff):** `OWNER_TELEGRAM_CHAT_ID` (DM de Telegram, default),
`RESEND_API_KEY` + `OWNER_EMAIL` (correo), `TWILIO_HANDOFF_CONTENT_SID` +
`OWNER_WA_NUMBER` (WhatsApp, Pro).

**Guías detalladas:** `skill/references/channel-setup-guides/`.

---

## 6. Panel `/admin`

- **Auth:** magic link por email (`admin_emails` + `magic_links`) y/o Basic Auth
  (`DASHBOARD_PASSWORD`, usuario `admin`). `DASHBOARD_PUBLIC="1"` lo deja público
  (no recomendado).
- **Shell:** `src/admin/views/layout.ts` — sidebar 248px, tema Kooni
  (tinta `#0d1218` + teal `#2dd4bf`, Space Grotesk + JetBrains Mono, scanlines,
  brutalista). El contrato visual completo: `docs/design-system.md`.
- **Vistas:** Resumen, Conversaciones, Leads, Tickets, Campañas, Flujo, Conocimiento
  (KB), Mejoras, Conexiones, Configuración, Insights, Estadísticas, Costos.
- **Tier:** decidido por una **licencia Pro** (`KOONI-PRO-V2-…`, firma Ed25519,
  `/admin/licencia`) — `BOT_TIER` en `wrangler.toml` es solo informativo desde la
  migración v2. En free se ocultan Insights/Estadísticas/Costos/Mejoras/Campañas
  y `catalogQuery` (`scheduleAppointment` no está gateado). El panel no tiene CTA
  de venta (uso interno).
- **Nicho:** `BOT_NICHE` selecciona el niche pack (re-etiqueta "Leads" → ej.
  "Reservaciones" y agrega playbook/columnas). El pack `generico` es el default.

---

## 7. Nichos (`src/niches/`) — cómo crear uno propio

Un niche pack (`NichePack`) define: id, nombre, playbook (instrucciones al agente),
`navLabel`/`navIcon` (re-etiqueta del tab Leads) y columnas del panel.

```ts
// src/niches/restaurante.ts (ejemplo)
import type { NichePack } from "./types";
export const restaurante: NichePack = {
  id: "restaurante",
  name: "Restaurante",
  playbook: "Maneja reservaciones, menú y tiempos. Pregunta fecha, hora y personas.",
  navLabel: "Reservaciones",
  navIcon: "calendar-check",
  leadColumns: ["nombre", "fecha", "hora", "personas", "notas"],
  // ...
};
```

Luego regístralo en `src/niches/index.ts`:

```ts
import { restaurante } from "./restaurante";
const PACKS: Record<string, NichePack> = { generico, restaurante };
```

y pon `BOT_NICHE = "restaurante"` en `wrangler.toml` (`[vars]`). El dashboard se
re-etiqueta solo; las columnas del nicho se guardan en `leads.metadata` (JSON).

---

## 8. Trabajos programados (cron)

`[triggers] crons = ["0 3 * * *"]` (3am UTC, diario). En ese tick corren:
purga de mensajes >90 días, análisis de insights, flywheel y reporte al dueño.
**No quites ese cron** — sin él los trabajos nocturnos se detienen en silencio
(ver `src/crons/schedule.ts`, `DAILY_CRON`).

---

## 9. Extensiones típicas

- **Nuevo canal:** crea un adaptador en `src/channels/`, una ruta en `src/index.ts`
  y los secrets en `env.ts`. Ejemplo completo ya resuelto: `src/channels/zernio.ts`
  (webhook firmado + `message.received` → agente + `comment.received` → auto-DM).
- **Nueva tool:** archivo en `src/tools/`, regístrala en `tools/index.ts` y
  menciónala en el system prompt del giro.
- **Nuevo giro:** ver §7.
- **Campañas/segmentos:** `src/campaigns.ts` + tablas `conv_labels`,
  `keyword_hits`, `tracked_links`, `template_sends`.
- **Reportes:** skill `/reporte` (consulta D1 y genera un informe mensual).

---

## 10. Seguridad y privacidad

- **Sin telemetría.** El bot no llama a ningún servicio externo salvo los que tú
  conectas (canales, proveedor de IA, Cal.com, Resend). Verificable en `src/`.
- **Secrets cifrados** en Cloudflare (`wrangler secret put`) — nunca en el repo.
- **Panel protegido** (magic links / Basic Auth); `/api/*` cerrado por defecto.
- **Datos** en tu cuenta: D1, Vectorize, R2. Mensajes purgados a los 90 días.
- El texto de la conversación viaja al **proveedor de IA que elegiste** (con tu llave).
