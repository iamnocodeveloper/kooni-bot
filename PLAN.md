# PLAN — Kooni: pendientes y próximos pasos

> Estado al día de hoy. Marca ✅ lo hecho, deja lo demás como tarea abierta.
> Las tareas del sitio web viven en `sitio-web/` (uso interno, no se sube).

---

## A. Bugs críticos del bot (HECHO ✅)

| # | Tarea | Estado |
|---|---|---|
| A1 | **Handoff roto**: cliente pidió hablar con humano y no llegó nada. Causa: el bot generó texto vacío (solo tool calls sin texto final) y lo guardó/envió; el handoff nunca se disparó. Fix: guard anti-mensaje-vacío en `agent.ts` + regla de escalación reforzada en `system-prompt.ts` (respuesta afirmativa a "¿quieres hablar con alguien?" → escala). | ✅ |
| A2 | **Bot se detiene al hablar el dueño**: `ingest()` pausaba la conversación 1h por cada mensaje del dueño (owner), y como el dueño escribe en el mismo chat donde prueba, cada mensaje re-pausaba → "en cada mensaje se vuelve a desactivar". Fix: el dueño ya NO pausa; su mensaje se procesa normal. El takeover manual de una conversación de cliente sigue en el panel. | ✅ |
| A3 | Zernio API key guardada como secret (`ZERNIO_API_KEY`). | ✅ |

## B. Conectividad y panel de conexiones (EN PROGRESO)

| # | Tarea | Estado |
|---|---|---|
| B1 | Card de **Zernio (multicanal)** en `/admin/conexiones` con webhook URL lista para copiar. | ✅ |
| B1.5 | **Zernio conectado de verdad**: API key nueva guardada, webhook creado en zernio.com (eventos message.received, comment.received, reaction.received), ZERNIO_WEBHOOK_SECRET guardado, test end-to-end 200 ok. | ✅ |
| B2 | **Conectar canales desde el panel** (sin terminal): formularios en `/admin/conexiones` para pegar tokens (Telegram, Zernio, ManyChat, Twilio…). Guardar en D1 `settings` (SettingsRepo ya existe) con fallback a env. | ⏳ Pendiente |
| B3 | **Activar canal al pegar el token**: al guardar el secret desde el panel, registrar el webhook automáticamente (Telegram: `setWebhook`; Zernio: instrucciones de webhook en la card). | ⏳ Pendiente |
| B4 | Probar el flujo end-to-end: pegar token de Telegram en el panel → canal verde → probar mensaje. | ⏳ Pendiente |

## C. Planes Free/Pro y licencia (EN PROGRESO)

| # | Tarea | Estado |
|---|---|---|
| C1 | Revisar `src/config.ts` (`isPro`, `PRO_ONLY_TOOLS`, `PRO_ONLY_TABS`) — ya existe el gating por `BOT_TIER`. | ✅ |
| C1.5 | **Pro activado en el demo**: `BOT_TIER="pro"` en wrangler.toml → Campañas, Mejoras, Insights, Estadísticas y Costos ya responden sin bloqueo (verificado en vivo). | ✅ |
| C2 | **Sistema de licencia por código**: el dueño activa Pro desde el panel pegando un código de licencia. El código se valida contra una firma (secret `LICENSE_MASTER_KEY` o lista de códigos en D1 `settings`), se guarda y activa `BOT_TIER=pro` en runtime. Vista en el panel: `/admin/licencia`. | ⏳ Pendiente |
| C3 | **Generador de códigos** (para el dueño de la plataforma): script que firma un código con el master key. | ⏳ Pendiente |
| C4 | Upgrade UI: en free, la página `/admin/upgrade` debe ofrecer "pegar tu código de licencia" además del bloqueo visual actual. | ⏳ Pendiente |

## D. Actualizaciones sin perder datos (REVISAR ✅)

| # | Tarea | Estado |
|---|---|---|
| D1 | Verificar regla de oro: `member/` se conserva, `src/` se actualiza, D1 no se borra, secrets no se tocan. Documentado en `skill/actualizar-mi-bot.md` (tabla "Qué se conserva y qué se sobrescribe"). | ✅ |
| D2 | Verificar que `pnpm db:apply:remote` usa `CREATE TABLE IF NOT EXISTS` (no destruye datos). | ✅ |
| D3 | Probar un update real de `upstream` y confirmar que `member/` + datos D1 sobreviven. | ⏳ Pendiente (recomendado antes de ofrecerlo) |

## E. Sitio web / landing de Kooni (USO INTERNO — carpeta `sitio-web/`)

| # | Tarea | Estado |
|---|---|---|
| E1 | Análisis del texto de la landing de Forja (estructura, hooks, copy, números). | ✅ `01-analisis-forja.md` |
| E2 | Arquitectura de secciones propuesta para Kooni. | ✅ `02-arquitectura-landing.md` |
| E3 | Prompts listos para generar la landing con IA (hero, flujo, planes, FAQ, QA de marca). | ✅ `03-prompts-landing.md` |
| E4 | Textos base de Kooni (adaptados de Forja a la marca). | ✅ `04-textos-base.md` |
| E5 | Checklist de marca obligatorio. | ✅ `05-checklist-marca.md` |
| E6 | `sitio-web/` agregado a `.gitignore` (nunca se sube ni se publica). | ✅ |
| E7 | Generar el `index.html` de la landing usando los prompts (cuando quieras — dime y lo genero). | ⏳ Pendiente |
| E8 | Comparación ChatbotX vs OpenReply vs Kooni. | ✅ `06-comparacion-chatbotx-openreply-kooni.md` |
| E9 | Plan de integración de OpenReply en Kooni (matcher, links trackeados, follow gate, dedup, rate limit, logs). | ✅ `07-plan-integracion-openreply.md` |
| E10 | Plan de pausa por canal (global / canal / conversación). | ✅ `08-plan-pausa-por-canal.md` — **IMPLEMENTADO** (v5c57d8c7) |
| E11 | Registro de cambios maestro (bitácora). | ✅ `00-registro-de-cambios.md` |
| E12 | Cuentas conectadas de Zernio visibles en el panel (Conexiones → card Zernio). | ✅ v3eeab932 |
| E13 | Plan de versión previa (limits free/pro, npx CLI, pagos, updates seguros). | ✅ `09-plan-version-previa.md` |

## F. Datos y verificación del incidente de handoff

| # | Tarea | Estado |
|---|---|---|
| F1 | Investigar por qué el cliente real (`telegram:8793443487`) no generó ticket: el bot quedó mudo (mensaje vacío) → fix A1. | ✅ |
| F2 | Re-probar handoff en vivo: mensaje "quiero hablar con una persona" → debe crear ticket + notificar por Telegram. | ⏳ Pendiente (prueba con el dueño) |

## G. Pausa del bot (IMPLEMENTADO ✅)

| # | Tarea | Estado |
|---|---|---|
| G1 | **Pausa global** (`bot_paused`) — pausa todos los canales. | ✅ (ya existía, documentado) |
| G2 | **Pausa por canal** (`paused_channels` JSON) — botón ⏸/▶ en cada card de Conexiones. | ✅ v5c57d8c7 |
| G3 | **Pausa por conversación** (`paused_until`) — takeover/handoff/spam/snooze. | ✅ (ya existía) |
| G4 | Pausa por canal con duración (ej. 2h) + aviso al dueño de mensajes ignorados. | ⏳ Pendiente |

## H. Meta opcional para private replies

| # | Tarea | Estado |
|---|---|---|
| H1 | **Decisión:** Zernio sigue siendo el camino por defecto (fácil, funciona). Meta oficial (META_PAGE_ACCESS_TOKEN etc.) queda como opción alternativa para las replies — NO reemplaza a Zernio. | ✅ Documentado |

## I. Versión previa (limits + npx + pagos) — PLAN en `sitio-web/09-plan-version-previa.md`

| # | Tarea | Estado |
|---|---|---|
| I1 | **Módulo `src/limits.ts`**: límites free (contactos 50, mensajes IA 500/mes, canales 2, reglas 5, DMs 100/mes, links 3) + enforcement fail-open en agent.ts / zernio.ts. | ⏳ Pendiente |
| I2 | **Código de licencia Pro**: script `scripts/gen-license.ts` (HMAC con `LICENSE_MASTER_KEY`) + validación en el panel. Soporta lifetime (expiry vacío) y mensual (expiry embebida). | ⏳ Pendiente |
| I3 | **Banner de límites** en el panel (Resumen: X/Y usados + CTA). | ⏳ Pendiente |
| I4 | **CLI `npx kooni-bot init`**: paquete npm `kooni-bot` (disponible ✓), descarga tarball del repo GitHub público del dueño + instalador + deploy. | ⏳ Pendiente |
| I5 | **`npx kooni-bot update`**: trae versión nueva SIN tocar member/ ni D1. | ⏳ Pendiente |
| I6 | Pruebas internas: instalar limpio, límites, licencia, update sin pérdida. | ⏳ Pendiente |
| I7 | **Precios decididos**: Opción B — lifetime fundador ($29-49, primeros 10-20) + mensual ($9-15) después. Detalle en `sitio-web/10-precios-opciones.md`. | ✅ Decidido |

---

## Orden recomendado de ejecución

1. **Fase 1-2 OpenReply** — matcher avanzado + `{username}` + links trackeados (mayor valor). | ✅ HECHO (v d59c390c)
2. **B2 + B3** — panel de conexiones con tokens (pegar tokens desde `/admin`).
3. **C2 + C3 + C4** — sistema de licencia Pro.
4. **F2** — prueba del handoff con el dueño.
5. **Fases 3-7 OpenReply** — follow gate, dedup, rate limit, logs, plantillas. | 🎉 PLAN COMPLETO (v86b83401): follow gate ✅ + dedup ✅ + rate limit ✅ + logs ✅ + plantillas ✅
6. **E7** — generar la landing con los prompts de `sitio-web/`.
