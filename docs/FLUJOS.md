# Kooni — Agentes, flujos dinámicos y automatizaciones

> **Qué es esto:** la guía para entender — y sobre todo **replicar** — la lógica de
> agentes que responden mensajes DM y **encadenan flujos** (una pregunta → espera →
> otra pregunta → captura → cierra), más las **automatizaciones de contenido**
> (follow-ups, campañas, comentario → DM, mejoras automáticas).
>
> **Principio rector: simplicidad.** No hay máquinas de estados ni builders
> visuales. El flujo lo dirige el **LLM con instrucciones claras + herramientas
> (tools) + historial**. Eso es lo que lo hace barato de mantener y fácil de
> clonar para un giro nuevo.

---

## 1. El modelo mental (30 segundos)

Cada conversación = un **agente por cliente** (Durable Object). El agente:

1. **Junta** los mensajes que llegan (buffer de ~15s) → responde de una vez.
2. **Recuerda** los últimos 20 mensajes → el hilo continúa entre turnos.
3. **Decide con la IA**: texto + tools (guardar lead, agendar, escalar, buscar en KB).
4. **Habla con reglas fijas**: *una pregunta a la vez*, respuestas cortas, escala temprano.

Un "flujo" (ej. captar un lead) NO está programado como pasos rígidos: está
**descrito en el prompt** y la IA lo ejecuta turno a turno usando el historial y
las tools. Simple de escribir, simple de cambiar, simple de clonar.

```
Cliente:  "hola, quiero info"
Bot:      "¡Hola! Claro. ¿Me cuentas qué te interesa?"        ← una pregunta
Cliente:  "corte de pelo para el sábado"
Bot:      "Perfecto. ¿A qué hora te queda mejor?"             ← espera y sigue
Cliente:  "5pm"
Bot:      "Anotado. ¿Me dejas tu nombre para tu cita?"        ← captura estructurada
Cliente:  "María"
Bot:      captureLead(intent="corte sábado 5pm", name="María")  ← tool
          "✓ Listo, María. Te espero el sábado a las 5pm."
```

---

## 2. El ciclo de un turno (por dentro)

```
Webhook (Telegram/Zernio/Meta/Twilio/ManyChat)
   │  POST → /webhooks/<canal>
   ▼
routeToAgent → msg = adapter.parseIncoming()
   │
   ▼
SupportAgent.ingest(msg)                [src/agent.ts]
   ├─ anti-spam (mensaje repetido / tope diario)
   ├─ media: audio → transcripción, imagen → visión (Pro)
   ├─ guarda el mensaje en el buffer
   └─ agenda el alarm 'msg-buffer' (+15s, se re-agenda con cada mensaje)
   │
   ▼  (alarm dispara)
SupportAgent.processBuffer()
   ├─ junta los mensajes del buffer en UN input
   ├─ carga historial (últimos 20) + memoria del cliente (customer_facts)
   ├─ arma el system prompt (negocio + tono + tools + playbook + instrucciones)
   ├─ selecciona modelo (fast / smart según complejidad)
   ├─ LLM loop con tools (máx 6 pasos por turno; failover con backoff)
   ├─ persiste la respuesta (con tokens para costos + tool calls)
   └─ chunk + envía por el adapter del canal
```

**Puntos de control del flujo (configurables):**

| Variable | Default | Qué hace |
|---|---|---|
| `BUFFER_SECONDS` | `15` | Tiempo que espera a juntar mensajes antes de responder |
| `maxChunks` (settings) | — | En cuántos mensajes parte una respuesta larga |
| `interChunkDelayMs` (settings) | humano | Pausa entre mensajes de una respuesta (30ms/carácter) |
| `stopWhen steps >= 6` (código) | 6 | Máx. pasos de tool por turno |
| `modelOverride` (settings) | auto | `auto` / `haiku` (rápido) / `sonnet` (máximo) |
| `monthlyBudgetUsd` (settings) | — | Tope de gasto mensual de IA (al llegar, baja a modelo barato) |

---

## 3. Los 4 patrones de flujo (ya funcionan)

### Patrón A · Conversacional (pregunta → espera → pregunta)
Es el default. El prompt exige **"una pregunta a la vez"** y respuestas de 2-4
oraciones. El flujo nace solo: el bot guía, espera tu respuesta, y encadena.
*Úsalo para: calificar, dar info, soporte.*

### Patrón B · Captura de lead estructurada (`captureLead`)
El bot pide los datos **uno a uno** y, cuando los tiene, llama `captureLead`.
Queda en la tabla `leads` y aparece en el panel → **Bandeja → Leads**.
Campos: `name`, `contact`, `intent`, `notes` + **`metadata`** (campos del giro —
fecha/hora/personas, presupuesto/zona…, se muestran como columnas en el panel).
*Úsalo para: cotizaciones, reservas, interesados.*

### Patrón C · Agendar cita (`scheduleAppointment` + Cal.com)
El bot consulta **disponibilidad real** en Cal.com y reserva. Sin Cal.com
configurado, registra la cita para que el dueño la confirme.
*Úsalo para: citas, turnos, consultas.*

### Patrón D · Escalar a humano (`handoffHuman` + `pauseBot`)
Cuando el bot no puede resolver (o el cliente pide humano) crea un **ticket** y
avisa al dueño (Telegram DM / correo / WhatsApp). El dueño responde desde el
panel y el bot queda pausado 1h.
*Úsalo para: quejas, billing, casos delicados.*

> **Regla de oro del flujo:** el bot **nunca** manda un formulario de 4 campos
> juntos. Una pregunta, espera, siguiente. Esto lo garantiza el system prompt
> (regla #2 de `core_principles`), no código.

---

## 4. Cómo crear un flujo propio (3 niveles, de fácil a completo)

### Nivel 1 — Solo con el panel (sin código, 2 minutos)
**Configuración → reglas del negocio** (campo de instrucciones). Escribe el flujo
en español normal; el prompt lo incorpora tal cual:

```
Cuando alguien pida cotización, sigue este flujo:
1. Pregunta qué producto o servicio necesita.
2. Pregunta cantidad.
3. Calcula el total con los precios de la KB (usa searchKb si dudas).
4. Pide nombre y teléfono y guarda el lead con captureLead (intent = cotización).
5. Despídete. Si pide descuento, escala con handoffHuman.
```

### Nivel 2 — Prompt del negocio (`member/system-prompt.local.ts` / `customInstructions`)
Igual que Nivel 1 pero con lógica más larga o condicional. Se conserva en los
updates (carpeta `member/`).

### Nivel 3 — Niche pack (flujo + panel a la medida, 1 archivo)
`src/niches/mi-giro.ts` → registrarlo en `src/niches/index.ts` → `BOT_NICHE =
"mi-giro"` en `wrangler.toml`. El pack define: **playbook** (el flujo en el
prompt), **columnas** del panel (leídas de `lead.metadata`), etiquetas y tono.

```ts
// src/niches/restaurante.ts
import type { NichePack } from "./types";
export const restaurante: NichePack = {
  id: "restaurante",
  recordSingular: "Reservación", recordPlural: "Reservaciones",
  navLabel: "Reservaciones", navIcon: "calendar-check",
  kpiLabel: "Reservaciones captadas",
  statusLabels: { new: "Nueva", contacted: "Confirmada", sold: "Completada", lost: "Cancelada" },
  columns: [
    { key: "fecha", label: "Fecha" },
    { key: "hora", label: "Hora" },
    { key: "personas", label: "Personas" },
  ],
  playbook: `
Cuando alguien quiera reservar, sigue este flujo:
1. Pregunta fecha.
2. Pregunta hora (muestra las disponibles si las sabes).
3. Pregunta cuántas personas.
4. Guarda la reservación con captureLead, metadata { fecha, hora, personas }.
5. Confirma y despídete.
`,
  defaultTone: "cálido y directo",
  kbDocs: ["menú.md", "políticas.md"],
};
```

### Nivel 4 — Tool nueva (cuando el flujo necesita una acción externa)
Ej. consultar inventario, validar código, hacer un cobro. Receta:

```ts
// src/tools/miTool.ts — copia el esqueleto:
import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";

export function miToolTool(env: Env) {
  return tool({
    description: "Qué hace y CUÁNDO llamarla (para que la IA decida bien).",
    inputSchema: z.object({ dato: z.string().describe("Qué espera") }),
    execute: async ({ dato }) => {
      // lógica… devuelve { ok, message }
      return { ok: true, message: `Procesé ${dato}` };
    },
  });
}
```
Y regístrala en `src/tools/index.ts` (dentro de `buildTools`). La IA la usará
cuando el prompt/playbook se lo pida.

---

## 5. Automatizaciones de contenido (ya integradas)

### 5.1 Follow-up automático (`src/followup/run.ts`)
Un **solo mensaje breve** a quien lo amerita, 3–20h después de la última
respuesta del cliente. Selección **determinista y conservadora**: venta abierta
detectada (Analista) o 4+ mensajes del cliente. Nunca a pausados; **una sola vez
por conversación de por vida** (`followup_sends` como claim anti-duplicado).
El mensaje lo redacta el modelo rápido con la voz del bot.

### 5.2 Campañas por segmento (`src/campaigns.ts` + `src/segments.ts`)
- **Dentro de la ventana de 24h** (últ. mensaje del cliente < 23h): mensaje
  libre (gratis, sin plantilla).
- **Fuera de ventana:** plantilla HSM aprobada (Twilio) con tope diario
  (`WA_DAILY_TEMPLATE_CAP`, default 250).
- **Anti-doble-envío:** claim en `template_sends` con UNIQUE (campaña,
  conversación) — reintentar nunca duplica.
- Segmentos listos: interesados que escribieron "QUIERO" sin clicar, etiquetas de
  interés/objeción (`conv_labels`), keywords (`keyword_hits`).

### 5.3 Comentario → DM automático (Zernio)
`ZERNIO_AUTO_DM_KEYWORD` + mensaje + botón: alguien comenta tu keyword en un post
(IG, TikTok…) → DM privado inmediato con tu recurso. Los DMs posteriores los
contesta la IA. (Ver `skill/references/channel-setup-guides/zernio-webhook.md`.)

### 5.4 Flywheel — el bot mejora solo (`src/flywheel/`)
El Analista detecta preguntas que la KB no respondió (`missed_kb`) y **propone**
entradas de KB o lecciones. El dueño aprueba/descarta en el panel → **Mejoras**.
La lección aprendida se inyecta al prompt (`<lecciones_aprendidas>`).

### 5.5 Cron nocturno (3am UTC)
Purga de mensajes >90 días, análisis de insights (Haiku), flywheel y reporte al
dueño. **No quites ese cron** (ver `src/crons/schedule.ts`).

---

## 6. Receta de replicación (clonar un bot para otro negocio)

1. **Copia el repo** (o usa el mismo) y edita `wrangler.toml`:
   `BOT_NAME`, `BUSINESS_NAME`, `BOT_LANGUAGE`, `BOT_TIER`, `BOT_NICHE`,
   `DASHBOARD_BASE_URL` y el nombre del worker.
2. **Negocio:** `member/config.local.ts` → `businessConfig` (horarios, servicios,
   precios, ubicación, pagos, teléfono, FAQ) + `customFields`.
3. **Flujo:** escribe las reglas en el panel (Nivel 1) o crea un niche pack
   (Nivel 3) si quieres panel a la medida.
4. **KB:** sube documentos en el panel → **Conocimiento** (se indexan solos).
5. **Canales:** Telegram primero (5 min), luego el canal del cliente
   (WhatsApp/Zernio/Meta/ManyChat).
6. **Deploy:** `pnpm db:apply:remote && pnpm run deploy`.

> Cada bot = sus propios recursos (D1, Vectorize, bucket). **Nunca reutilices**
> la D1 de otro bot (mezclaría personas y datos). Nombres únicos por bot.

---

## 7. Hallazgos de la revisión (esta sesión)

| Hallazgo | Estado |
|---|---|
| `captureLead` no guardaba campos de giro → columnas del nicho vacías | ✅ **Corregido**: ahora acepta `metadata` (JSON) que el panel muestra como columnas |
| **Sin Cal.com el bot alucinaba reservas** ("he agendado" sin agendar) | ✅ **Corregido**: la tool devuelve guía accionable (`booking_unavailable` → captureLead) + el prompt inyecta la nota "no hay agenda en línea; nunca confirmes una cita" cuando falta Cal.com |
| Zernio (multicanal + comentario→DM) no existía en el core | ✅ **Agregado** (adapter + guía) |
| Buffer/rescate de alarmas perdidas (mensaje atrapado 11 min) | ✅ Ya existía el fix en `ingest` |
| Flujos 100% dependientes del LLM (sin estado explícito) | ✅ A propósito: es lo simple/replicable. Documentado aquí |
| Follow-up requiere el Analista activo para detectar ventas | Nota: funciona mejor en tier `pro` (analista de insights) |
| Prueba local con llave vía gateway (sin cuenta directa) | ✅ `OPENAI_API_BASE_URL` en `src/llm/provider.ts` (AIsa/OpenRouter) — ver `PRUEBA-LOCAL.md` |

**Límites conocidos (por diseño):**
- El bot no "recuerda" entre turnos más allá de los últimos 20 mensajes +
  memoria de hechos del cliente. Para flujos largos, las tools guardan estado
  (lead/ticket), no el chat.
- Las campañas envían por el canal del bot (Twilio/WhatsApp). Para difusiones a
  gran escala en otras redes, Zernio amplía el alcance.
- El tope de 6 pasos de tool por turno evita loops; si un flujo necesita más,
  parte en turnos (el bot pregunta y sigue en el siguiente mensaje).

---

## 8. Referencia rápida

| Concepto | Archivo | Nota |
|---|---|---|
| Ciclo del agente (buffer + LLM + tools) | `src/agent.ts` | El corazón |
| Prompt del bot (reglas de flujo) | `src/system-prompt.ts` | "Una pregunta a la vez", estilo, escalación |
| Tools | `src/tools/*` | captureLead, scheduleAppointment, handoffHuman, searchKb… |
| Nichos (flujo + panel por giro) | `src/niches/*` | 1 archivo por giro |
| Follow-up | `src/followup/run.ts` | 1 mensaje, 3–20h, anti-duplicado |
| Campañas/segmentos | `src/campaigns.ts` / `src/segments.ts` | Ventana 24h + plantillas |
| Mejoras automáticas | `src/flywheel/` | KB propuesta por la IA |
| Auto-DM por keyword | `src/channels/zernio.ts` | Comentario → DM con botón |
| Config del negocio | `member/config.local.ts` | Nunca se pisa en updates |
