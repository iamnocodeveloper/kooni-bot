# Bitácora — mejoras y bugs de pruebas con clientes reales

> Registro corrido de lo que se cambia en el sistema (código, prompt, panel) a
> partir de pruebas reales en instalaciones de clientes. Cada entrada: qué se
> observó, qué se cambió, en qué archivos, y cómo se verificó.
>
> El tracker de planes es [`PLAN.md`](../PLAN.md). Las bitácoras por sesión de
> tema puntual (ej. migración de licencias) van en `docs/BITACORA-<fecha>.md`.

---

## 2026-09-01 · v1.14.0 — Instalación de prueba: Joel Araujo (Nocodeveloper)

Instalación: `kooni-bot-joel-nocode-ec53aa`. Origen: pruebas de una campaña real
en Instagram. Tres frentes: el bot no vendía, el CRM perdía mensajes, y no había
app en el celular.

### Mejora 1 — El bot no tenía flujo de venta ni conocía el producto

**Qué se observó (prueba real):** en una interacción de campaña el bot respondió
a tiempo pero se limitó a *"¿quieres que tome tus datos para una cotización?"*.
No calificaba, no explicaba el servicio, no buscaba cerrar. Causa: sin niche
pack, el prompt generado no trae ningún playbook de venta; y el contexto del
negocio tenía datos de demo (`$0`, "todo el día", "ecuador").

**Qué se cambió:**

| Archivo | Cambio |
|---|---|
| `src/niches/agencia-ia.ts` | **Nuevo pack.** Playbook de venta conversacional: responde la duda → **una** pregunta → sigue explicando → captura el dato de a poco con `captureLead` → deriva a WhatsApp para cerrar. Rama de ayuda de instalación. Reglas de handoff. Panel re-etiquetado a "Prospectos" (columnas servicio/plan/canal desde `lead.metadata`). |
| `src/niches/index.ts` | Registra el pack `agencia-ia`. |
| `wrangler.toml` (dev + instalación de Joel) | `BOT_NICHE = "agencia-ia"`. |
| `member/config.local.ts` (instalación de Joel) | Contexto real: planes Kooni ($0 / $39 único / $12 mes), enlace `wa.me`, costo de operar, cómo se instala. |
| `member/kb/*.md` (instalación de Joel) | 4 documentos: qué es Kooni, planes y precios, canales y costos, FAQ. Indexados a Vectorize en el update. |

**Verificación:** `pnpm test` 682/682 · `pnpm typecheck` limpio. Tests nuevos
en `test/niches.test.ts` (pack + inyección al prompt).

### Mejora 2 (bug) — El CRM perdía las respuestas hechas desde la app de Instagram

**Qué se observó (prueba real):** Joel respondió a un cliente desde la app móvil
de Instagram. Esos mensajes **no aparecían** en el hilo del CRM — el historial
quedaba a medias (solo cliente + bot, sin lo que escribió la persona).

**Causa:** Meta manda esos mensajes al webhook como `is_echo`, y Zernio como
`direction: "outgoing"`. Ambos adaptadores los descartaban
(`src/channels/meta.ts:53`, `src/channels/zernio.ts:1146`).

**Qué se cambió:**

| Archivo | Cambio |
|---|---|
| `src/channels/shared.ts` | Campo `ownerEcho` en `IncomingMessage`. |
| `src/channels/meta.ts` | Los `is_echo` con texto salen marcados `ownerEcho`, contra el id del **cliente** (`recipient`), no la Página. |
| `src/channels/zernio.ts` | `direction: "outgoing"` con texto → `ownerEcho`. Direcciones desconocidas se siguen ignorando. |
| `src/agent.ts` | Nuevo `recordOwnerEcho`: guarda el mensaje como `role=owner` (se ve como "Tú" en el CRM), pausa el bot 1h (takeover), y **de-duplica** — si el bot/panel mandó ese mismo texto hace <3 min, es el eco de esa respuesta y se ignora. |
| `src/index.ts` | Los webhooks de Meta y Zernio enrutan `ownerEcho` a `recordOwnerEcho` en vez de `ingest`. |

**Verificación:** `pnpm test` 682/682. Tests nuevos en `test/channels/meta.test.ts`,
`test/channels/zernio.test.ts` (bloque salientes), `test/agent.media.test.ts`
(bloque `recordOwnerEcho`: registra + pausa, de-duplica, ignora vacío).

**Config que hace falta del lado del canal:** en Meta hay que suscribir el campo
`messages` con echoes en la app; Zernio debe reenviar los mensajes salientes.
Si no llegan, verificar con `wrangler tail` que aparezca `[recordOwnerEcho]`.

### Mejora 3 — El panel no se podía usar como app en el celular

**Qué se cambió (PWA Fase 0 — instalable + offline básico):**

| Archivo | Cambio |
|---|---|
| `src/admin/pwa.ts` | **Nuevo.** `manifest.webmanifest` + service worker (network-first para navegaciones, última copia cacheada como respaldo offline) + ícono SVG con la marca. El SW ya trae los handlers `push` / `notificationclick` para la Fase 1. |
| `src/admin/routes.ts` | Rutas públicas `/admin/manifest.webmanifest` · `/admin/sw.js` · `/admin/icon.svg` (antes del guard: el navegador las pide sin cookie; no exponen datos). |
| `src/admin/views/layout.ts` | `<head>` del panel y del login: link al manifest, theme-color, apple-touch-icon, registro del SW. |

**Verificación:** `pnpm test` 682/682. Tests en `test/admin/pwa.test.ts`.

**Pendiente (documentado en `PLAN.md` § Q):** Fase 1 = avisos push con VAPID
(la más valiosa), Fase 2 = lectura offline de datos, Fase 3 = bandeja móvil.

### Ajuste tras revisar la instalación real

El `business_context` en D1 de Joel (2.998 chars) ya define persona = dueño y la
regla explícita *"nunca cierres ventas, canaliza"*. El playbook del niche se
ajustó de "buscar cerrar la venta" a **"asesora → califica → captura → deriva a
WhatsApp para que una persona cierre"**, con una línea que cede ante la
información del negocio si hay conflicto. Los KB de Kooni aclaran que el montaje
es un servicio que se cotiza aparte.

No se tocó el `business_context` de Joel (ya cubre "bots/automatizaciones" en su
lista de servicios). Los KB de Kooni le dan al bot el detalle de planes/precios.

### Despliegue (hecho)

- **Código:** `origin/main` en v1.14.0 (`e013048`).
- **Instalación de Joel** (`kooni-bot-joel-nocode-ec53aa`): `kooni-bot update`
  → v1.13.3 → **v1.14.0**. `schema.sql` remoto aplicado (sin cambios de tabla
  esta versión). `BOT_NICHE = "agencia-ia"` agregado a su `wrangler.toml`. 4 KB
  de Kooni copiados a su `member/kb/`. Deploy OK (Version ID `959e9901…`).
  Reindex de Vectorize disparado a mano (`POST /kb/reindex` → `{"ok":true,"indexed":4}`)
  porque el paso automático del CLI busca `.bot-state.json` y esta instalación
  usa `.kooni-bot.json`.
- **PWA verificada en vivo:** `/admin/manifest.webmanifest`, `/admin/sw.js`,
  `/admin/icon.svg` → 200; el login trae el `<link rel=manifest>` y el registro
  del SW.
- **Aviso conocido (no bloquea):** `deploy-check` marca "OPENAI_API_KEY de
  gateway sin `OPENAI_API_BASE_URL`". Falso positivo — la URL del gateway vive
  en `settings.llm_api_base_url` (D1, panel), no en `wrangler.toml`. El bot ya
  venía funcionando así.
- **CLI/npm:** sin cambios en `cli-kooni/` esta sesión → no hubo publicación en npm.

### Decisión — atribución de campañas: en espera

Se pidió medir el rendimiento de los mensajes de campaña. **Zernio no entrega el
`referral` del anuncio** en su webhook, así que la atribución real (de qué
anuncio viene cada DM) queda a medias. Decisión: **postergar** hasta que la
instalación esté en **Meta oficial** o **ManyChat**, que sí mandan
`messaging.referral` (`source: ADS`, `ads_context_data`, `m.me?ref=` / `ig.me?ref=`).
Plan completo y disparador en `PLAN.md § R`; entrada en el roadmap
(`Siguientes mejoras`, ítem 9).

### Pendiente para Joel (en el panel)

- El bot corre con `model_override = "haiku"` (modelo barato). Si el playbook de
  calificación se siente flojo, subir a `auto` o `sonnet` en Configuración → Modelo.
- Si quiere que el bot mencione el servicio de chatbots de forma más proactiva,
  agregar una línea en Configuración → Información del negocio (su lista de
  servicios hoy dice "automatizaciones (procesos, bots, integraciones)").
