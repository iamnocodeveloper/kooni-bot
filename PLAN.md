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
| B2 | **Conectar canales desde el panel** (sin terminal): formularios en `/admin/conexiones` para pegar tokens (Telegram, Zernio, ManyChat, Twilio…). Guardar en D1 `settings` (SettingsRepo ya existe) con fallback a env. | ✅ Telegram y Zernio ya tienen formulario en `/admin/conexiones` (commit eef80a8 + posteriores). |
| B3 | **Activar canal al pegar el token**: al guardar el secret desde el panel, registrar el webhook automáticamente (Telegram: `setWebhook`; Zernio: `POST/PUT /v1/webhooks/settings`). | ✅ **Telegram** registra el webhook automáticamente al guardar el token (setWebhook → `<worker>/webhooks/telegram`, allowed_updates=message, con reintentos). **Zernio** también registra el webhook automáticamente (POST/PUT /v1/webhooks/settings con eventos message.received + comment.received + reaction.received y el secret; DELETE al quitar). Además: campo de chat id del dueño en la card Telegram, fix del regex de detección de URL del CLI, y `configuredChannels()` (Mi Agente → Flujo) ahora resuelve Telegram/Zernio desde settings. |
| B4 | Probar el flujo end-to-end: pegar token de Telegram en el panel → canal verde → probar mensaje. | ⏳ Pendiente — en el bot de Joel: re-desplegar (kooni-bot update), guardar el token en el panel y mandar un mensaje. |

## C. Planes Free/Pro y licencia (EN PROGRESO)

| # | Tarea | Estado |
|---|---|---|
| C1 | Revisar `src/config.ts` (`isPro`, `PRO_ONLY_TOOLS`, `PRO_ONLY_TABS`) — ya existe el gating por `BOT_TIER`. | ✅ |
| C1.5 | **Pro activado en el demo**: `BOT_TIER="pro"` en wrangler.toml → Campañas, Mejoras, Insights, Estadísticas y Costos ya responden sin bloqueo (verificado en vivo). | ✅ |
| C2 | **Sistema de licencia por código**: el dueño activa Pro desde el panel pegando un código de licencia. El código se valida contra una firma (secret `LICENSE_MASTER_KEY`), se guarda y desbloquea Pro en runtime. Vista en el panel: `/admin/licencia`. | ✅ |
| C3 | **Generador de códigos** (para el dueño de la plataforma): `scripts/gen-license.ts` local + edge function `generar-licencia` (InsForge) con soporte de ligar a instalación (`instUid`). | ✅ |
| C4 | Upgrade UI: en free, la página `/admin/upgrade` ofrece "pegar tu código de licencia" (link a `/admin/licencia") en vez de la instrucción interna de `BOT_TIER`. | ✅ |
| C5 | **La licencia desbloquea TODO, no solo límites**: antes `isPro()` (BOT_TIER) gateaba tabs/tools/imagen y `isProLicense()` solo límites. Ahora `isProUnlocked()` async unifica: `BOT_TIER=pro` **o** licencia válida → tabs Pro, tools Pro (`catalogQuery`), análisis de imagen del agente, handoff WhatsApp y límites. `layout()`/`renderUpgrade()` pasaron a async. | ✅ (v1.0.2) |

## F. Licencias estilo Forja (email + dispositivo) — PLAN FUTURO ⏳

> Contexto: hoy Kooni valida licencias por **código HMAC local** (sin login). Forja, en
> cambio, pide **login con email** al inicio y **registra la dirección/dispositivo**
> (fingerprint) para ligar la licencia a una máquina. El usuario pidió evaluar replicar
> esa lógica en Kooni (sin copiarla íntegra).

### Qué haría falta (diseño propuesto, NO implementado)

1. **Dashboard de licencias con cuentas** (dueño de Kooni):
   - Tabla `miembros` / reutilizar `profiles` + auth de InsForge.
   - Un cliente compra → se crea cuenta con email → se le emiten N licencias.
2. **Login al inicio del CLI (`kooni-bot init`)**:
   - Pedir email + verificar (link mágico o código) contra el backend de InsForge.
   - El CLI guarda una sesión (`~/.kooni/auth.json`).
3. **Registro de dispositivo**:
   - Al activar, derivar un `machine_id` (hash de hardware o UUID local) y registrarlo.
   - La licencia queda ligada a `machine_id` + `uid` de instalación (ya existe `inst`/`uid`).
4. **Validación en runtime**:
   - El bot consulta (o cachea) la validez contra InsForge vía `CONTROL_PLANE_URL`/`/api/*`.
   - Fallback local HMAC si no hay red (el formato actual se mantiene).

### Alternativa de menor fricción (la que hoy funciona)

- Mantener la licencia **por código HMAC** (ya implementada), y solo **pedir email en el
  check-in** (ya se registra en `instalaciones.email`). El login/dashboard queda para
  cuando se necesite facturar/recurrencia real.

### Estado
⏳ PLAN — no implementar hasta que se confirme la necesidad de recurrencia/facturación.

---

## D. Actualizaciones sin perder datos (REVISAR ✅)

| # | Tarea | Estado |
|---|---|---|
| D1 | Verificar regla de oro: `member/` se conserva, `src/` se actualiza, D1 no se borra, secrets no se tocan. Documentado en `skill/actualizar-mi-bot.md` (tabla "Qué se conserva y qué se sobrescribe"). | ✅ |
| D2 | Verificar que `pnpm db:apply:remote` usa `CREATE TABLE IF NOT EXISTS` (no destruye datos). | ✅ |
| D3 | Probar un update real de `upstream` y confirmar que `member/` + datos D1 sobreviven. | ⏳ Pendiente (recomendado antes de ofrecerlo) |

## E. Sitio web / landing de Kooni (USO INTERNO — carpeta `sitio-web/`)

| # | Tarea | Estado |
|---|---|---|
| E1 | Análisis del texto de la landing de la competencia (estructura, hooks, copy, números). | ✅ `01-analisis-forja.md` |
| E2 | Arquitectura de secciones propuesta para Kooni. | ✅ `02-arquitectura-landing.md` |
| E3 | Prompts listos para generar la landing con IA (hero, flujo, planes, FAQ, QA de marca). | ✅ `03-prompts-landing.md` |
| E4 | Textos base de Kooni (adaptados a la marca). | ✅ `04-textos-base.md` |
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
| I1 | **Módulo `src/limits.ts`**: límites free (contactos 50, mensajes IA 500/mes, canales 2, reglas 5, DMs 100/mes, links 3) + enforcement fail-open en agent.ts / zernio.ts. | ✅ v23ddf5de |
| I2 | **Código de licencia Pro**: script `scripts/gen-license.ts` (HMAC con `LICENSE_MASTER_KEY`) + validación en el panel. Soporta lifetime (expiry vacío) y mensual (expiry embebida). | ✅ v23ddf5de |
| I3 | **Banner de límites** en el panel (Resumen: X/Y usados + CTA). | ✅ v23ddf5de |
| I4 | **CLI `npx kooni-bot init`**: paquete `cli-kooni/` (npm `kooni-bot`), descarga tarball del repo público + instalador. Probado end-to-end. | ✅ Probado (falta npm publish) |
| I5 | **`npx kooni-bot update`**: trae versión nueva SIN tocar member/ ni D1. | ✅ Probado |
| I6 | **Repo público** `github.com/iamnocodeveloper/kooni-bot` subido limpio (sin historial, sin datos). `admin-pagos/` gitignored. | ✅ |
| I7 | **Precios decididos**: Opción B — lifetime fundador ($29-49, primeros 10-20) + mensual ($9-15) después. Detalle en `sitio-web/10-precios-opciones.md`. | ✅ Decidido |
| I8 | **Publicar en npm**: `cd cli-kooni && npm login && npm publish`. | ⏳ Falta cuenta npm |
| I9 | Pruebas internas: instalar limpio, límites, licencia, update sin pérdida. | ⏳ Pendiente |

## J. Mini sistema de gestión de claves y membresías (InsForge, local) — ✅ IMPLEMENTADO

> App INTERNA del dueño para gestionar clientes de pago y códigos de licencia,
> visual y local, con InsForge. La web (landing) va al cPanel del dueño; en
> InsForge vive SOLO el sistema de licencias.

| # | Tarea | Estado |
|---|---|---|
| J1 | Proyecto InsForge `kooni-licencias` creado (API base `f5gacw7g.us-east.insforge.app`). | ✅ |
| J2 | Tablas: clientes, licencias, pagos, profiles + RLS solo-admin + trigger perfil. | ✅ Migración aplicada |
| J3 | Super admin: joeldavidar@gmail.com (rol admin, email verificado, login probado). | ✅ |
| J4 | Edge functions: auth-login, generar-licencia, listar-licencias, registrar-pago. | ✅ `f5gacw7g.function2.insforge.app` |
| J5 | UI admin de licencias (generar código, listar, registrar pago). | ✅ `f5gacw7g.insforge.site` |
| J6 | LICENSE_MASTER_KEY guardada como secret en InsForge (misma que en Cloudflare). | ✅ |
| J7 | Prueba end-to-end: login → generar lifetime + mensual → listar. | ✅ |

---

## K. Detección de URL del worker tras el deploy (Kooni vs Forja)

### Contexto
Al correr `npx kooni-bot init`, el último paso "Desplegando el worker…" a veces
termina con `⚠ no se detectó la URL del worker`. La migración D1 y el deploy sí
funcionan, pero el CLI no logra extraer la URL para mostrarla al usuario.

### Cómo lo hace Kooni hoy (`cli-kooni/bin/kooni.js`)
```js
const dep = runPnpm(dir, ["run", "deploy"], { capture: true });
url = (dep.match(/https:\/\/[a-z0-9-]+\.workers\.dev/) || [])[0] || "";
```
`runPnpm` con `capture: true` ejecuta `pnpm run deploy` con `stdio` capturado y
convierte `stdout` + `stderr` a string. Después busca el primer literal
`https://<algo>.workers.dev` con una regex.

### Por qué falla
1. `pnpm run deploy` ejecuta el script `predeploy` (`deploy-check` + `version:write`)
   ANTES de `wrangler deploy`. Esa salida intercalada puede no contener la URL, o
   wrangler puede imprimir la URL en una línea con caracteres/colores que la regex
   no capture.
2. La URL real de Cloudflare a veces incluye el subdominio de cuenta
   (`kooni-bot-<slug>.<cuenta>.workers.dev`), que la regex `[a-z0-9-]+\.workers\.dev`
   sí cubre, pero si wrangler la envuelve en ANSI o la formatea distinto, no matchea.
3. En Windows, `pnpm run deploy` con `capture: true` puede separar stdout/stderr de
   forma distinta a como se combina en `run()`.

### Cómo lo hace Forja (`cli/bin/cli.js`)
Forja NO intenta parsear la URL desde la salida del deploy. Simplemente:
- Extrae el tarball y estampa `DASHBOARD_BASE_URL = ""`.
- Al terminar, `nextSteps()` le dice al usuario "tu agente despliega el bot" y le
  da los pasos; NO imprime una URL directa del worker.
- La URL real se escribe después con `forjabot pair --url https://…`, que la toma
  del flag o de `DASHBOARD_BASE_URL`.

Es decir: Forja evita el problema no porque parsee mejor, sino porque NO depende
de capturar la URL del deploy en ese momento — difiere el "descubrir la URL" a un
paso posterior (`pair`) donde el usuario la pega explícitamente.

### Opciones para resolver en Kooni
- **A. Derivar la URL del nombre del worker + workers.dev (sin parsear deploy):**
  la URL siempre es `https://<workerName>.<cuenta>.workers.dev`, y el subdominio de
  cuenta se puede obtener con `wrangler whoami` o con la API `GET
  /accounts/:id/workers/subdomain`. Así no dependemos de capturar stdout.
- **B. Preguntar/pegar la URL** como hace Forja (`--url`), y persistirla en
  `DASHBOARD_BASE_URL`.
- **C. Mejorar el parse:** usar `wrangler deploy --json` (si está disponible en
  wrangler 4.125) para obtener la URL en JSON estable en vez de raspar texto.

### Estado
⏳ Pendiente de decidir e implementar. Por ahora el flujo le dice al usuario que
abra Cloudflare y copie la URL manualmente.

---

## Orden recomendado de ejecución

1. **Fase 1-2 OpenReply** — matcher avanzado + `{username}` + links trackeados (mayor valor). | ✅ HECHO (v d59c390c)
2. **B2 + B3** — panel de conexiones con tokens (pegar tokens desde `/admin`).
3. **C2 + C3 + C4** — sistema de licencia Pro.
4. **F2** — prueba del handoff con el dueño.
5. **Fases 3-7 OpenReply** — follow gate, dedup, rate limit, logs, plantillas. | 🎉 PLAN COMPLETO (v86b83401): follow gate ✅ + dedup ✅ + rate limit ✅ + logs ✅ + plantillas ✅
6. **E7** — generar la landing con los prompts de `sitio-web/`.
