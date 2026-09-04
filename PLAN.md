# PLAN — Kooni: pendientes y próximos pasos

> Estado al día de hoy. Marca ✅ lo hecho, deja lo demás como tarea abierta.
> Las tareas del sitio web viven en `sitio-web/` (uso interno, no se sube).

---

## 🏁 CIERRE DE ETAPA — BETA (histórico)

> ⬇️ Este bloque es el cierre de la etapa BETA (`v1.0.9`). El estado **actual** vive
> en **§ CIERRE DE ETAPA — v1.20.0** (más abajo, 2026-09-03).
>
> **Estado (cuando se escribió):** bot de Joel en producción
> (`kooni-bot-joel-nocode-ec53aa.joeldavidar.workers.dev`), template `v1.0.9` · CLI
> `0.2.14`. El dueño entra en **pruebas + lanzamiento beta**.

### Entregado y verificado en esta etapa

| Área | Qué quedó |
|---|---|
| Canales | Telegram y Zernio se conectan desde el panel; **webhook auto-registrado** en ambos. Chat id del dueño editable en la card Telegram (avisos de handoff). |
| Licencias | Código `KOONI-PRO-…` desbloquea **TODO** (tabs, tools, imagen del agente, límites) vía `isProUnlocked()`. Licencia por instalación (`inst`/`uid`). Panel de licencias en InsForge (`generar-licencia` con `instUid`). |
| Automatizaciones | 4 tipos: comentario→DM, comentario→público, comentario→DM+público, DM→respuesta + **follow gate completo** (botón "Ya te sigo", postback, re-pedido). |
| Zernio | DM por cuenta de inbox, respuesta pública por cuenta de publicación; rate limit + dedup + links trackeados + `{username}`. |
| IA | Proveedores: Claude, ChatGPT, Grok, **MiniMax**, Gateway. |
| CLI | `init` / `deploy` / `update --all` / `doctor` / `version`; fix de detección de URL del worker (`<worker>.<cuenta>.workers.dev`). **v0.2.14**: auto-crea el subdominio `workers.dev` (error 10063) con la sesión OAuth de wrangler y reintenta el deploy; fallback manual + API token. Igual en `scripts/kooni-init.sh|ps1`. |
| Sitio web | kooni.click: sección **CLI** en nav, footer con legal/ayuda, **Términos y Privacidad editables desde el panel** (con fecha de actualización). |
| Calidad | **564/564 tests** verdes + typecheck OK. |

### En pruebas ahora (beta)

- Flujo end-to-end real: comentarios, DMs y handoff en Telegram/Zernio.
- Follow gate con seguidores reales (sigue + botón → entrega del link).
- Activación de licencia en instalación nueva (`npx kooni-bot init` → panel → pegar código).
- `npx kooni-bot update` sin pérdida de `member/` ni datos D1.

### Sistema de licencias — arreglos hechos (2026-08-31)

| # | Tarea | Estado |
|---|---|---|
| L1 | **Cardealer**: `BOT_TIER=pro` (premium sin licencia, como joeldavidar), `LICENSE_MASTER_KEY` seteada en el worker y registrada en `instalaciones` del panel de licencias (faltaba el check-in). | ✅ Hecho |
| L2 | **Código inválido**: causa raíz = worker sin `LICENSE_MASTER_KEY` (la validación es HMAC local). Con la llave puesta, el código "daniel medrazi" (lifetime) ya firma válido y activa Pro en cualquier instalación. | ✅ Verificado |
| L3 | **Correo en licencias gratis**: columna `correo` en `clientes` + `generar-licencia` exige correo válido cuando `precio=0` (y lo valida siempre que venga) + UI del panel con campo `Correo *`. | ✅ Hecho y desplegado |
| L4 | **Registro de TODAS las instalaciones**: CLI 0.2.15 hace check-in ANTES del deploy (aunque falle) y re-registra tras deploy/update. Instalaciones gratis o pagas — todas aparecen en el panel. | ✅ En código |
| L5 | **Master key en todas las instalaciones**: CLI 0.2.15 la pone como secret en cada instalación (`.dev.vars` + worker). Instaladores `kooni-init.sh|ps1` la leen de `.dev.vars`/env. | ✅ En código |
| L6 | **CLI 0.2.16 — correo siempre + licencia Pro en el instalador**: `init` pide el correo del dueño (obligatorio) y pregunta si el bot será Pro; si pega un `KOONI-PRO-…` lo valida localmente (HMAC) y lo activa al terminar (settings `pro_license`, sin redeploy). Flags para agentes: `--email`, `--license`. | ✅ En código |
| L7 | **Métricas del sistema en el panel de licencias**: worker → `registrar-uso` (cron nocturno + trigger `POST /usage/push` protegido), tabla `uso_instalaciones`, `listar-licencias` las incluye, UI con tarjeta "📊 Estadísticas del sistema" (mensajes, bot, conversaciones, leads, canales, contacto + **costo IA 30d**). Cardealer ya reporta con datos reales. | ✅ Hecho y verificado |
| L8 | **Marca blanca del panel** (revendedores): vars `BRAND_*` (`BRAND_NAME`, `BRAND_LOGO_URL`, `BRAND_PRIMARY`, `BRAND_ACCENT2`, `BRAND_BG`, `BRAND_PANEL`…) → sidebar + paleta del `/admin` con la marca del revendedor; defaults = identidad Kooni. | ✅ En código |
| L9 | **Dominio propio**: guía en `docs/DESPLIEGUE.md §4.5` (custom domain en dashboard/wrangler, `DASHBOARD_BASE_URL`, `workers_dev=false`, re-registro de webhooks). | ✅ Documentado |
| L10 | **Health-checks por instalación**: función `healthcheck` (pingea `/health` de cada worker, marca `ok`/`caido`/`sin_verificar` + `ultimo_chequeo`) protegida con `X-Health-Token` (secret `HEALTH_TOKEN`), schedule cada 15 min, y badge de estado + última verificación en la tabla Instalaciones del panel. | ✅ Hecho y verificado (3 instalaciones `ok`) |
| L11 | **UI del panel de licencias**: formulario con campo `instUid` (liga la licencia a una instalación, verificado: código con `inst=948b8b` valida en cardealer y se rechaza en otra), columna Correo en Clientes, columna Instalación en Licencias. | ✅ Hecho y desplegado |
| L12 | **Acceso al panel desde cualquier dispositivo**: la raíz `/` ya no da "not found" — redirige a `/admin` (login). Botón **Cerrar sesión** en el header (ruta `/admin/logout` que responde 401 + `WWW-Authenticate realm="Kooni"` → el navegador limpia las credenciales guardadas; realm explícito en `adminAuth`). | ✅ Hecho y verificado |

### Licencias v2 — Ed25519, reemplaza HMAC (2026-09-01)

> Encontrada a medio terminar en el working tree (sin commitear) al revisar el
> proyecto; se completó, se verificó y se documenta acá. Cierra el hallazgo
> crítico S2 de la auditoría del 31-ago (llave maestra embebida en el CLI
> público). **NO se desplegó ni se commiteó** — queda en el working tree para
> que decidas cuándo.

| # | Tarea | Estado |
|---|---|---|
| M1 | `src/license.ts` reescrito: códigos `KOONI-PRO-V2-<payload>.<sig>` firmados/verificados con **Ed25519** (`node:crypto`, sync — mismo patrón que ya usaba el HMAC viejo, compatible con Workers). El formato v1 (HMAC) queda **desactivado**: `verifyLicense` rechaza cualquier código que no empiece con el prefijo v2. | ✅ Hecho |
| M2 | **Ya NO hay bypass por `BOT_TIER=pro`**: `isPro()` devuelve `false` siempre; `isProUnlocked()` (tabs, tools, imagen, handoff WhatsApp, límites) SOLO mira la licencia v2 en `settings.pro_license`. Antes, poner `BOT_TIER="pro"` en `wrangler.toml` alcanzaba — eso era exactamente el hueco de seguridad (cualquiera con el repo público podía auto-otorgarse Pro). | ✅ Hecho |
| M3 | `env.LICENSE_MASTER_KEY` eliminado de `src/env.ts`; agregado `env.LICENSE_PUBLIC_KEY?` (opcional — sin él, se usa la pública embebida por defecto en `license.ts`). | ✅ Hecho |
| M4 | **Bug encontrado y corregido**: `isToolAvailable()` (en `config.ts`) seguía llamando al `isPro()` síncrono ya neutralizado — con la licencia v2 puesta, igual habría devuelto `false` para `scheduleAppointment`/`catalogQuery`. Pasada a `async` y ahora usa `isProUnlocked()`. (No se usa en producción todavía — quedó huérfana de una limpieza anterior — pero se deja consistente para quien la use.) | ✅ Hecho |
| M5 | Tests: `test/license.test.ts`, `test/modules.test.ts`, `test/tools/index.test.ts`, `test/tools/handoffHuman.wa-dm.test.ts`, `test/admin/agente.test.ts`, `test/admin/dashboard-tier.test.ts`, `test/agent.media.test.ts` actualizados a v2 (par Ed25519 de prueba vía `test/helpers/license.ts`, nuevo). Se auditaron los ~19 archivos de test restantes que ponen `BOT_TIER: "pro"`: ninguno ejercita `isProUnlocked`/`isPro`/gating de tabs o tools, así que no necesitan cambios (confirmado leyendo cada uno, no solo por grep). Se quitaron 3 referencias sueltas a `LICENSE_MASTER_KEY` en tests (`features.test.ts`, `reports/nightly.test.ts`, `vigilante.test.ts`) que ya no aplican. | ✅ Hecho |
| M6 | **Verificación**: la sesión anterior no pudo correr `pnpm test`/`pnpm typecheck` tal cual (problema de entorno) y los validó por fuera del framework. **01-sep, sesión siguiente: corridos de verdad** en la máquina del dueño — `pnpm test` → **625 tests, 89 archivos, todos verdes**; `pnpm typecheck` → **`tsc --noEmit` sin errores**. Bloqueante #4 cerrado. | ✅ Verificado con `pnpm test`/`pnpm typecheck` reales |
| M7 | **Instalaciones desplegadas se caen a Free al desplegar** (ya no hay bypass por `BOT_TIER=pro`). **Decisión del dueño (01-sep): que queden en Free por ahora** y se emita después una licencia correcta y completa por instalación. O sea: desplegar es seguro, solo hay que saber que Insights/Costos/Campañas/Mejoras/imagen/handoff-WA desaparecen del panel hasta pegar la licencia v2. | ✅ Decidido: quedan en Free |
| M8 | ~~Pendiente fuera de este repo~~ — **corrección**: la edge function `generar-licencia` **SÍ vive en el repo**, en `admin-pagos/` (gitignored, por eso no aparecía en `git grep`). **Ya migrada a Ed25519**: firma con `LICENSE_PRIVATE_KEY` (secret de InsForge) vía WebCrypto de Deno (`crypto.subtle` con `Ed25519`), emite el prefijo `KOONI-PRO-V2-` y devuelve error claro si falta el secret. Verificado: se replicó su algoritmo exacto y los códigos que produce los acepta el `verifyLicense` del worker en las 4 formas (lifetime, mensual, ligada a `inst`, con `modules`). **Falta desplegarla en InsForge + cargar el secret.** | ✅ Migrada · ⏳ falta desplegar |
| M9 | **🔴 La clave privada de la pública embebida NO existía**: la pública que había quedado en `src/license.ts` (`MCowBQYDK2VwAyEAvt7c…`) era **huérfana** — su privada se generó en la sesión inconclusa y se perdió (no está en `.dev.vars`, `.env.local`, ni en ningún lado). Con ella, nadie habría podido emitir una licencia válida nunca. **Resuelto**: se generó un par Ed25519 nuevo **en la máquina del dueño** (la privada nunca pasó por el chat), la pública nueva quedó embebida en `src/license.ts`, y la privada quedó en `admin-pagos/CLAVE-PRIVADA-LICENCIAS.txt` (carpeta gitignored). Verificado de punta a punta: firma con esa privada → valida contra la pública embebida. | ✅ Resuelto |
| M10 | **`src/usage.ts` reportaba el tier equivocado**: mandaba `tier: env.BOT_TIER` al panel de licencias, que tras la migración diría "pro" en instalaciones que en realidad quedaron Free. Ahora reporta el tier REAL (`isProUnlocked`) y además la lista de **módulos desbloqueados** por instalación — con eso el panel puede mostrar, a través de toda la cartera, qué módulos se usan de verdad (ver § "Antes de construir el módulo 15"). Fail-open: si falla la lectura, reporta `free` y no rompe el cron. | ✅ Hecho |

| M11 | **🔴 El CLI público de npm era el agujero real de S2 — corregido**: `cli-kooni/bin/kooni.js` traía la llave maestra **escrita como literal** (línea 45), la escribía en el `.dev.vars` de cada instalación y la instalaba como secret en cada worker. Además validaba los códigos pegados en `init` con HMAC v1 → **le habría rechazado al cliente el código nuevo que le mandes**. Migrado: la llave maestra desaparece por completo del CLI y de los instaladores (`scripts/kooni-init.sh|ps1`), y la validación pasa a Ed25519 con la clave PÚBLICA embebida (segura de publicar en npm). CLI **0.3.0**. Verificado con la función real extraída del archivo: acepta lifetime y mensual vigente, rechaza vencida, formato v1, código inventado y **licencia falsificada con otra llave** (lo que antes era imposible de evitar). | ✅ Hecho |
| M12 | **✅ Resuelto (02-sep):** se bajaron de InsForge las 10 edge functions vivas a `admin-pagos/functions/` — el local ya es idéntico a producción. Las que estaban atrás: `registrar-instalacion` (57→112 líneas: token S4 + rate-limit), `auth-login` (40→80: rate-limit `auth_attempts` por IP y email + 429). `admin-pagos/` es de nuevo la fuente de verdad. *(Nota: `admin-pagos/` es gitignored — no viaja al repo público; vive solo en tu máquina + InsForge.)* | ✅ |
| M13 | **Pendiente de limpieza #10 cerrado**: `PRO_ONLY_TOOLS` (`config.ts`) todavía listaba `scheduleAppointment` como Pro, pero `src/tools/index.ts` la registra siempre (a propósito, para que el modelo no invente reservas — ver su comentario). No causaba bugs porque `isToolAvailable()` no se usa en producción (H4/M4), pero era una trampa para quien la use después. Ahora `PRO_ONLY_TOOLS` solo tiene `catalogQuery`, alineada con el código real. Verificado: sin referencias en tests, `pnpm test`/`typecheck` siguen verdes. | ✅ Hecho (01-sep) |
| M14 | **`admin-pagos/functions/generar-licencia.ts` local e InsForge habían divergido** — la desplegada tenía CORS restringido y capturaba `correo`, pero no soportaba licencias por módulo; la local soportaba `modulos` pero con CORS `*` (regresión de S3) y sin capturar `correo` (regresión de la columna del panel). Reconciliado: se restauró el CORS restringido y la captura/validación de `correo`, conservando el soporte de `modulos` y la codificación base64url más robusta. Migración nueva `add-modulos-to-licencias` (la tabla `licencias` no tenía esa columna — habría roto cualquier licencia con módulos). **Desplegado y verificado** (`functions code` tras el deploy es idéntico al archivo local). | ✅ Hecho y desplegado (01-sep) |
| M15 | **Bloqueante #6 CERRADO — de punta a punta, con un cliente real.** Se pusheó la migración a `main` (commits `4c6eb89`, `643d149`, v1.12.0) y se corrió `npx kooni-bot update` en las dos instalaciones registradas en esta máquina: **`joel-nocode`** (demo del dueño, cuenta CF `29074eb8…`) y **`cardealer-dani`** (cliente real Daniel — cuenta CF `b579b154…`, antes "Info@dmezzadri.com"). Ambas desplegaron limpio y responden `200` en `/health`. Daniel tenía un código **v1 activo** (`KOONI-PRO-eyJ...`, lifetime $39) que la migración vuelve inválido — se le generó y activó un código **v2 real, ligado a su instalación** (`inst=948b8b`) firmado con la privada vigente, verificado contra `verifyLicense`/`verifyLicenseFor` antes de pegarlo, registrado en InsForge (`licencias`: v1 desactivada, v2 insertada) y escrito en su `settings.pro_license` — su Pro no se interrumpió. El código de prueba del dueño (lifetime, sin restricciones) quedó pegado en el panel de `joel-nocode` como confirmación visual adicional. | ✅ Cerrado (01-sep) — 2 instalaciones reales migradas |

#### 🔑 Cuidar la clave privada (una sola cosa que no se puede deshacer)

`admin-pagos/CLAVE-PRIVADA-LICENCIAS.txt` es **la única copia** de la llave que firma
todas las licencias. Pasala a tu gestor de contraseñas y borrá el archivo (además
está dentro de OneDrive, o sea que hoy se sincroniza a la nube). Si se pierde:
ningún bot ya desplegado vuelve a aceptar una licencia nueva sin re-desplegarlo con
otra pública. La pública, en cambio, es segura de publicar — ese es el punto de v2.

### Pendientes menores / bloqueados

| # | Tarea | Estado |
|---|---|---|
| I8 | Publicar CLI en npm (`kooni-bot@0.2.17`). | ⏳ **HECHO**: 0.2.16 y 0.2.17 publicados (npm latest = 0.2.17). |
| J1 | **Joel-nocode** — fixes del panel (logout, raíz→/admin, realm) sin desplegar. Pasos en → **§ CIERRE DE ETAPA v1.20.0**. Su carpeta no está en esta máquina; se despliega con `kooni-bot update` cuando se tenga. | ⏳ Pendiente (carpeta ausente) |
| F2 | Re-probar handoff en vivo. | ⏳ En pruebas (necesita a Joel). |

## 🏁 CIERRE DE ETAPA — v1.20.0 (2026-09-03)

> **Estado:** `origin/main` en **`a189124` (v1.20.0)**. `pnpm test` → **741/741** ·
> `pnpm typecheck` → verde (corridos de verdad). Working tree limpio.

### Qué entró en v1.20.0 (3 commits)

| Commit | Contenido |
|---|---|
| `5a5c856` | **feat(niches):** 4 giros — `restaurante` (pack de referencia), `inmobiliaria`, `clinica` (regla dura: no diagnostica), `barberia`. Cada uno = 1 archivo en `src/niches/`. `test/niches.test.ts` reescrito a tabla `GIROS` (`it.each`). +6 plantillas de KB. `docs/ARQUITECTURA.md §7` reescrita a la API real de `NichePack`. |
| `cfe5133` | **chore:** rebrand `"Forja+"` → `"Kooni+"` en 23 comentarios/títulos de test. Nada visible al usuario. Se conservan LICENSE (© Horizontes IA) y notas de atribución MIT. |
| `a189124` | **v1.20.0:** W1 (umbral KB configurable, `KB_MIN_SCORE_DEFAULT=0.45` + `settings.kb_min_score` + campo en `/admin/kb`) + W2 (gracia de licencia 7 días para códigos `monthly`, `inspectLicense()`) + bump `package.json`. |

### Despliegue por instalación — ✅ HECHO (2026-09-03)

| Instalación | Cuenta CF | Estado v1.20.0 |
|---|---|---|
| **cardealer** (`kooni-bot-cardealer-daniel2-948b8b`) | `b579b154` | ✅ **Desplegado** — `kooni-bot update` (marker + pkg 1.20.0, `/health` 200, `v1.20.0` en el pie del login). Cambio funcional real = nulo (sin `BOT_NICHE`; W1 ya estaba a mano; W2 inerte con licencia lifetime). |
| **joel-nocode** (`kooni-bot-joel-nocode-ec53aa`) | `29074eb8` | ✅ **Desplegado** — `kooni-bot update` (1.20.0, `/health` 200, `v1.20.0` en el login). Trae W1 + J1 (logout/raíz→/admin/realm) + los 6 niche packs. Sigue en `BOT_NICHE = "agencia-ia"`. |

**CLI:** `kooni-bot@0.3.2` publicado en npm (fix del `tar` en Git-Bash/MSYS, commit `7b4e327`).

### J1 — fixes del panel de joel-nocode (logout, raíz→/admin, realm)

- Ya están en el `src/` de la carpeta joel-nocode (no en esta máquina). Se despliegan
  con el `kooni-bot update` de la fila de arriba.

### ⚠️ Hallazgo suelto (2026-09-03)

- `C:\Users\joeld\starter\wrangler.toml` tiene una **API key de OpenAI (`sk-proj-…`)
  pegada como literal en `BOT_NAME`**. Es local (no está en el repo), pero conviene
  **rotarla** en platform.openai.com y limpiar ese `wrangler.toml`.

---

## 🏁 CIERRE DE ETAPA — v1.25.0 (2026-09-04)

> **Estado:** `pnpm test` → **793/793** · `pnpm typecheck` → verde (corridos de
> verdad, en este repo y en la carpeta real de cardealer-daniel). Working tree
> del repo con `package.json` en `1.25.0`, sin commitear hasta esta entrada.
> Disparador: sesión de soporte en vivo con el bot de **Daniel (cardealer)** —
> "¿qué autos Kia tienes?" respondía "no tengo información" con la KB llena.

### 1. Bug real de búsqueda en la KB (el que importaba) — `src/kb/query.ts`

`queryKb` llamaba `env.KB.query(vec, { topK: k })` sin `returnMetadata: "all"`.
Vectorize **no devuelve `metadata` por default** desde un cambio de su API — el
score llegaba bien (0.54–0.57, sobre el piso) pero `title`/`content` llegaban
**vacíos**. El bot recibía fragmentos en blanco y decía "no tengo información"
con el inventario completo indexado. Diagnosticado con un endpoint de debug
temporal (`/api/debug/kb`, protegido con `CONTROL_PLANE_TOKEN`) creado, usado y
**eliminado** en la misma sesión — no queda superficie extra. Probablemente
venía afectando **toda búsqueda de KB**, no solo autos, desde que cambió el
default de Vectorize. Test nuevo (`test/kb/query.test.ts`) que lo fija.

### 2. "Autos parecidos" cuando nada supera el piso — `src/tools/searchKb.ts`

`KB_MIN_SCORE_DEFAULT` (0.45) descartaba a `[]` cuando NINGÚN resultado
cruzaba el piso, aunque la KB tuviera algo relacionado (común en listados de
autos, que rara vez pasan de ~0.65 aunque el match sea bueno). Ahora, si nada
cruza el piso pero hay resultados crudos, se entregan los mejores 3 igual — el
score bajo (más la descripción de la tool, actualizada) le dice al modelo que
son "parecidos", no el exacto. Dos tests reescritos en
`test/tools/searchKb.test.ts`.

### 3. WAHA (WhatsApp self-hosted) — integrado de punta a punta

El adaptador (`src/channels/waha.ts`) y el webhook (`/webhooks/waha`) ya
existían; faltaba todo lo demás. Nuevo:

- `src/channels/wahaCredentials.ts` — config efectiva (settings en D1 primero,
  env de fallback), mismo patrón que `telegramCredentials.ts`.
- `src/channels/wahaApi.ts` — llamadas reales a la API de gestión de sesiones
  de WAHA (verificadas contra su OpenAPI real, `waha.devlike.pro/swagger/openapi.json`):
  estado de sesión, crear/actualizar/arrancar, y traer el QR de emparejar.
- Tarjeta nueva en `/admin/conexiones` — pegar URL + API key + sesión **sin
  `wrangler secret put` ni redeploy**; al guardar, el worker crea/actualiza la
  sesión en WAHA con el webhook ya apuntado, y si falta emparejar, **muestra el
  QR ahí mismo** (proxiado — la API key nunca llega al navegador).
- 4 settings nuevas (`waha_api_url/session/api_key/webhook_token`), con las dos
  últimas registradas en `AUDIT_SENSITIVE_KEYS` (se redactan en el log de
  auditoría). Tests: `wahaCredentials.test.ts`, `wahaApi.test.ts`.
- Probado en modo prueba en cardealer-daniel: sesión creada, QR emparejable
  confirmado (PNG válido bajado y verificado).

### 4. Sin links del inventario scrapeado — `src/kb/webSync.ts`

Pedido de Joel: el bot no debe mandar los links de "Ver listado completo" del
inventario scrapeado en el chat (de otras fuentes — KB propia, `customFields`,
prompt — sí puede). `stripMarkdownLinks()` nuevo: convierte `[texto](url)` →
`texto`, aplicado SOLO en el pipeline de Web Sync, después de
`trimBoilerplate`. Verificado en la KB real de Daniel: contenido con VIN/precio
reales, cero `http` en el texto.

### Desplegado y verificado en cardealer-daniel (`b579b154…`, 2026-09-04)

| Paso | Resultado |
|---|---|
| Deploy 1 (bugs #1+#2) | `/health` → 200 |
| Deploy 2 (WAHA) | `/health` → 200, sesión WAHA creada y QR verificado |
| Deploy 3 (#4, sin links) | `/health` → 200 |
| Web Sync — URL de autos | `web_sync_urls` traía solo ~113 de 396 autos con la URL sin filtro. Se probó `?limit=500` para traer los 396 — **rompió el scrape** (el sitio devolvió su homepage en vez del feed `/llm/inventory/`). Revertido de inmediato a la URL que ya andaba; verificado que volvió a traer autos reales. **Sigue sin estar los 396 completos** — pendiente, sin apuro (§ ver "Pendiente" abajo). |
| `KB_REINDEX_TOKEN` | Rotado 2 veces durante el diagnóstico (necesario para disparar el scrape manual sin la `DASHBOARD_PASSWORD` de Daniel). Si estaba guardado en algún script de Daniel/Joel, ya no sirve. |
| `CONTROL_PLANE_TOKEN` | Creado para el debug temporal del punto 1, **eliminado** al cerrar. No queda en el worker. |

### Pendiente (no urgente)

- **Cobertura del inventario — techo confirmado en 100 de 396** (2026-09-04,
  post-cierre): se probó `?limit=200` con el mismo cuidado (verificar contenido
  ANTES de dejarlo puesto) — **misma falla que `limit=500`**, homepage en vez
  del feed. Revertido y verificado de nuevo: la URL sin parámetro YA trae
  exactamente 100 VIN (el mismo techo que `limit=100`, confirmado por Daniel).
  Conclusión: **100 es el máximo real de este endpoint** — no hay manera de
  sacar más con `limit`. Para los ~296 autos restantes haría falta paginar
  (`page=2`, `offset`, o algo así — sin confirmar si el sitio lo soporta) o
  separar por `type=new`/`type=used` (este último devuelve 0, roto del lado
  del sitio). Ninguno de los dos se probó — requiere más investigación
  específica del sitio de Daniel antes de tocar su config de nuevo.
- **Fotos de autos**: el feed `/llm/inventory/` no trae imágenes — "adjuntar
  imagen si la hay" (pedido de Joel) no tiene de dónde tomarla hoy. Si aparece
  una fuente con fotos, hay que sumarlas al pipeline de Web Sync y a
  `OutgoingReply.imageUrl`.
- **`wrangler` de esta máquina** quedó logueado como la cuenta de Daniel
  (`b579b154…`) para poder desplegar — falta devolverlo a la cuenta de Joel.
- **§ X** (arriba en este archivo) — multiusuario/agentes humanos + panel
  central estilo Forja: análisis guardado, **no arrancar** hasta que haga
  falta de verdad (ver disparadores ahí).

---

## Nichos por giro (bots especializados estilo Forja)

> **Estado (2026-09-02):** el motor de *niche packs* ya existía (`src/niches/`,
> `BOT_NICHE`, inyección de playbook, re-etiquetado del panel). Forja vende "14
> bots" pero es UN motor + un archivo de config por giro. El CLI de este repo
> (`cli/bin/cli.js` → `NICHE_SLUGS`) ya reconoce los 14 slugs; hasta ahora todos
> caían a `generico`.

### ✅ HECHO — 4 giros (`restaurante` = pack de referencia)

| Pieza | Detalle |
|---|---|
| `src/niches/restaurante.ts` | "Reservaciones", estados `Solicitada/Confirmada/Cumplida/Cancelada`, columnas `fecha/hora/personas/ocasion`, playbook de anfitrión (reserva conversando + deriva grupos/eventos/quejas). **Pack de referencia** para los demás. |
| `src/niches/inmobiliaria.ts` | "Prospectos", estados `Nuevo/En seguimiento/Cerrado/Perdido`, columnas `operacion/zona/presupuesto/recamaras`, playbook de calificación (compra/renta → zona → presupuesto → visita → deriva a asesor para negociar). |
| `src/niches/clinica.ts` | "Citas", estados `Solicitada/Confirmada/Atendida/Cancelada`, columnas `especialidad/fecha/hora/motivo`, playbook de recepción con **regla dura: nunca diagnostica ni da consejo médico**; urgencias → handoff. |
| `src/niches/barberia.ts` | "Citas", estados `Solicitada/Confirmada/Atendida/Cancelada`, columnas `servicio/barbero/fecha/hora`, playbook de agenda (servicio → barbero → día → hora; grupos/eventos → handoff). |
| `src/niches/index.ts` | Registra los 4. |
| `test/niches.test.ts` | Reescrito a tabla `GIROS` (`it.each`): resolución, re-etiquetado del nav, columnas, estados y playbook inyectado al prompt por cada giro. Slug "desconocido" de prueba → `giro-inexistente`. |
| `docs/kb-plantillas/` | +6 plantillas: `{restaurante,inmobiliaria,clinica,barberia}` × (servicios/menú de ejemplo + FAQ) + tabla del README. |
| `docs/ARQUITECTURA.md` §7 | Reescrita a la API real de `NichePack` (antes campos ficticios `name`/`leadColumns`); lista de packs incluidos + pasos para agregar giro. |

Activar: `BOT_NICHE = "<giro>"` en `wrangler.toml` (el CLI ya lo estampa según el
slug instalado).

### ⏳ ROADMAP — 10 giros restantes (1 archivo cada uno)

> Patrón: copiar `src/niches/restaurante.ts`, ajustar etiquetas + columnas +
> playbook + `kbDocs`, registrar en `index.ts`, sumar fila a `GIROS` en el test.
> Sin tocar DB ni canales. Por pedido / demanda real.

| Slug (`BOT_NICHE`) | Registro capturado | Columnas sugeridas | Prioridad |
|---|---|---|---|
| `gimnasio` | Prospecto | plan, objetivo, horario | media |
| `spa` | Reserva | tratamiento, fecha, hora, personas | media |
| `dentista` | Cita | tratamiento, fecha, hora, es primera vez | media |
| `salon` | Cita | servicio, estilista, fecha, hora | media |
| `hoteleria` | Reserva | check-in, check-out, huéspedes, tipo de habitación | media |
| `cafeteria` | Pedido / Reserva | tipo, fecha, hora, personas | baja |
| `panaderia` | Pedido | producto, cantidad, fecha de entrega | baja |
| `tienda` | Pedido / Lead | producto, cantidad, forma de entrega | baja |
| `coach` | Prospecto | programa, objetivo, canal | baja |
| `crm` | Lead | fuente, interés, etapa | baja |

**Opcional — tools por nicho:** los tests en `test/tools/index.test.ts:59`
verifican que el Starter NO agrega tools de nicho (`crearReservacion`,
`calificarComprador`…). Si un giro necesita una tool propia hay que: (a) añadir
`tools?` al tipo `NichePack`, (b) mezclarlas en `buildTools()` según
`getNiche(env)`, (c) actualizar esos tests. No es necesario para el MVP de cada
giro (playbook + columnas + KB alcanzan).

---

## Siguientes mejoras (roadmap post-beta)

> Para la siguiente etapa. NO implementadas aún; evaluar tras la beta.

1. **Revisión de fixes** — verificar en beta los fixes de Telegram/Zernio/follow gate y pulir lo que falle.
2. **Comunidad** — idea tipo Forja (comunidad + soporte): espacio donde los usuarios instalen su agente, compartan bots y se ayuden (evaluar WhatsApp/Discord/Skool).
3. **Mejoras del producto**:
   - **Audio en chat** (transcripción de voz ya existe en Telegram; revisar/mejorar UX).
   - **Imágenes en chat** (visión ya existe en Pro; pulir multiimagen y respuestas con imagen).
   - **Respuestas multimedia** (imagen/audio/botones) — hay base (`enviarRecurso`, `resource_library`).
4. **Licencias estilo Forja** (sección F) — login por email + registro de dispositivo + dashboard de cuentas, cuando se necesite recurrencia/facturación real.
5. **Validación asimétrica de licencias (Ed25519)** — ✅ **HECHO en el worker (2026-09-01, sin desplegar)**: `src/license.ts` genera/verifica códigos `KOONI-PRO-V2-<payload>.<sig>` con Ed25519 (`node:crypto`, sync, compatible con Workers). El worker solo lleva la clave PÚBLICA (embebida en el código, con override opcional vía `env.LICENSE_PUBLIC_KEY`); la PRIVADA nunca toca el repo. `scripts/gen-license.ts` (gitignored, uso interno) ya firma en v2. El formato v1 (HMAC/`LICENSE_MASTER_KEY`) queda desactivado — `verifyLicense` rechaza cualquier código que no empiece con `KOONI-PRO-V2-`. **Pendiente para cerrar del todo:** (a) actualizar la edge function `generar-licencia` en InsForge para firmar con Ed25519 (privada como secret `LICENSE_PRIVATE_KEY`) — vive fuera de este repo, no se pudo tocar desde aquí; (b) generar y pegar un código v2 en el panel de **cada bot ya desplegado** (ver aviso operativo abajo); (c) correr `pnpm test && pnpm typecheck` y desplegar.
6. **UI del panel de licencias** — exponer campos `botSlug` / `instUid` (instalación) en el formulario de generación, y mostrar el `correo` en la tabla de clientes.
7. **Modelo de revendedores (marca blanca + recurrencia)** — licencias por agencia/revendedor: el revendedor paga una cuota/mensualidad (recurrencia real) y a cambio instala bots con su marca (`BRAND_*` ya implementado), con límites y reporte de su cartera desde el panel de licencias (rol `revendedor` en `profiles`, comisión/cuota por instalación activa).
8. **PWA del panel — Fases 1-3** (`§ Q`). Fase 0 ✅ v1.14.0 · **Fase 1 (avisos push con VAPID) ✅ v1.16.0** — botón campana en el header, se dispara con nuevo prospecto / ticket / handoff. Pendiente: Fase 2 = lectura offline (endpoints JSON + cache del SW), Fase 3 = bandeja móvil (ya casi cubierta por § S2).
9. **Atribución y rendimiento de campañas** (`§ R`) — ⏸️ **PAUSADO TOTALMENTE** (decisión de Joel, 2026-09-02). No se toca hasta que Joel lo reactive explícitamente. El plan queda escrito en `§ R` por si se retoma.
10. **Panel — filtros de conversaciones, responsive y PWA install** (`§ S`). ✅ S1 (filtros canal/fecha/texto) v1.14.5 · S2 Fase 1 (shell+nav+bandeja) v1.14.3 · S2 Fase 2-3 (vistas, modales, iOS) v1.14.5. Queda: probar en dispositivos reales; formularios angostos → se cierran con § T.
11. **Scraping web → KB** (`§ L`) — ✅ **ACTIVO en cardealer** (v1.18.5). 71 autos del inventario de Daniel en la KB, se refresca cada noche. Fase 2 (los 100 autos, hoy caben 71) solo si Daniel lo pide.
12. **Rediseño visual del panel** (`§ T`) — ✅ **HECHO y desplegado** (v1.17.0–v1.18.2). Sora + IBM Plex Mono, morado/fucsia, tema claro+oscuro con toggle, sombras suaves, 12 vistas + SVG + PWA (ícono, theme-color, botón instalar) en tokens. Ambas instalaciones en v1.18.2, visto por Joel. **Queda solo:** `web/*.html` (landing, sigue teal — pase aparte) y reescribir `docs/design-system.md`.
13. **Chat del CRM — links y multimedia** (`§ V`) — que los links de los mensajes sean clicables/descargables y que las imágenes/videos/audios se previsualicen en el hilo (`/admin/conversations`). Hoy todo se renderiza como texto plano escapado. Pedido de Joel (2026-09-02).
14. **"Probar el bot" (playground)** (`§ W`) — ✅ **HECHO** v1.19.0. Chat de prueba en `/admin/probar`: el dueño escribe como cliente, ve la respuesta real (prompt+modelo+KB), sin persistir ni mandar por canal. Solo tools de lectura.
15. **🐛 Umbral de score de la KB demasiado alto (0.70)** — ✅ **HECHO (2026-09-02), pendiente commit+release.** Diagnóstico: en cardealer el bot decía "no tengo esa información" aunque la KB tiene los 71 autos indexados. Causa raíz **confirmada** consultando el Vectorize remoto de cardealer (`wrangler vectorize query`): 31 vectores sanos, contenido limpio, la búsqueda SÍ funciona — pero `@cf/baai/bge-m3` sobre contenido denso de inventario (VINs, URLs, precios) da top-score **0.60–0.63** aunque el match sea correcto (peor con consulta ES contra fichas EN). El umbral de 0.70 hacía que el modelo descartara resultados buenos. **Fix aplicado:** (a) nuevo `KB_MIN_SCORE_DEFAULT = 0.45` + `resolveKbMinScore(env)` en `src/kb/query.ts` (lee `settings.kb_min_score`, override del dueño, clamp 0–1); (b) `src/tools/searchKb.ts` filtra los hits `< min` antes de devolvérselos al modelo y su descripción ya no lleva número fijo ("si viene vacío, escala; si trae fragmentos, son confiables"); (c) `src/admin/views/kb.ts` — veredicto y colores usan el umbral real + **campo nuevo en /admin/kb para ajustarlo** (`POST /admin/kb/min-score`); (d) nueva key `kbMinScore` en `settings.ts`. Tests: +3 en `test/tools/searchKb.test.ts`, +2 en `test/admin/kb-routes.test.ts`. Afecta a TODAS las instalaciones (sobre todo web_sync). **Cardealer: DESPLEGADO a mano** (2026-09-02, version `e9f0fdb6`) — verificado contra el Vectorize real: consultas ES de inventario dan score 0.50–0.57 (> 0.45, antes descartadas por el 0.70). ✅ **Commiteado y en `main` en v1.20.0** (`a189124`, 2026-09-03) — ver § CIERRE DE ETAPA v1.20.0.
16. **Análisis ZernFlow — flujo visual tipo ManyChat** (`sitio-web/14-analisis-zernflow.md`) — ⏳ **EN ESPERA de feedback de las 2 instalaciones (beta).** Decisión 2026-09-02: NO construir el editor visual ahora (proyecto de semanas, choca con el principio "sin builders visuales" de `FLUJOS.md`, ningún cliente lo pidió). Se retoma con demanda real (2+ clientes lo piden / beta cerrada / cliente que paga ManyChat no migra sin editor). El doc trae además un Sprint 1 de tareas rápidas (T1 `src/triggers.ts`, T2/T3 playground: probar automatizaciones + ver tool calls, T4 vista de árbol read-only de `auto_rules`) — bajo riesgo, no toca `agent.ts` — y como Sprint 2 post-beta las **secuencias/drip** (la función que de verdad mueve la aguja vs ManyChat, antes que el lienzo).
17. **Gestión de licencias de pago — mejor forma para Kooni** (`§ F`) — Modelo elegido: **híbrido** (Ed25519 offline como fuente de verdad + capa online opcional para revocar/renovar, que se mantiene MIT — no se gatea la descarga). ✅ **HECHO y en `main` en v1.20.0** (`a189124`, 2026-09-03 — ver § CIERRE DE ETAPA): periodo de **gracia de 7 días** para códigos `monthly` vencidos (`LICENSE_GRACE_MS`), `inspectLicense()` como estado único, tarjeta de estado real en `/admin/licencia` (de por vida / vence en N días / gracia / vencida) y aviso en el Resumen. Inerte para lifetime. ⏳ **ROADMAP (construir con cliente de suscripción real, detalle completo en `§ F`):** (a) endpoint `estado-licencia` en InsForge — `active` / `active + código rotado` (auto-renovación, cliente no hace nada) / `revoked`; (b) `src/license-check.ts` + cron nocturno (fail-open; cache de revoke en `isProLicense`); (c) procesador de cobro recurrente (Stripe / Lemon Squeezy / Mercado Pago) — decisión de negocio; (d) aviso automático de vencimiento (email/push); (e) botón "renovar" en el panel de licencias; (f) login del CLI estilo Forja SOLO si los revendedores lo piden.
18. **Canal MercadoLibre** (`§ B5`) — ✅ **HECHO en `main` en v1.21.0** (`0a193c4`, 2026-09-03). Preguntas de publicaciones + mensajería post-venta; app OAuth propia del vendedor, todo en D1 `settings`, tarjeta en `/admin/conexiones`. Falta prueba end-to-end en vivo.
19. **Registro de auditoría del panel** (`§ U`) — ✅ **U1 + U2 + U3 HECHOS (2026-09-03), pendiente commit+release.** Ventana `/admin/auditoria` de **solo lectura** (Pro): quién entró, hora, qué acción, qué modificó, **antes → después**. Decisiones de Joel: **Nivel A** (huella IP + navegador, sin tocar el login) · **vista solo Pro**, captura siempre. U1: tabla `audit_log`, `AuditRepo`, `src/audit/context.ts` (`AsyncLocalStorage` + redacción de secretos), middleware de actor, `SettingsRepo.set` instrumentado, captura de login/logout, purga nocturna (180 d). U2: la ventana (`src/admin/views/auditoria.ts`), filtros, `export.csv`, nav con candado, módulo vendible. U3: `recordAudit()` en KB / automatizaciones / leads / tickets / conversaciones / mejoras / campañas. Queda opcional: **U4** (nombre de operador Nivel B) y **U5** (multiusuario Nivel C). Detalle en `§ U`.

## Seguridad — auditoría 2026-08-31 (arreglos + pendientes)

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| S1 | **Credenciales de admin hardcodeadas en el HTML público** del panel de licencias (kooniadmin2026 / pass). | 🔴 Crítico | ✅ Eliminadas del deploy. **Pendiente (tú): rotar la contraseña** en dash.insforge.dev → Auth → usuarios (las viejas ya son públicas). |
| S2 | **`LICENSE_MASTER_KEY` embebida en el CLI público** (kooni-bot en npm). Quien tenga el paquete puede falsificar códigos KOONI-PRO. | 🔴 Crítico | ✅ **Corregido en el worker** (tarea #5 del roadmap, Ed25519 v2 — ver detalle ahí). ⏳ Falta: migrar `generar-licencia` (InsForge) a firmar con la privada y reemplazar `LICENSE_MASTER_KEY` por `LICENSE_PRIVATE_KEY` ahí; después, **rotar**: la vieja `LICENSE_MASTER_KEY` ya circulaba en el paquete npm y debe darse por comprometida (cualquier código v1 firmado con ella ya no es válido de todas formas, porque `verifyLicense` v2 los rechaza). |
| S3 | **CORS `*`** en funciones con auth (auth-login, generar-licencia, listar-licencias, registrar-pago, crear-admin, estado-admin). | 🟡 Medio | ✅ Restringido a `https://f5gacw7g.insforge.site`. |
| S4 | `registrar-instalacion` / `registrar-uso` públicos (spoofeables; el check-in envía email/PII). | 🟡 Medio | ✅ **Hecho (CLI 0.2.17 + funciones v2)**: token compartido `X-Kooni-Token` (secret `REGISTER_TOKEN`, fail-closed), rate-limit por IP (reusa `auth_attempts`), validación de formato (email/uid/worker_name) y **rechazo de uids no registrados** en `registrar-uso` + límite de payload. `updated_at` se refresca en el upsert. |
| S5 | Sin rate-limit en `auth-login` (fuerza bruta sobre el admin). | 🟡 Medio | ✅ **Hecho (v1.13.4, O5):** `POST /admin/login` limita a 8 fallos por IP en ventanas de 15 min (tabla D1 `login_attempts`, ip_hash SHA-256, fail-open). El login del panel del bot. *(El `auth-login` de InsForge del panel de licencias es otra superficie — S4 ya le puso token + rate-limit por IP.)* |
| S6 | SQL de activación de licencia en el CLI (escape manual de comillas). | 🟢 Bajo | ✅ Código KOONI-PRO solo contiene base64url+hex (sin comillas); aun así, migrar a valores parametrizados cuando el CLI lo soporte. |

**Buenas prácticas ya verificadas:** compare de tokens en tiempo constante (`src/http-auth.ts`), `.gitignore` cubre `.dev.vars`/`.env`/`.wrangler`, API keys vía `wrangler secret put` por stdin (nunca en disco ni en logs), sin secrets en logs del bot, RLS en InsForge (solo admin lee clientes/licencias/pagos), fail-closed en `/api/*` con `CONTROL_PLANE_TOKEN`.
5. **Panel y métricas** — pulir Resumen, Insights, Costos.
6. **Landing / marketing** — terminar la landing (E7) y preparar el lanzamiento público.

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
| B4 | Probar el flujo end-to-end: pegar token de Telegram en el panel → canal verde → probar mensaje. | ✅ Telegram y Zernio probados en vivo en el bot de Joel (webhooks registrados, mensajes fluyen). |
| B5 | **Canal MercadoLibre** (preguntas de publicaciones + mensajería post-venta): app OAuth propia del vendedor, todo el estado en D1 `settings` (sin `wrangler secret put`). Card en `/admin/conexiones` (App ID + Secret + país → "Autorizar" → OAuth). Webhook `/webhooks/mercadolibre` (no firmado: se valida `user_id` del vendedor y se busca el recurso con su token); callback OAuth `/webhooks/mercadolibre/oauth`. Access token ~6 h, refresca solo (`src/channels/mercadolibreCredentials.ts`). Adapter: `q:<questionId>:<buyerId>` → `POST /answers`; `m:<packId>:<buyerId>` → `POST /messages/packs/.../sellers/...`. Tests: `test/channels/mercadolibre.test.ts`. | ✅ Implementado — **falta prueba end-to-end en vivo** (crear app real, autorizar, pregunta real). Limitación conocida: los follow-up proactivos sobre una "conversación" que es una pregunta ya respondida fallan silenciosamente (ML no deja re-responder); no rompe nada. |

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

### Forja vs Kooni — comparación (2026-09-02)

| Criterio | Forja | Kooni (v2 Ed25519) | Quién gana |
|---|---|---|---|
| Falsificar un código | Imposible (server) | Imposible (firma Ed25519, sin secreto compartido tras S2/M11) | Empate |
| Evitar uso de Pro gratis | Fuerte — no entrega el código premium sin llave | Débil por diseño — repo MIT público; un técnico quita `isProUnlocked()` | Forja (aceptado a propósito) |
| Revocar una licencia | Fácil — el próximo `validate` falla | Difícil — firma offline no se revoca; solo expiración (códigos mensuales) | Forja |
| Funciona sin internet | Necesita red para validar (con fallback) | Sí, indefinido | Kooni |
| Ingreso recurrente / suscripción | Nativo — sin pago, se corta | Débil — lifetime = pago único; mensual "expira" pero nada fuerza renovación ni corta suave | Forja |
| Gestión de clientes (cuentas, checkout, churn) | Dashboard + OAuth (`forjabot login`) | Joel emite códigos a mano desde su panel InsForge | Forja |
| Fricción de instalación | Login en navegador | Pegar un código (o nada si es gratis) | Kooni |
| Coherencia con "open source MIT" | N/A (cerrado) | Total | según estrategia |

**Modelo Forja** (`cli/bin/cli.js`): `SERVER` = Worker de licencias; `forjabot login` = OAuth
navegador → cuenta en `app.forjabots.com`; `validate`/`claim`/`redeem`/`download/<slug>` — el
tarball del bot premium **está gated** (solo se baja con `X-License-Key` válida). `fingerprint`
= UUID random por instalación (NO hardware — no aporta seguridad real).

**Veredicto:** para **anti-falsificación** están iguales (v2 está bien). Para **ventas** Kooni
está **peor hoy** si el modelo es suscripción; está **bien** si es lifetime fundador (plan I7).

### Modelo elegido (2026-09-02)

**Híbrido: Ed25519 offline como fuente de verdad + capa online OPCIONAL solo para
revocar (abajo) y renovar (rotar el código).** El online nunca otorga Pro que la firma
no respalde → un server comprometido no puede regalar Pro. Fail-open siempre. **NO** se
gatea la descarga del código (se mantiene MIT). El foso de Kooni: instalación asistida
por Claude Code + updates + comunidad/soporte + panel de licencias hospedado + white-label.
No se copia el fingerprint de Forja — el `inst`/`uid` que Kooni ya liga al worker basta.

### ✅ HECHO (2026-09-02) — worker listo para vender suscripciones

| Pieza | Detalle |
|---|---|
| **Periodo de gracia** | `LICENSE_GRACE_MS = 7 días` en `src/license.ts`. Un código `monthly` vencido mantiene el Pro activo 7 días más (la renovación hoy es manual: el dueño genera y envía, el cliente pega — no se corta a nadie por un día de demora). `verifyLicense` ahora delega en `inspectLicense`. |
| **`inspectLicense(code, env)`** | Fuente única de estado: `{ state: active\|grace\|expired\|invalid, payload, expiresAt, daysLeft }`. La usan el panel, el aviso del Resumen y `verifyLicense`. |
| **Panel `/admin/licencia`** | Tarjeta de estado real: "PRO ACTIVO · de por vida" / "· vence en N días (fecha)" / ámbar si ≤ 7 días / rojo "VENCIDA — GRACIA (N días)" / "PLAN GRATIS — venció el …". |
| **Aviso en Resumen** | Banner rojo "tu licencia vence en N días" / "periodo de gracia" con CTA → `/admin/licencia`. Solo aparece con código `monthly` por vencer. |
| **Tests** | +4 en `test/license.test.ts` (gracia, estados de `inspectLicense`), +1 en `test/modules.test.ts`. **`pnpm test` → 728/728 verde · `pnpm typecheck` verde** (corridos de verdad, 2026-09-02). |

Ships **inerte** para los códigos lifetime (ambas instalaciones actuales) — cero cambio
de comportamiento hasta que exista un código mensual.

### ⏳ ROADMAP — construir cuando haya un cliente de suscripción real

> Requiere decisión de negocio (procesador de pagos) + endpoint nuevo en InsForge.
> No arrancar hasta que Joel confirme que vende por suscripción (hoy: lifetime fundador I7).

1. **Endpoint `estado-licencia` (InsForge)** — recibe `{ uid, inst, code }` con
   `X-Kooni-Token` (ya existe como secret `KOONI_REGISTER_TOKEN` / `REGISTER_TOKEN`).
   Responde:
   - `{ status: "active" }` → sin cambios.
   - `{ status: "active", code: "<v2 nuevo>" }` → **auto-renovación**: el server ya rotó
     el código (extendió `expiry`) tras cobrar; el worker lo guarda en `settings.pro_license`.
     Cliente no hace nada. ← la función que hace atractiva la suscripción.
   - `{ status: "revoked" }` → chargeback / reembolso / abuso → baja a Free ya.
   Lee de la tabla `licencias` (`activa`, `expira_en`) que YA existe.
2. **Worker `src/license-check.ts` + cron** — `revalidateLicense(env)` en el tick nocturno:
   si `env.LICENSE_CHECK_URL` está seteada, llama al endpoint; aplica revoke (escribe
   `settings.license_status` = `{status, at}`) o renovación (rota `pro_license`); **fail-open**
   si no hay red. `isProLicense` mira además ese cache: `revoked` fresco (< 3 días) → Free.
   Nueva key `license_status` en `settings.ts`, `LICENSE_CHECK_URL?` en `env.ts`.
3. **Cobro recurrente** — procesador (Stripe / Lemon Squeezy / Mercado Pago). Webhook
   `payment.succeeded` → el panel de licencias rota el código; `subscription.canceled` /
   `charge.refunded` → marca `activa=false`. Decisión de negocio: cuál y comisión.
4. **Aviso automático de vencimiento** — el cron del panel de licencias manda email
   "tu licencia vence en X días" (o el worker lo empuja al dueño por Telegram/PWA push).
5. **UI del panel de licencias** — botón "renovar" por licencia (rota el código y lo
   reenvía), estado activa/vencida/en-gracia por instalación (cruzando con `uso_instalaciones`).
6. **Login del CLI estilo Forja** (cuentas + OAuth navegador) — SOLO si los revendedores
   lo piden. Con `estado-licencia` + auto-renovación, el cliente final no necesita cuenta.

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
| I8 | **Publicar en npm**: `cd cli-kooni && npm login && npm publish`. | ⏳ El paquete `kooni-bot` ya existe (v0.2.8, dueño `nocodeveloper <joeldavidar@gmail.com>`); falta publicar la v0.2.9 con esa cuenta (hoy dio 404 por sesión de otra cuenta). |
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
✅ **RESUELTO** (CLI 0.2.9): el regex de detección de URL ya soporta el subdominio de cuenta
`<worker>.<cuenta>.workers.dev` (antes `[a-z0-9-]+\.workers\.dev` fallaba con el subdominio), y
`DASHBOARD_BASE_URL` se estampa bien tras el deploy. El bot de Joel quedó con la URL correcta
(`kooni-bot-joel-nocode-ec53aa.joeldavidar.workers.dev`).

---

## L. Scraping web con Decodo → KB del agente — ✅ IMPLEMENTADO Y ACTIVO EN CARDEALER (v1.15.0–v1.18.5)

> **Estado 2026-09-02:** funcionando en `cardealer-daniel2` ("Daniel autos").
> `POST /kb/web-sync` → `{ok, scraped:1, updated:1, errors:[]}`. `kb_docs` tiene
> "Inventario web — /llm/inventory/" con **71 vehículos** (VIN, precio, millaje,
> link a la ficha). Se re-sincroniza solo en el tick nocturno.
>
> **Config aplicada (D1 de cardealer):**
> - `web_sync_urls` = `https://www.greenwaykiawestpalmbeach.com/llm/inventory/`
>   (**sin query params** — con `?type=used` o `?limit=100` el sitio devuelve la
>   home genérica; el endpoint pelado ya trae los 100 autos, new + used).
> - `feature_web_sync_enabled` = `1`, `module_unlocks` = `["web_sync"]`.
> - Secrets en el worker: `DECODO_AUTH`, `KB_REINDEX_TOKEN` (fresco — ver bitácora).
> - **Editable:** panel → Extras → "Sincronizar sitio web".
>
> **Bugs encontrados y arreglados en la activación:**
> - **v1.18.3:** `webDocId` generaba ids larguísimos → `dash:<id>#<n>` > 64 bytes
>   → Vectorize los rechazaba → cada URL daba "1 con error". Ahora: prefijo corto
>   + hash. Test que verifica el tope de 64 bytes.
> - **v1.18.4:** `POST /kb/web-sync` con `X-Reindex-Token` (trigger sin panel).
> - **v1.18.5:** `trimBoilerplate()` — recorta nav/footer/cookies del markdown
>   (era ~55% del doc) → de ~35 a **71 autos** en el mismo tope de 24k chars.
> - El banner del panel ahora muestra el primer error concreto, no solo el conteo.
>
> **Pendiente / Fase 2:** el inventario completo son 100 autos; caben 71 en un
> doc (tope `MAX_DOC_CHARS`). Para todos → partir en 2 docs `web:<slug>#a/#b` o
> subir el tope. Solo si Daniel lo pide.
>
> **Cómo quedó:** el endpoint `/llm/inventory/` ya es texto para IA; Decodo con
> `markdown:true` lo devuelve limpio → sin parsear HTML. Cada URL → doc
> `web:<slug>` en `kb_docs`, visible/borrable desde `/admin/kb`. Hash anti
> re-embebido. Tick nocturno (`src/index.ts`). Archivos: `src/integrations/decodo.ts`,
> `src/kb/webSync.ts`, `src/modules.ts`, `src/features.ts`, `src/db/settings.ts`,
> `src/env.ts`, rutas `POST /admin/kb/web-sync` y `POST /kb/web-sync`. Tests:
> `test/integrations/decodo.test.ts`, `test/kb/webSync.test.ts`.

### Plan original (referencia — se siguió con simplificaciones) ⏳

> Objetivo: el bot de **un** cliente responde con información sacada de un sitio
> web, actualizada sola. **No es para todas las instalaciones** — el código viaja
> en el template (inerte) pero solo se enciende en esa instalación.
>
> **Caso concreto (2026-09-02):** el cliente es **cardealer-daniel2 ("Daniel
> autos")** — `kooni-bot-cardealer-daniel2-948b8b`, carpeta
> `C:\Users\joeld\cardealerdaniel`. Vende autos; quiere que el bot conteste con
> la info de fichas/precios de un sitio. El plan de abajo sirve tal cual.
> **Bloqueado a la espera de que Daniel entregue:** (a) API key / user de
> Decodo, (b) la lista EXACTA de URLs, (c) 5 preguntas concretas que el bot
> debe poder contestar con eso, (d) confirmación de permiso para scrapear ese
> sitio. Con (b) ≤ 3 URLs y (c) claras, quizá no haga falta scraping: cargar
> 2-3 docs a mano en `/admin/kb` es gratis y ya funciona. Decidir con esos datos.
>
> **Antes de nada:** actualizar esa instalación (está en v1.12.0) con
> `npx kooni-bot update` — ver el aviso de cuenta de Cloudflare en la bitácora.
>
> Cuando esté listo: implementar Fases 1-4, activar `module_unlocks` +
> `DECODO_*` SOLO en el worker de Daniel, y correr `kooni-bot update` de nuevo
> para traer el código del módulo.

### Idea clave: no hay que tocar al agente

La KB ya existe y ya alimenta al agente: `searchKb` (tool) busca en Vectorize, y
`src/kb/docs.ts` sabe guardar un documento en D1 (`kb_docs`) e indexarlo al
instante (`indexDoc` → borra los vectores viejos del doc → re-embebe → upsert).

Entonces el scraping **no necesita plumbing nuevo en el agente**: basta con
escribir lo scrapeado como un documento de KB más. El agente lo encuentra solo,
en el siguiente mensaje del cliente. Todo lo demás (prompt, tools, citas) queda
igual.

```
Decodo API → HTML → texto limpio → kb_docs (id "web:<slug>") → indexDoc()
                                                                    ↓
                                        Vectorize ← searchKb ← el agente responde
```

### Cómo se aísla a UNA sola instalación (dos candados independientes)

El repo ya tiene el mecanismo exacto para esto; **no hay que forkear** (un fork
rompería `/actualizar-mi-bot`, que es justamente la promesa del producto).

1. **Módulo de pago** nuevo (`src/modules.ts`, id `web_sync`). Se activa por
   instalación con el setting `module_unlocks` de D1 — el override del dueño que
   ya existe y está pensado para esto: *"activa módulos a mano por instalación
   sin generar códigos"*. En cualquier otra instalación el módulo está bloqueado
   y la función no hace nada.
2. **Credenciales** de Decodo como secret (`DECODO_USER` / `DECODO_PASS`) puestas
   **solo en ese worker**. Sin ellas, la función se apaga sola.

Los dos candados fallan cerrados y son independientes: aunque alguien active el
módulo por error, sin credenciales no scrapea nada.

### API de Decodo (contrato real, verificado en su repo)

- `POST https://scraper-api.decodo.com/v2/scrape`
- Auth: **Basic** (`Authorization: Basic base64(user:pass)`)
- Body: `{ target: "universal", url, headless: "html", geo?, locale?, device_type? }`
- Respuesta: `{ results: [{ content, status_code, url, task_id, created_at, updated_at }] }`
- `content` viene **HTML crudo** (no hay parseo ni markdown) → hay que limpiarlo.
- Códigos: `200` ok · `204` job pendiente · `401` credenciales · `429` rate limit · `524` timeout.

> `headless: "html"` ejecuta JavaScript (necesario si el sitio arma el contenido
> en el cliente). Cuesta más por request — usarlo solo si el sitio lo necesita.

### Archivos a tocar (concreto)

| Archivo | Qué |
|---|---|
| `src/integrations/decodo.ts` *(nuevo)* | Cliente del API + limpieza HTML→texto. Modelo a seguir: `src/integrations/calcom.ts`. |
| `src/kb/webSync.ts` *(nuevo)* | Orquesta: por cada URL configurada → scrapea → limpia → compara hash → `KbDocsRepo.upsert` → `indexDoc`. |
| `src/modules.ts` | Alta del módulo `web_sync` en `PAID_MODULES`. |
| `src/features.ts` | Card en Extras con `config` (URLs, cada cuánto). El patrón de campos extra ya existe. |
| `src/db/settings.ts` | `SETTING_KEYS`: urls, último hash por URL, última corrida. |
| `src/env.ts` | `DECODO_USER?`, `DECODO_PASS?` (opcionales — ausentes = apagado). |
| `src/index.ts` | Llamar `webSync` **dentro del tick nocturno** que ya existe. |
| `test/integrations/decodo.test.ts`, `test/kb/webSync.test.ts` *(nuevos)* | Modelo: `test/integrations/calcom.test.ts`. |

### Decisiones de diseño (el por qué, para no repensarlo después)

1. **HTML→texto con `HTMLRewriter`**, no con una librería. Es nativo de Workers,
   streaming, cero dependencias nuevas. Se descartan `<script>`, `<style>`,
   `<nav>`, `<footer>`; se conserva el texto de `<main>`/`<article>` si existen.
2. **NO agregar un cron nuevo.** `src/crons/schedule.ts` documenta la trampa: el
   tick nocturno se identifica por el literal `DAILY_CRON = "0 3 * * *"` y
   `test/crons/schedule.test.ts` falla si `wrangler.toml` se desalinea. El sync
   va **dentro** del tick nocturno que ya corre.
3. **Hash antes de re-embeber.** Guardar un hash del texto por URL; si no cambió,
   no se re-indexa. Embeber cuesta (Workers AI) y re-indexar sin cambios es tirar
   plata y cuota. Este es el detalle que decide si la función es barata o cara.
4. **Respetar los límites de la KB que ya existen**: `MAX_DOC_CHARS = 24_000` y
   `MAX_CHUNKS = 24` por documento (`src/kb/docs.ts`). Si una página es más
   larga, se trunca — o se parte en varios docs `web:<slug>#<n>`.
5. **Un doc por URL, id namespaceado `web:<slug>`.** Así el dueño ve y puede
   borrar lo scrapeado desde `/admin/kb` como cualquier otro documento, y nunca
   colisiona con los suyos (`dash:…`) ni con los fixtures del repo.
6. **Fail-open y silencioso.** Si Decodo falla, se loguea (`console.warn`) y el
   bot sigue exactamente igual. Un scraper caído jamás puede tumbar respuestas —
   misma convención que `modules.ts` y `limits.ts`.
7. **Tope de páginas** (ej. 20) y de frecuencia. Sin tope, un sitemap grande se
   come el presupuesto de Decodo y de embeddings en una noche.

### Antes de escribir código, definir con el cliente

- **Qué URLs exactamente** (lista fija) vs. **seguir enlaces** (crawl). Empezar
  con lista fija: es 10× más simple y suele alcanzar.
- **Cada cuánto** cambia esa información de verdad (diario, semanal). Casi
  siempre alcanza semanal.
- **Qué preguntas** debería poder contestar el bot con eso. Si no hay 5 preguntas
  concretas, probablemente el cliente no necesita scraping sino cargar 2 docs a
  mano en `/admin/kb` — y eso es gratis y ya funciona hoy.
- **Permiso**: que sea el sitio del propio cliente o uno que tenga derecho a
  scrapear; respetar `robots.txt`. Vale una línea en el contrato.

### Fases sugeridas

| Fase | Qué | Por qué en este orden |
|---|---|---|
| 1 | `decodo.ts`: scrapear **una** URL y devolver texto limpio + test | Aísla el riesgo del API externo antes de tocar la KB. |
| 2 | `webSync.ts`: una URL → `kb_doc` → `indexDoc`, disparado a mano | Prueba el pipeline completo con el bot real respondiendo. |
| 3 | Lista de URLs + hash + tope + tick nocturno | Recién acá se automatiza, con el pipeline ya probado. |
| 4 | Módulo `web_sync` + card en Extras + activar `module_unlocks` en ESA instalación | El candado se pone al final: primero que funcione. |

> **Si después lo quieren todos**: no hay que reescribir nada — es agregar el
> módulo al catálogo vendible y activarlo por licencia. Ese es el beneficio de
> hacerlo como módulo desde el día uno en vez de como parche para un cliente.

---

## M. La siguiente tarea (recomendación) — cerrar el círculo de licencias

> Todo lo demás depende de esto. Hoy el sistema está a mitad de camino: el worker
> ya solo acepta v2, pero **nadie puede emitir un v2 todavía** hasta que InsForge
> tenga la privada. Mientras eso no pase, no se puede vender ni activar nada.

| # | Paso | Dónde |
|---|---|---|
| 1 | Guardar la privada en el gestor de contraseñas y **borrar** `admin-pagos/CLAVE-PRIVADA-LICENCIAS.txt`. | Tu máquina |
| 2 | Cargar el secret `LICENSE_PRIVATE_KEY` con ese valor. | InsForge |
| 3 | Desplegar **solo** la función `generar-licencia` (¡no la carpeta entera — ver M12!). | InsForge |
| 4 | Borrar las licencias viejas (todas son v1 → el worker ya las rechaza; ver nota abajo). | Panel InsForge / dashboard |
| 5 | ~~`pnpm test && pnpm typecheck`~~ **✅ Hecho (01-sep): 625 tests OK, typecheck limpio.** Falta el "y, si pasa, desplegar el worker" — sigue pendiente, decisión tuya de cuándo. | Tu máquina |
| 5b | ~~Publicar el CLI 0.3.0 en npm~~ **✅ Hecho (01-sep): `kooni-bot@0.3.1` es `latest`.** Se publicó 0.3.0 primero; al verificar con `npx kooni-bot version` se encontró que `CLI_VERSION` estaba **hardcodeada** en el código (`"0.2.17"`, nunca actualizada en la migración) — afectaba también la telemetría `cliVersion` enviada a `registrar-instalacion`. Corregido para leer del `package.json` en runtime y republicado como 0.3.1. | npm |
| 6 | ~~Emitir **una** licencia real desde el panel y activarla en un bot~~ **✅ Hecho (01-sep) — con un cliente real** (ver M15): Daniel (cardealer-dani) recibió y activó su código v2 tras la migración. | Panel + `/admin/licencia` |

Recién con el paso 6 verde el círculo está cerrado: se puede firmar, emitir,
activar y cobrar. Antes de eso, cualquier feature nueva (incluida la de Decodo)
no se puede monetizar.

> **Sobre borrar las licencias viejas:** no hace falta —ni conviene— construir un
> endpoint de borrado para una limpieza de una sola vez. El sistema acaba de pasar
> una auditoría de seguridad; agregar una API que borra filas es superficie nueva
> para siempre a cambio de un uso único. Se borra a mano desde el dashboard de
> InsForge (tabla `licencias`). Ojo: `generar-licencia` crea **también** una fila
> en `clientes` — si borrás solo las licencias, quedan clientes huérfanos en la
> lista; decidí si esos también se van.

---

## N. Antes de construir el módulo 15 — medir, no adivinar

> Respuesta corta a "¿qué otras mejoras integrar sin volverlo un complejo de
> funciones sin sentido?": **el mayor riesgo del producto hoy no es que le falten
> funciones — es que le sobren.** Hay 14 módulos de pago en `src/modules.ts` y
> ningún dato de cuáles se usan.

`src/usage.ts` ya reporta al panel de licencias, por instalación, los conteos, los
canales y hasta **qué tools usó el bot** (`tools30`). Desde el 01-sep reporta
además **qué módulos están desbloqueados** (tarea M10). Con dos o tres semanas de
esos datos vas a saber, con números y no con intuición:

- qué módulos nadie enciende → **candidatos a borrar o fusionar** (menos código,
  menos panel, menos soporte),
- qué módulos enciende todo el mundo → **candidatos a subir al plan base** (o a
  subirles el precio),
- qué tools dispara el bot de verdad → dónde vale la pena invertir.

Falta un paso chico para cerrarlo: mostrar esa agregación en el panel de
licencias (ya recibe el dato). Es la mejora de mayor retorno por línea de código
que tiene el sistema hoy, porque decide todas las demás.

### Mejoras que sí valen (pocas, y aterrizadas en APIs que ya usás)

| # | Mejora | Por qué vale | Costo |
|---|---|---|---|
| N1 | **Usar `reaction.received` de Zernio.** Hoy el webhook lo recibe y lo tira (`src/channels/zernio.ts`: *"reaction.received → ack, se ignora"*). Un ❤️ a un DM es la señal más barata que existe de "este cliente está contento / sigue tibio": alimenta **Pide reseñas** (pedir la reseña de Google justo en ese momento) y **Cazador** (no re-escribir a quien acaba de reaccionar). | Reusa dos módulos que ya existen y ya se venden. No agrega superficie al panel. | Bajo |
| N2 | **Generalizar el web-sync de Decodo** (sección L) a "tu web siempre al día en el bot". | Es el mismo código, ya escrito para el cliente único: pasa de parche a módulo vendible con solo activarlo. Resuelve el dolor #1 real de la KB: que envejece. | Cero extra si L se hace como módulo |
| N3 | **Catálogo/precios por el mismo pipeline.** Mismo scraping, otro parser, alimentando `catalogQuery` (que ya existe y ya es Pro-only) en vez de la KB de texto. | Convierte "el bot sabe de la web" en "el bot cotiza" — que es lo que la gente paga. | Medio, y **solo cuando un cliente lo pida** |

### Qué NO construir (el filtro)

- **Más canales.** Ya hay Telegram, Zernio (IG/FB/X/TG/WhatsApp/Bluesky/Reddit),
  Twilio, ManyChat, Meta, WAHA. El siguiente canal no mueve la aguja.
- **Módulos nuevos "por si acaso".** Ver arriba: primero medir cuáles de los 14
  se usan. Cada módulo nuevo es panel, docs, soporte y superficie de bugs para
  siempre.
- **Un constructor visual de automatizaciones / flujos.** Es un producto entero,
  no una feature; y los 4 tipos de automatización que ya existen cubren el caso
  real de estos clientes.
- **Más tableros.** Ya hay Insights, Estadísticas y Costos. Si `usage.ts` muestra
  que casi nadie los abre, la conclusión es quitar, no agregar.
- **Login/dispositivo estilo Forja** (sección F): sigue sin justificarse hasta que
  haya recurrencia real que facturar. La licencia por código ya resuelve el 100%
  del caso de hoy.

---

## O. Pantalla de login del panel — de modal del navegador a página propia ✅ (COMPLETO, O1-O8)

> **Estado:** implementado y verificado. `GET/POST /admin/login` +
> `GET /admin/logout` (rutas públicas, antes del guard), sesión por cookie
> firmada con `DASHBOARD_PASSWORD` (sin tabla D1). `loginPage()` reescrita a dos
> columnas (marca blanca vía `resolveBrand` + versión).
>
> **v1.13.3 — fix del guard:** una **carga de página en el navegador** ahora
> cuenta SOLO la cookie de sesión. Antes aceptaba también Basic Auth, así que un
> navegador con la credencial Basic vieja guardada nunca veía la página de login
> y "Cerrar sesión" no hacía nada (redirigía de vuelta al panel). Las peticiones
> no-navegación (htmx, API, scripts, tests) siguen aceptando cookie **o** Basic.
>
> **v1.13.4 — O5:** rate-limit del login. `POST /admin/login` cuenta fallos por
> IP (`login_attempts` en D1, ip_hash SHA-256, ventana 15 min, tope 8). Al pasar
> el tope se rechaza sin comprobar la contraseña; un login correcto borra el
> contador. Fail-open si D1 falla. Cierra **S5**.
>
> Tests: `test/admin/login-page.test.ts`, `test/db/loginAttempts.test.ts`.

> Pedido (01-sep): reemplazar el diálogo nativo de Basic Auth por una página de
> login propia, dos columnas — izquierda: marca Kooni + subtítulo "agentes de
> IA" + número de versión; derecha: el formulario. **Todo lo demás queda igual**
> (funciones, íconos, navegación). Este documento es el análisis + plan de
> tareas; no se tocó código todavía.

### Por qué no es solo CSS

Hoy `/admin/*` está protegido por **HTTP Basic Auth** (`src/admin/auth.ts`,
`hono/basic-auth`): el navegador muestra su propio diálogo nativo — Kooni no
renderiza esa UI, así que no hay "pantalla" que rediseñar todavía. Para que
exista una página real hay que reemplazar el mecanismo: de "credenciales en un
header por request, sin estado" a "un formulario POST que abre una sesión".

**Dato a favor:** ya existe una función `loginPage()` en `src/admin/views/layout.ts`
(líneas 494-526) — código muerto de un diseño de magic-link por email que nunca
se conectó (no hay ninguna ruta `/admin/auth/request`). Sirve de referencia de
estilo (usa los mismos tokens, el glifo K), pero es de una sola columna y para
el flujo equivocado (email, no password) — hay que reemplazarla, no solo
conectarla.

### Decisión de diseño clave: sumar, no reemplazar

Reescribir el auth para que TODO pase por cookie rompería `checkBasicCredentials`
y los ~7 archivos de test que autentican contra `adminApp` con un header
`Authorization: Basic ...` (`test/admin/routes.test.ts`, `auth.test.ts`, y 5
más). **Recomendación: que el middleware acepte los dos** — sesión por cookie
(la persona, vía la página nueva) O header Basic (scripts/tests, sin cambios).
Así la superficie de riesgo se limita a lo nuevo; nada que ya funciona se toca.

### Tareas

| # | Tarea | Archivo(s) | Estado |
|---|---|---|---|
| O1–O4, O6–O8 | Implementados y verificados (`pnpm typecheck` limpio, 51/51 tests de auth/login/routes en verde). Cookie `kooni_admin_session` firmada HMAC-SHA256 con `DASHBOARD_PASSWORD`, 30 días. Logout limpia la cookie (`deleteCookie`) y redirige. `loginPage()` reescrita a dos columnas con `resolveBrand` + `BOT_VERSION`. Comentarios viejos de "Basic Auth / no /login" corregidos en `routes.ts` e `index.ts`. | — | ✅ |
| O5 | **Rate-limit del login** — ✅ hecho (v1.13.4). Tabla D1 `login_attempts` (en `schema.sql`), `src/db/loginAttempts.ts`, gate en `POST /admin/login`. Cierra S5. | `src/db/loginAttempts.ts`, `src/db/schema.sql`, `src/admin/routes.ts` | ✅ |
| O1 | **Endpoint de sesión**: `POST /admin/login` — valida el password contra `DASHBOARD_PASSWORD` (reusar `timingSafeEqual` de `auth.ts`) y, si es correcto, pone una cookie `HttpOnly; Secure; SameSite=Lax`. Valor de la cookie: HMAC/hash del password + expiración firmada (no un session store en D1) — así rotar `DASHBOARD_PASSWORD` invalida sesiones viejas solas. | `src/admin/auth.ts` (nueva función) | Sin tabla nueva en D1. |
| O2 | **Middleware actualizado**: `adminAuth` acepta sesión por cookie **o** Basic Auth (ver arriba). Si ninguna vale: navegación de navegador (`Accept: text/html`) → `302` a `/admin/login`; petición de API/htmx → `401` (igual que hoy, para no romper los fetch internos del panel). | `src/admin/auth.ts`, `src/admin/routes.ts` | El gate en `routes.ts:93` cambia de "siempre Basic" a "cookie u Basic". |
| O3 | **Página `GET /admin/login`** (pública, sin auth): dos columnas. Izquierda: `resolveBrand(env)` (para que blanco-marca herede su propio nombre/logo/color — nunca hardcodear "Kooni"), subtítulo "Agentes de IA" (o el tagline de marca), `BOT_VERSION` (`src/version.ts`, ya existe). Derecha: `<form method="POST" action="/admin/login">` con un solo campo password (usuario fijo "admin", igual que hoy) + botón `bigbtn`. Reusa `HEAD_ASSETS`/`GLOBAL_STYLE` de `layout.ts` tal cual — mismos tokens, misma tipografía, mismas animaciones. Responsive: en mobile colapsa a una columna (mismo patrón `@media (max-width:767px)` que ya usa el sidebar). | `src/admin/views/layout.ts` (reemplaza `loginPage()`) | Mostrar error si el password es incorrecto (mismo `?error=` que ya soporta la función vieja). |
| O4 | **Logout**: cambiar `/admin/logout` — hoy fuerza un 401 con `WWW-Authenticate` (el truco de Basic Auth para que el navegador "olvide" la credencial); con cookie, pasa a limpiar la cookie (`Set-Cookie` con `Max-Age=0`) y redirigir a `/admin/login`. | `src/admin/routes.ts:125-134` | El botón "Cerrar sesión" del header (`layout.ts:418`) sigue apuntando ahí sin cambios. |
| O5 | **Rate-limit del login** (opcional, recomendado): sin esto, un formulario propio es un blanco más cómodo para fuerza bruta que el diálogo nativo (que al menos frena con reintentos molestos del navegador). Reusar el patrón ya probado en `admin-pagos/functions/auth-login.ts` (contador simple, ventana de 15 min) pero en D1 en vez de la tabla de InsForge — es el hallazgo **S5** pendiente del PLAN, así que esta tarea lo cierra de paso. | `src/admin/auth.ts` + tabla D1 nueva (`login_attempts`) | Fail-open: si D1 falla, no bloquear el login. |
| O6 | **Tests**: nuevos para O1/O2 (sesión válida/inválida/expirada, cookie tamperada) y para el render de O3 (branding correcto, versión visible). Los 7 archivos existentes con `Authorization: Basic` **no deberían necesitar cambios** — es justo el punto de la decisión de diseño de arriba; confirmarlo corriendo `pnpm test` completo al terminar, no solo los nuevos. | `test/admin/auth.test.ts`, nuevo `test/admin/login-page.test.ts` | — |
| O7 | **Limpieza**: borrar la `loginPage()` vieja (o reescribirla in-place, a gusto), y el comentario desactualizado en `routes.ts:4-8` ("Auth is HTTP Basic Auth... There are NO /login or /logout routes"). | `src/admin/views/layout.ts`, `src/admin/routes.ts` | — |
| O8 | **Docs**: `docs/USO.md`/`docs/DESPLIEGUE.md` si mencionan el diálogo nativo del navegador como el login; `docs/IDENTIDAD-KOONI.md:88` ya anticipa una página de login con el glifo K — actualizar la referencia a la implementación real. | `docs/USO.md`, `docs/DESPLIEGUE.md`, `docs/IDENTIDAD-KOONI.md` | — |

### Orden sugerido

O1 → O2 → O3 → O4 (mecanismo primero, con Basic Auth como red de seguridad
mientras se prueba) → O6 (verificar que nada viejo se rompió) → O5 (hardening) →
O7 + O8 (limpieza y docs). Riesgo de romper algo existente: bajo, si se respeta
la decisión de "sumar, no reemplazar" del §O — el mayor riesgo es tocar el
middleware de `routes.ts:93` sin probar los 7 tests de Basic Auth después.

---

## P. Comentario sin automatización → respuesta pública (opcional) ✅ (v1.13.2)

> **Historia:** la v1.13.0 forzó TODOS los comentarios a respuesta pública y quitó
> las opciones de DM del panel. Mal — revertido en v1.13.1. Esta es la versión
> correcta:
>
> - **Las automatizaciones NO cambian.** Siguen eligiendo por regla: *DM privado*,
>   *respuesta pública*, *ambas* y *follow gate*. Todo intacto.
> - **Lo nuevo — un toggle** en el panel → **Automatizaciones** (arriba de la
>   lista): checkbox "Responder en público los comentarios sin automatización" +
>   un mensaje. Default **apagado**.
>   - Encendido: un comentario de primer nivel que no matchea ninguna regla
>     recibe ese texto **como respuesta pública** (`kind` sintético
>     `comment_reply` → nunca DM). Reusa el dedup por huella, el anti-bucle
>     (cuenta propia / `isReply`) y el tope diario `MAX_PUBLIC_REPLIES_PER_DAY`.
>   - Apagado: el comentario se ignora, igual que siempre.

| Cambio | Archivo |
|---|---|
| Settings nuevas: `comment_fallback_enabled` / `comment_fallback_message` | `src/db/settings.ts` |
| `buildCommentFallbackRule()` + rama `!matched` en `autoDmOnComment` | `src/channels/zernio.ts` |
| Card checkbox+mensaje arriba de la lista de reglas | `src/admin/views/automatizaciones.ts` |
| `POST /admin/automatizaciones/fallback` | `src/admin/routes.ts` |
| Tests: `test/channels/zernio.test.ts` (bloque "comentarios sin automatización") | — |

---

## Q. PWA del panel — instalable + avisos push

> **Meta:** que el dueño tenga el panel como app en el celular (ícono en pantalla
> de inicio, pantalla completa) y reciba **avisos push** cuando pasa algo
> (prospecto nuevo, ticket, alerta del Vigilante). Nada de config avanzada:
> datos, conversaciones, avisos.

### Fase 0 — Instalable ✅ (hecho)

| Cambio | Archivo |
|---|---|
| `manifest.webmanifest` + `sw.js` + `icon.svg` (network-first, respaldo offline) | `src/admin/pwa.ts` |
| Rutas públicas `/admin/manifest.webmanifest` · `/admin/sw.js` · `/admin/icon.svg` (antes del guard) | `src/admin/routes.ts` |
| `<link rel=manifest>` + theme-color + apple-touch-icon + registro del SW en el `<head>` (panel y login) | `src/admin/views/layout.ts` |
| Tests | `test/admin/pwa.test.ts` |

El service worker ya trae los handlers `push` y `notificationclick` — la Fase 1
solo agrega el emisor y la tabla de suscripciones.

### Fase 1 — Notificaciones push ✅ (v1.16.0)

**Cómo quedó:**
- `src/push.ts`: `vapidJwt()` (ES256 con WebCrypto — reconstruye el JWK desde
  pública+privada) + `notifyOwnerPush()`. **Push SIN cuerpo** — el SW, al
  recibirlo, pide `/admin/push/latest` y muestra el aviso. Así se evita toda la
  cifra RFC 8291.
- `src/db/push.ts`: `push_subscriptions` + `push_events` (cola). Purga a 7 días
  en el tick nocturno.
- Rutas: `GET /admin/push/config`, `POST /admin/push/subscribe` · `/unsubscribe`
  · `/test`, `GET /admin/push/latest` (lo llama el SW con `credentials:include`).
- UI: botón campana en el header (`#kooni-push`), aparece solo si el worker
  tiene VAPID. Suscribe/desuscribe este dispositivo; manda un aviso de prueba al
  activar.
- Disparadores: `notifyOwner()` (handoff/ticket) y `captureLead` (nuevo prospecto).
  Falta: sumar el Vigilante.
- **Config por instalación:** `VAPID_PUBLIC_KEY` + `VAPID_SUBJECT` (vars en
  `wrangler.toml`), `VAPID_PRIVATE_KEY` (secret). Sin las 3 → botón oculto, no
  se manda nada.

Tests: `test/push.test.ts` (incluye verificar la firma ES256 con la pública),
`test/admin/pwa.test.ts`.

⚠️ **iOS:** el push solo llega con la PWA instalada en pantalla de inicio (iOS 16.4+).

### (histórico) plan original de la Fase 1

1. **Claves VAPID** (una vez): NO se piden a ningún servicio — se generan. Un par
   ECDSA P-256. En la carpeta del bot:
   `npx web-push generate-vapid-keys` (o `node scripts/gen-vapid.mjs` — script
   nuevo, ~10 líneas con `node:crypto`). Da dos strings base64url:
   - **pública** → va como var `VAPID_PUBLIC_KEY` en `wrangler.toml` (o la
     embebe el worker; es pública por diseño, va en el JS del cliente).
   - **privada** → `wrangler secret put VAPID_PRIVATE_KEY` (nunca en git).
   - `VAPID_SUBJECT` = `mailto:<correo del dueño>`.
   > Se puede hacer por instalación (cada bot su par) o un par global del
   > template. Por instalación es más limpio.
2. **Tabla D1** `push_subscriptions` (endpoint TEXT PK, p256dh, auth, created_at) en `src/db/schema.sql`
   + `PushSubscriptionsRepo` en `src/db/pushSubs.ts`.
3. **`src/push.ts`**: `vapidJwt(env, audience)` + `sendPush(env, sub, payload)`.
   Empezar **sin payload cifrado** (RFC 8291 es complejo): push vacío → el SW
   muestra un aviso genérico y al tocarlo abre `/admin/overview`. Si luego se
   quiere texto en el aviso, ahí se agrega la cifra `aes128gcm`.
4. **Endpoints** en `adminApp` (con auth): `POST /admin/push/subscribe`,
   `POST /admin/push/unsubscribe`, y `GET /admin/push/key` (devuelve la pública).
5. **UI**: botón "Activar avisos en este dispositivo" en Configuración (o en el
   Resumen). Llama `Notification.requestPermission()` + `pushManager.subscribe()`
   con la clave pública, y postea la suscripción.
6. **Disparadores** (reusar los puntos que hoy avisan por Telegram):
   - `notifyOwner()` en `src/tools/handoffHuman.ts` → push además del Telegram/WA/email.
   - Vigilante (`src/vigilante.ts`) → push cuando detecta cliente molesto / venta en riesgo.
   - Lead nuevo: en `captureLead.execute` o en el cron de resumen.
   - Limpiar suscripciones muertas cuando el push devuelve 404/410.

⚠️ **iOS:** el push solo llega si la PWA está **instalada** en pantalla de inicio
(iOS 16.4+). Android y escritorio funcionan sin instalar.

### Fase 2 — Lectura offline de datos

Hoy las vistas devuelven HTML; para offline hacen falta endpoints JSON ligeros:
`GET /admin/api/overview` · `/api/conversations?limit=30` · `/api/leads` · `/api/tickets`.
El SW cachea la última respuesta de cada uno (stale-while-revalidate) → abrir la
app sin señal muestra los últimos datos.

### Fase 3 — Bandeja móvil

Vista "Inbox" pensada para celular (lista de chats → hilo → responder). Reusa
`POST /admin/conversations/:id/reply` que ya existe. Junto con la corrección de
los mensajes de la app nativa (§ commit "registrar respuestas del negocio"),
queda una bandeja unificada real en el bolsillo.

### Recomendación

Fase 0 (hecha) + Fase 1 dan el 80% del valor. Fases 2-3 después. Nada necesita
servidor nuevo — todo vive en el Worker + D1.

---

## R. Atribución y rendimiento de campañas — ⏸️ PAUSADO TOTALMENTE

> **Pedido (prueba de Joel):** "revisa si Zernio puede reconocer si el mensaje
> viene de una campaña para marcarlo, y tener datos de ventas / rendimiento de
> mensajes de campañas en el dashboard."
>
> **Decisión (2026-09-02):** **pausado del todo.** Joel lo confirmó dos veces.
> No se construye nada, ni la parte que hoy sería posible con Zernio. El plan de
> abajo queda **archivado** — se retoma SOLO si Joel lo pide explícitamente
> (idealmente cuando una instalación esté en Meta oficial o ManyChat, que sí
> entregan el `referral` del anuncio; Zernio no).

### Análisis — ¿qué señal de campaña tenemos por canal?

| Canal | Trae origen del anuncio / ref | Cómo |
|---|---|---|
| **Zernio** (hoy) | ❌ No | `ZernioMessage` / `ZernioConversation` no traen `referral` / `ref` / `utm` / `ads_context`. Habría que pedírselo a soporte de Zernio. |
| **Meta oficial** (Messenger + IG DM) | ✅ Sí | Evento `messaging.referral` y `postback.referral`: `{ ref, source: "ADS"\|"SHORTLINK"\|"CUSTOMER_CHAT_PLUGIN"…, ads_context_data: { ad_title, post_id, photo_url } }`. Links `m.me/<pág>?ref=<campaña>` y `ig.me/m/<user>?ref=<campaña>`. Anuncios click-to-Messenger/IG lo mandan solos. |
| **ManyChat** | 🟡 Parcial | El flujo de ManyChat puede pasar la atribución del anuncio como custom field / `last_input_text` si se configura; menos directo que Meta nativo pero suficiente. |

**Lo que SÍ es señal de campaña hoy y ya se registra a medias** (sirve para
cualquier canal, no depende de `referral`):

| Señal | Tabla existente | Qué falta |
|---|---|---|
| Comentario con keyword en un post promocionado → el bot manda DM | `comments` (`rule_id`, `dm_sent`, `public_reply_sent`), `processed_comments`, `dm_logs` (`rule_id`, `status`) | Nada; ya se guarda por regla. |
| Clic en el link del DM automático | `auto_rule_clicks` (por `slug`) + `auto_rule_links` (`slug` → `rule_id`) | Nada; ya se cuenta por regla. |
| El DM derivó en conversación / lead / venta | — | **El eslabón que falta.** No hay stamp de "esta conversación nació de la regla X". |

`keyword_hits` (schema) está declarada pero **nunca se escribe** — es un stub;
no sirve de puente hoy.

**Lo que SÍ es una señal de campaña, y ya se registra a medias:**

| Señal | Tabla existente | Qué falta |
|---|---|---|
| Comentario con keyword en un post promocionado → el bot manda DM | `comments` (`rule_id`, `dm_sent`, `public_reply_sent`), `processed_comments`, `dm_logs` (`rule_id`, `status`) | Nada; ya se guarda por regla. |
| Clic en el link del DM automático | `auto_rule_clicks` (por `slug`) + `auto_rule_links` (`slug` → `rule_id`) | Nada; ya se cuenta por regla. |
| El DM derivó en conversación / lead / venta | — | **El eslabón que falta.** No hay stamp de "esta conversación nació de la regla X". |

`keyword_hits` (schema) está declarada pero **nunca se escribe** — es un stub;
no sirve de puente hoy.

### Plan — 2 fases

**Fase 1 — Panel "Rendimiento de campañas" (solo lectura, sin tocar webhooks ni esquema).**

Agrega una vista que agrega lo que YA se guarda, por regla activa de
`auto_rules` (cada regla = una campaña de comentario→DM):

- comentarios que matchearon  = `COUNT(comments WHERE rule_id = ?)`
- DMs enviados                 = `COUNT(dm_logs WHERE rule_id = ? AND kind IN ('dm_reply','comment_dm') AND status='sent')`
- respuestas públicas          = `COUNT(comments WHERE rule_id = ? AND public_reply_sent = 1)`
- clics en el link             = `COUNT(auto_rule_clicks JOIN auto_rule_links USING(slug) WHERE rule_id = ?)`
- tasa de clic                 = clics / DMs enviados

Tareas:
1. `src/db/campaignStats.ts` — un repo con esas 4-5 consultas agregadas por `rule_id` y por rango de fechas.
2. `src/admin/views/campanas.ts` o vista nueva `rendimiento.ts` — tabla: regla · keywords · comentarios · DMs · clics · % clic. Link a la pestaña Automatizaciones.
3. Entrada en el nav (dentro de "Automatizaciones" o "Estadísticas" — Pro-gate como el resto de métricas).
4. Tests: `test/db/campaignStats.test.ts` con D1 stub.

Riesgo: bajo. Sin migración, sin cambios en el flujo de mensajes.

**Fase 2 — Atribución hasta la venta (stamp de origen en la conversación).**

Cuando una conversación nace de un DM automático de comentario, marcarla con su
origen y propagarlo al lead.

Tareas:
1. **Esquema:** reusar `conversations.metadata` (JSON, ya existe) — no hace falta
   columna nueva. Guardar `{ source: "comment_dm", ruleId, postId, keyword, at }`.
2. **Puente comentario → conversación.** El DM se manda con
   `private-reply` (`sendCommentActions`), pero la conversación se crea recién
   cuando la persona responde. Opciones:
   - (a) Si la respuesta de `private-reply` de Zernio trae `conversationId`,
     stampear ahí mismo. **Verificar el contrato primero.**
   - (b) Tabla chica `pending_attribution (account_id, commenter_id, rule_id,
     post_id, keyword, created_at)` con TTL ~7 días. Al entrar el primer
     `message.received` de ese usuario, si hay pending → stampear la
     conversación y borrar el pending. Reusa el patrón de `follow_gate_pending`.
3. **Propagar al lead:** en `captureLead.execute`, leer `conversations.metadata.source`
   y copiarlo a `lead.metadata.source` / `lead.metadata.campaignRuleId`.
4. **Dashboard:** extender el panel de la Fase 1 con el embudo completo:
   comentarios → DMs → respondieron → leads → vendidos ($), por regla.
5. **Conversaciones:** chip "Campaña: <keyword>" en el hilo (como el chip de canal).
6. Tests: puente de atribución, propagación al lead, agregados del embudo.

Riesgo: medio (toca el parser del canal y `captureLead`).

**Fase 3 — Origen del anuncio (`referral`), solo con Meta/ManyChat.**

Cuando la instalación esté en Meta oficial o ManyChat:
1. Parsear `messaging.referral` / `postback.referral` en `src/channels/meta.ts`
   (y el equivalente en `manychat.ts`) → `{ ref, source, adTitle, postId }`.
2. Al crear la conversación, stampear `conversations.metadata.ad = { ref, source, … }`.
3. Convención de `ref`: el dueño pone `?ref=<slug-campaña>` en el link del anuncio;
   el panel agrupa por ese slug.
4. Dashboard: cruzar anuncio (`ref`) → conversaciones → leads → ventas.

### Cuándo se retoma

- **Disparador:** la instalación (de Joel u otra) migra a **Meta oficial** o
  **ManyChat** como canal de IG/Messenger.
- **Antes de codear:** confirmar que ese canal entrega `referral` en el webhook
  (Meta sí; ManyChat depende de cómo esté armado el flujo).
- **Orden:** Fase 1 (panel solo-lectura, sirve ya con Zernio) → Fase 2 (stamp
  comentario→DM) → Fase 3 (`referral` de anuncios).
- **No hacer ahora** con Zernio: sin `referral` el dato queda a medias y no
  justifica el trabajo.

---

## S. Panel — filtros de conversaciones, responsive y PWA install

> **Pedido (prueba de Joel, 2026-09-01):** más filtros en Conversaciones (canal,
> nombre, fechas), mejorar la vista responsiva / menús en móvil, y "en móvil no
> se ve la PWA para instalar".

### S1 — Filtros de la bandeja de conversaciones ✅ (v1.14.5)

**Hecho** (`conversations.ts`, `routes.ts`):
- **Filtro por canal** — `<select>` con los canales presentes (`SELECT DISTINCT
  channel`), navega al cambiar. `?ch=<canal>`.
- **Filtro por fecha** — chips "Cualquier fecha / 24 h / 7 días / 30 días" sobre
  `c.last_message_at`. `?d=1|7|30`.
- **Búsqueda ampliada** — ahora matchea nombre, id del canal **y el texto de
  cualquier mensaje** del hilo.
- Todos los filtros se combinan y persisten en la URL (`f`, `q`, `ch`, `d`) — el
  refresco HTMX y los pills los conservan. Chip "✕ limpiar" cuando hay filtros.
- Helper `inboxParamsFrom()` para leer los params en las dos rutas.
- Tests en `test/admin/inbox.test.ts`.

### S2 — Responsive / menús en móvil — plan por fases

Breakpoint del panel: `max-width:767px` (el login usa 900; se deja como está).

**Fase 1 — Shell, navegación y bandeja ✅ (v1.14.3)**

| Cambio | Archivo |
|---|---|
| Sidebar → **cajón deslizable** (off-canvas) en móvil. Botón hamburguesa en el header; backdrop; cierra al tocar link / backdrop / Escape. Se conservan secciones, acordeón y pie (antes en móvil era una tira de iconos con scroll horizontal). | `layout.ts` (`GLOBAL_STYLE`, `GLOBAL_SCRIPT`, header markup) |
| Header compacto en móvil: sin breadcrumb, título 17px, "BOT EN LÍNEA" → solo el punto, proyecto/cerrar-sesión ocultos (`.hide-mobile`; cerrar sesión queda en el pie del cajón). | `layout.ts` |
| **Bandeja = una vista a la vez** en móvil: la lista, o el hilo con barra "← Conversaciones". `.inbox[data-view]` + CSS. Filtros en fila con scroll horizontal; se ocultan al abrir un hilo. Altura `100dvh`. | `conversations.ts`, `layout.ts` |
| Inputs a 16px en móvil (evita el zoom de iOS al enfocar). Tap targets de nav ≥ 44px. `main` con menos padding. `body{overflow-x:clip}`. Utilidad `.xscroll`. | `layout.ts` |

**Fase 2 — Pase por vista ✅ en su mayoría (v1.14.5)**

Al revisar, casi todas las vistas ya traían un pase Tailwind (`grid-cols-1
md:grid-cols-…`) — Resumen, Estadísticas, Costos e Insights ya colapsan a 1
columna en móvil. Lo que faltaba:

- **Leads**: ya tenía `overflow-x:auto` + `min-width` en el grid interno. OK.
- **Contactos**: la `<table width:100%>` se comprimía en vez de scrollear → se
  le puso `min-width:560px` + `.xscroll`. ✅
- **Cualquier `<table>` suelta en `main`**: regla global en móvil
  `display:block;overflow-x:auto`. ✅
- **Modales** (`.modal-card`): en móvil van casi a pantalla completa, pegados
  abajo, con scroll interno (`max-height:92dvh`). ✅
- **Composer del hilo**: `padding-bottom:max(12px,env(safe-area-inset-bottom))`
  para el home indicator de iOS; ya queda pegado abajo por el flex del pane. ✅

Pendiente menor: Configuración / KB editor / Automatizaciones — formularios que
en pantallas medianas quedan angostos (no rotos). Se resuelve en el rediseño § T.

**Fase 3 — Detalles ✅ (v1.14.5)**

- `<meta name="viewport" … viewport-fit=cover>` en el panel y el login. ✅
- `.scanlines::after` baja a `opacity:.18` en móvil (coste de pintado). ✅
- La bandeja usa `100dvh` (no `100vh`) para no quedar bajo la barra del navegador. ✅
- **Pendiente para ti (Joel):** probar en un iPhone (Safari) y un Android
  (Chrome) reales — el emulador no reproduce del todo el teclado ni las
  safe-areas.

### S3 — PWA: botón de instalar visible ✅ (v1.14.1)

**Hecho:** `pwaHeadTags` inyecta un botón flotante "📲 Instalar app":
- Android/desktop Chrome: captura `beforeinstallprompt` y llama `prompt()`.
- iOS Safari (nunca dispara el evento): muestra la instrucción manual
  (Compartir → Añadir a pantalla de inicio).
- Se oculta si ya está instalada (`display-mode: standalone`) o tras `appinstalled`.

Pendiente opcional: mover el botón a un lugar fijo del panel (Resumen /
Configuración) en vez del flotante, si molesta.

---

## T. Rediseño visual del panel — identidad propia (diferenciar de Forja)

> **Pedido (2026-09-02):** que el sistema NO se vea igual a Forja. Aunque la
> licencia MIT lo permite, Joel quiere identidad propia para los videos y el
> marketing — "que no digan que me lo copié". Dirección que dio:
> - **Modo claro + modo oscuro** con toggle (persistido).
> - Acento **morado / fucsia**, colores resaltantes.
> - Look de producto único.

### Lo legal primero (para no rediseñar por miedo)

`LICENSE` = **MIT**, © Horizontes IA (autor de Forja). MIT permite **usar,
modificar, redistribuir y vender** — la única condición es **conservar el aviso
de copyright** (ya está en `LICENSE` y `README.md § Licencia`). No hay
obligación legal de cambiar el diseño ni el nombre. Kooni ya cumple.

**Conclusión:** el rediseño es una decisión de **marca**, no de licencia. No
urge, no bloquea nada. Conviene hacerlo igual, por estas razones:

- Que un cliente no diga "esto es idéntico a [otro producto]".
- Kooni ya tiene identidad propia definida (`docs/IDENTIDAD-KOONI.md`:
  teal/menta sobre tinta, la K de nodo, voz español LATAM) — el panel todavía
  arrastra el look "retro-terminal" de Forja (scanlines, JetBrains Mono en todo,
  botones brutalistas, sombras `Npx Npx 0`).
- Un look propio hace el producto más vendible.

### Estado: ✅ HECHO Y DESPLEGADO (v1.17.0 → v1.18.2)

**v1.17.0 — sistema de temas + paleta.** Claro + oscuro, toggle en el header
(`data-theme` + `localStorage`, anti-FOUC), morado/fucsia como CSS custom
properties, **Sora + IBM Plex Mono**, sombras suaves, scanlines fuera,
`#1a1206` → `var(--on-accent)`, `resolveBrand` solo emite lo que el revendedor setea.

**v1.18.0 — Fase 2, pase por vista.** Colores hardcodeados de las 12 vistas →
tokens (`--ok-soft`, `--warn`, `--warn-soft`, `--bad-soft`, `--danger` nuevos);
`stats.ts` heatmap con `color-mix`; `docs/IDENTIDAD-KOONI.md`. Push del Vigilante.

**v1.18.1 — SW cache `v1`→`v2`** (tirar la caché vieja del rediseño).

**v1.18.2 — bug: `src/admin/pwa.ts` tenía sus propios defaults teal** → el ícono
de la PWA, `<meta theme-color>` y el botón "Instalar" seguían teal. Corregido.
SVG de `assets/` + `web/assets/` recoloreados.

**Cero teal en el panel.** Ambas instalaciones en v1.18.2, visto por Joel.

**Queda solo:** `web/*.html` (landing, sigue teal — pase de landing aparte) y
reescribir `docs/design-system.md` (baja prioridad).

**Fase 2 — plan original (referencia):**
- Pase por vista: buscar inline styles con color hardcodeado (no `var(--x)`).
- Contraste en tema **claro** en las vistas densas: Estadísticas, Costos,
  Insights, el canvas de Flujo (`agente/canvas`), badges de sentimiento.
- Los `rgba(...)` hardcodeados en banners/badges (ej. `rgba(127,183,126,.1)`) →
  tokens o `color-mix`.
- `docs/IDENTIDAD-KOONI.md` + `docs/design-system.md` con la paleta final.
- Landing (`web/`, `sitio-web/`) — alinear.

### Plan de ejecución original (referencia)

Es un pase por **todas** las vistas + el sistema de tokens — hacerlo a medias se
ve peor que no hacerlo. Orden:

1. **Sistema de temas** (`layout.ts` `GLOBAL_STYLE` + un `<script>` chico):
   tokens CSS en `:root` (oscuro) y `:root[data-theme="light"]` (claro).
   Toggle en el header que setea `data-theme` en `<html>` y lo guarda en
   `localStorage`; respeta `prefers-color-scheme` la primera vez. Default oscuro.
2. **Paleta nueva**: acento morado/fucsia (ej. `--accent:#c026d3` fucsia +
   `--accent-2:#a855f7` violeta, ajustar contraste en claro). Reemplaza el
   teal/menta actual. Actualizar también el `tailwind.config` inline y
   `resolveBrand` (defaults).
3. **Fuentes**: cambiar el par (Space Grotesk + JetBrains Mono → algo propio;
   mono solo para datos/código). Es lo que más "despega" del look de Forja.
4. **Botones y superficies**: la sombra dura `Npx Npx 0` (brutalista) → algo más
   limpio (sombra suave / borde). Quitar el overlay `.scanlines` (o dejarlo
   como opción off por defecto).
5. **Componentes**: `.card`, `.chip`, `.node`, filas, modales, toasts — reestilar
   sobre los MISMOS nombres de clase (no renombrar → menos diff).
6. **Marca blanca**: `BRAND_*` (`resolveBrand`) tiene que seguir funcionando —
   probar con overrides.
7. **Login + landing** (`web/`, `sitio-web/`): alinear.
8. **`docs/IDENTIDAD-KOONI.md`**: actualizar con las decisiones finales.

Antes de codear todo: proponer 1 mockup de la paleta + toggle en el Resumen
para que Joel apruebe el rumbo. Esfuerzo: 1-2 días. Riesgo: bajo (visual), alto
de "quedar a medias" si se apura.

---

## U. Registro de auditoría del panel (audit log) — PLAN ⏳

> **Pedido (Joel, 2026-09-03):** "una ventana para ver los logs del sistema:
> quién entró, a qué hora, qué hizo, qué modificó, dato anterior vs dato actual
> — todo para auditar usuarios. No se puede modificar, solo ver el registro
> detallado por cada acción."

### El problema del "quién"

Hoy el panel tiene **un solo usuario**: usuario fijo `admin` + contraseña
compartida `DASHBOARD_PASSWORD` (`src/admin/auth.ts`). La sesión es una cookie
firmada con HMAC(`DASHBOARD_PASSWORD`) — **sin tabla, sin identidad**. Las tablas
`admin_emails` / `magic_links` existen en `src/db/` pero **no están cableadas** al
login.

Para "auditar usuarios" hace falta identidad. Tres niveles posibles:

| Nivel | Qué da | Costo |
|---|---|---|
| **A — huella** | actor = `admin` + hash de IP + user-agent. Distingue "sesión desde IP X", no personas en la misma red. | 0 (la IP ya se lee en el login) |
| **B — nombre de operador** | Campo opcional **"tu nombre"** en el login → cookie firmada. | ~2 h |
| **C — multiusuario real** | `admin_emails` + `magic_links`: cada persona entra con su email + magic link. | ~1–2 días |

**Decisión Joel (2026-09-03): Nivel A** (huella IP + navegador). Sin tocar el
login. El campo `actor_name` queda en el esquema con valor `"admin"` por ahora,
listo para subir a Nivel B/C después sin migración.

### Esquema (`src/db/schema.sql`)

```sql
-- Registro de auditoría del panel: una fila por ACCIÓN de un operador del panel
-- (no las escrituras del bot). Solo se lee desde /admin/auditoria; nada en el
-- panel la modifica. La ÚNICA baja es la purga nocturna por retención.
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,               -- epoch ms
  actor_name TEXT,                   -- nombre del operador (cookie) o NULL
  actor_ip_hash TEXT,                -- SHA-256 de la IP (NUNCA en claro)
  actor_ua TEXT,                     -- user-agent, recortado
  action TEXT NOT NULL,              -- "settings.update" | "kb.doc.delete" | "login.ok" | ...
  target TEXT,                       -- clave/id afectado ("tone", "kb:abc", "rule:xyz")
  target_label TEXT,                 -- etiqueta humana ("Tono del bot")
  before_val TEXT,                   -- valor anterior (texto/JSON, truncado, secretos redactados)
  after_val TEXT,                    -- valor nuevo (idem)
  method TEXT,                       -- POST | DELETE
  path TEXT,                         -- /admin/config
  result TEXT NOT NULL DEFAULT 'ok', -- ok | denied | error
  meta TEXT                          -- JSON extra opcional
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, at);
```

`CREATE TABLE IF NOT EXISTS` → se aplica sola en cada `kooni-bot update`
(`schema.sql --remote`); no rompe instalaciones viejas.

### Captura — dónde se engancha

El ~90 % de las mutaciones del panel pasan por **`SettingsRepo.set(key, value)`**
(config, tono, buffer, modelo, KB min-score, presupuesto, autonomía, licencia,
canales Zernio/Telegram/MercadoLibre, toggles de Extras, persona, BYO-LLM,
fallback de comentarios, reporte nocturno…). Instrumentando **ese único método**
se cubre casi todo con `before`/`after` gratis:

1. **`SettingsRepo.set`**: antes del upsert, `SELECT` del valor actual → tras
   guardar, emitir `{ action:"settings.update", target:key,
   target_label:LABELS[key], before, after }`. Si `before === after`, no registra.
2. **Contexto del actor** — `AsyncLocalStorage` (hay `nodejs_compat`): un
   middleware de `/admin` que envuelve solo los métodos mutantes
   (`POST`/`PUT`/`DELETE`) con
   `auditCtx.run({ name, ipHash, ua, method, path }, next)`. `SettingsRepo.set` y
   el helper `audit()` leen `auditCtx.getStore()`. Cero threading por las ~35
   rutas. *(Fallback si ALS no vuela en Workers: pasar un `ActorContext` explícito
   al construir los repos.)*
3. **Mutaciones que NO pasan por Settings** — una línea `await audit(c, {...})` en
   cada handler (~12 sitios): KB doc `save`/`delete`, `auto_rules`
   crear/editar/toggle/borrar, estado de lead, resolver ticket,
   pausar/reanudar/responder conversación, `mejoras` aplicar/descartar, quitar
   lección, suscripción push.
4. **Login/logout** — `login.ok`, `login.fail`, `logout` (esto es el "quién
   entró": hora + IP + nombre). Complementa `login_attempts` (que ya cuenta
   fallos por IP para el rate-limit) con la línea legible.

Toda escritura de auditoría es **best-effort**: `try/catch`, nunca bloquea la
acción real; `c.executionCtx.waitUntil()` donde se pueda.

### Redacción de secretos (CRÍTICO)

El registro se ve en el panel → **nunca** guarda el valor de un secreto.
`before_val`/`after_val` de claves sensibles (`llm_api_key`, `zernio_api_key`,
`zernio_webhook_secret`, `telegram_bot_token`, `owner_telegram_chat_id`,
`ml_client_secret`, `ml_access_token`, `ml_refresh_token`, `pro_license`) se
guardan como `"[secreto establecido]"` / `"[secreto cambiado · …AB12]"` /
`"[secreto borrado]"`. Set `AUDIT_SENSITIVE_KEYS` junto a `SETTING_KEYS`, y un
test dedicado de que ningún secreto llega a la tabla.

### La ventana (solo lectura)

- Nuevo ítem de nav en **Análisis**:
  `{ id:"auditoria", label:"Auditoría", href:"/admin/auditoria", icon:"history" }`.
- **`GET /admin/auditoria`** — tabla, más reciente arriba:
  **Cuándo · Quién · Acción · Qué cambió · Antes → Después · Resultado**.
  Hora en la zona del dueño. "Quién" = nombre + IP corta (`…a1b2`) + navegador
  resumido. "Antes → Después" en dos columnas con el cambio resaltado (diff
  línea a línea para JSON).
- **Filtros:** rango de fechas, acción, actor, texto. Paginación **keyset por
  `at`** (no OFFSET).
- **Cero rutas de escritura en esta vista.** No hay endpoint para borrar ni
  editar una fila — es intencional y es lo que pidió Joel.
- **`GET /admin/auditoria/export.csv`** — para auditoría externa.

### Retención y tamaño

Filas diminutas. Purga en el **cron nocturno** que ya existe (vecino de
`purgeOldMessages`): borra `audit_log` con `at <` N días.
`audit_retention_days` en `settings`, default **180**. Esa purga es el único
proceso que da de baja filas.

### Qué NO se audita

- Los **GET** (lecturas), salvo login — registrar cada visita es ruido; se puede
  añadir después como opción.
- Las escrituras del **bot** (conversaciones, mensajes, leads de tools) — eso es
  el producto funcionando, no una acción de operador.

### Tier

**Decisión Joel (2026-09-03):** la **captura** corre siempre (Free y Pro — quieres
el historial igual). La **ventana `/admin/auditoria` es solo Pro**: sin licencia
Pro activa, el ítem de nav aparece con candado (`renderUpgrade`), igual que otras
funciones Pro. El `export.csv` también queda tras Pro.

### Fases

| Fase | Entrega | Esfuerzo | Estado |
|---|---|---|---|
| **U1** | Esquema `audit_log` + `AuditRepo` (`src/db/auditLog.ts`) + `src/audit/context.ts` (`AsyncLocalStorage` + `recordAudit()` + `redactValue()` + `AUDIT_SENSITIVE_KEYS`) + middleware de actor en `/admin` (envuelve POST/PUT/PATCH/DELETE) + instrumentar `SettingsRepo.set` (antes→después, salta si no cambió o si no hay operador) + `SETTING_LABELS` + captura `login.ok`/`login.fail`/`login.blocked`/`logout` + purga nocturna (`audit_retention_days`, default 180). Tests: `test/db/auditLog.test.ts`, `test/audit/context.test.ts`. Sin UI. | ~4 h | ✅ **HECHO (2026-09-03)** — pendiente commit+release |
| **U2** | Ventana `/admin/auditoria` **(Pro)**: `src/admin/views/auditoria.ts` (tabla Cuándo·Quién·Acción·Qué cambió·Antes→Después·Resultado, filtros acción/texto/actor, paginación keyset "cargar más antiguas", `export.csv`), rutas GET (sin ninguna de escritura), ítem de nav en Análisis con candado (`PRO_ONLY_TABS` + `TAB_MODULE` + módulo `auditoria` en `PAID_MODULES`). Tests: `test/admin/auditoria.test.ts`. | ~4 h | ✅ **HECHO (2026-09-03)** — pendiente commit+release |
| **U3** | Helper `audit()` en `routes.ts` + `recordAudit()` en las rutas fuera de Settings: KB doc create/update/delete, `auto_rules` create/update/toggle/delete, `lead.status`, `ticket.resolve`, `conversation.reply/pause/resume`, `mejora.apply/dismiss`, `campaign.send`. (Toggles de tools, lecciones, node-save, handoff-template pasan por `SettingsRepo.set` → ya cubiertos por U1. Push subscribe/unsubscribe se omiten a propósito: registro de dispositivo, no dato de negocio.) Tests: +2 en `test/admin/auditoria.test.ts`. | ~3 h | ✅ **HECHO (2026-09-03)** — pendiente commit+release |
| **U4** (opcional) | Nivel B: campo "tu nombre" en el login → cookie firmada → `actor_name`. `audit_retention_days` editable en /admin/config. | ~2 h | ⏳ |
| **U5** (opcional) | Nivel C: multiusuario con `admin_emails` + `magic_links`. | ~1–2 días | ⏳ |

Tests: `test/db/auditLog.test.ts` (repo + redacción), `test/admin/auditoria.test.ts`
(la vista no expone secretos, no hay rutas de escritura, filtros), + asserts en
`test/db/settings.test.ts` de que `set` registra el diff.

Riesgo: **bajo-medio**. Lo delicado: `AsyncLocalStorage` en Workers (si falla →
threading explícito) y no filtrar secretos (allow-list de redacción + test).

---

## V. Chat del CRM — links clicables + previsualización de multimedia

> **Pedido (Joel, 2026-09-02):** en el hilo de `/admin/conversations`, que los
> links de los mensajes sean **clicables / descargables**, y que si el mensaje
> trae **imagen, video o audio** se **previsualice** en la burbuja.

### Estado actual

`renderThreadLive` (`src/admin/views/conversations.ts`) renderiza el contenido
de cada mensaje como `escapeHtml(m.content)` dentro de `white-space:pre-wrap` —
**texto plano**. Nada de links ni media.

Lo que hay de media hoy:
- **Imágenes entrantes** → el agente mete un marcador `[IMAGE_URL: <url enmascarada>]`
  en el texto del mensaje (solo en el camino multimodal Pro + "Oído y vista"). El
  token de Telegram se enmascara antes de guardar (`src/telegramFiles.ts`), así que
  la URL cruda no sirve para `<img>`.
- **Audio entrante** → se transcribe a texto; el audio original no se guarda.
- **WhatsApp Cloud** ya tiene un proxy firmado del media (`/webhooks/whatsapp/media/:id`).

### Fase 1 — Links (fácil, sin esquema)

En `renderThreadLive`, después de escapar, una pasada de "linkify": envolver
`https?://\S+` en `<a href target="_blank" rel="noopener noreferrer">`. Para
"descargable": si la URL termina en una extensión de archivo conocida
(`.pdf .jpg .png .mp4 .mp3 .csv .xlsx …`), agregar `download`. Tests: que un link
en el contenido salga como `<a>` y que el texto normal no se rompa.

### Fase 2 — Previsualización de media (esquema + ingest + proxy)

1. **Persistir el media al entrar.** Tabla `message_media (id, message_id,
   kind [image|video|audio|file], mime, url_proxy, created_at)` o
   `messages.metadata` JSON. Se llena en `agent.ingest` cuando el payload trae
   `imageUrl` / `audioUrl` (todos los canales, no solo el multimodal Pro).
2. **Proxy firmado por canal.** Generalizar el patrón de WhatsApp
   (`/webhooks/whatsapp/media/:id`) a Telegram / Zernio / Meta: una ruta
   `/admin/media/:id` (con auth de panel) que resuelve la URL real (des-enmascara
   el token de Telegram sólo acá) y hace stream del archivo. Nunca exponer el
   token ni la URL cruda al HTML.
3. **Render en la burbuja.** En `renderThreadLive`, si el mensaje tiene media:
   `<img loading="lazy">` / `<video controls preload="metadata">` /
   `<audio controls>` con `src` = el proxy. Miniatura con `max-height` y click →
   abrir grande (reusar `#modal-root`).
4. **Audio entrante:** guardar el audio además de transcribirlo, para poder
   escucharlo en el panel (hoy solo queda el texto).
5. **Salientes con media:** cuando el dueño responde con imagen/audio desde el
   panel (si se agrega esa opción) o el bot manda un recurso de la Galería —
   registrar y mostrar igual.

Esfuerzo: Fase 1 ~1h · Fase 2 ~1 día (el proxy por canal es lo que lleva tiempo).
Riesgo: bajo en Fase 1; medio en Fase 2 (tocar `ingest` + un proxy nuevo).

---

## W. "Probar el bot" — playground en el panel — ✅ HECHO (v1.19.0)

> **Pedido (Joel, 2026-09-02):** "una ventana de pruebas, donde luego de
> configurar el bot y sus datos, el usuario pueda probar el bot como si fuera un
> usuario, preguntarle y ver cómo responde para poder ajustar algo."

**Cómo quedó:**
- **`/admin/probar`** (nav → Mi Agente → "Probar el bot") — un chat. El dueño
  escribe como cliente y ve la respuesta **real** del bot: mismo system prompt
  (`resolveAgentConfig`), mismo modelo, misma KB. Muestra qué tools usó y el modelo.
- **Sin efectos:** no guarda conversación ni mensajes, no manda por ningún canal.
  Solo se le pasan las tools de **lectura** (`searchKb`, `catalogQuery`,
  `reportQuery`); las de acción (`captureLead`, `handoffHuman`, `scheduleAppointment`…)
  NO están, y un bloque `<modo_prueba>` en el prompt le dice al bot que responda
  "lo que haría" en vez de ejecutar. Así no se llenan leads/tickets de mentira.
- Archivos: `src/admin/playground.ts` (`runTestTurn`), `src/admin/views/probar.ts`,
  rutas `GET /admin/probar` + `POST /admin/probar/send`, nav en `layout.ts`.
  Tests: `test/admin/probar.test.ts`.

**Posibles mejoras (no pedidas):** botón "usar este chat como base de una lección"
(alimentar el flywheel), o permitir elegir el modelo para comparar respuestas.

---

## X. Multiusuario (agentes humanos) + panel central de cuenta — PLAN FUTURO ⏳

> **Pedido (Joel, 2026-09-04):** activar agentes humanos de atención (multiusuario)
> dentro del bot, gateado como un Extra más; y evaluar un panel central estilo
> **Forja** (cuenta con correo, gratis/pago, marketplace, docs, "mis instalaciones")
> donde el usuario se registra, instala y luego inicia sesión con ese correo.
> **No implementar todavía** — hoy solo hay 2 instalaciones reales (Joel + Cardealer
> Dani), no hay volumen que lo justifique. Queda como diseño para cuando haga falta.

### A. Agentes humanos dentro de un bot (bajo riesgo, reusa código ya existente)

- Ya existe el esqueleto **dormido**: `admin_emails` (`role: owner|staff`) y
  `magic_links` en `src/db/schema.sql` / `src/db/adminEmails.ts` /
  `src/db/magicLinks.ts` — creados en algún momento, **sin conectar** a
  `src/admin/auth.ts` (que hoy es un solo usuario `admin` + `DASHBOARD_PASSWORD`).
- Diseño: reactivar esas tablas, sesión por cookie firmada con secreto **por
  usuario** (no el `DASHBOARD_PASSWORD` global, para poder revocar un agente sin
  matar la sesión del dueño). Panel recortado para agentes (Conversaciones/Tickets,
  sin Config/Licencia/Costos). `tickets` (`src/db/tickets.ts`) necesitaría
  `assigned_to` y notificar al agente asignado en vez de siempre a `OWNER_EMAIL`.
- Se activa como Extra nuevo (`src/features.ts` + `src/modules.ts`, mismo patrón
  que `cazador`/`oido_vista`): módulo `equipo` con límite de asientos por tier
  (Free = solo dueño, Pro = N agentes).

### B. Panel central de cuenta estilo Forja (cambio de producto, no una feature)

- **Ya evaluado a fondo en `§ F`** (arriba) — comparación Forja vs Kooni, y la
  decisión tomada el 2026-09-02 fue **NO construir login/cuentas central** salvo
  que lo pidan revendedores (roadmap `§ F`, punto 6). Este ítem no reabre esa
  decisión, solo la actualiza con la parte de multiusuario/marketplace/docs que
  no estaba cubierta ahí.
- `admin-pagos/` (InsForge, privado) ya tiene la forma de un backend central:
  `clientes`, `licencias`, `instalaciones`, `uso_instalaciones` + edge functions
  `auth-login`, `registrar-instalacion`, `registrar-uso`, `healthcheck`. Hoy es
  solo tuyo (panel de licencias); volverlo un panel público con signup
  gratis/pago, marketplace y docs es extender eso, no empezar de cero.
- **Riesgo a decidir cuando se retome:** si el login de cada `/admin` pasara a
  depender de la cuenta central, un bot que vive 100% en la Cloudflare del dueño
  quedaría sin acceso si el servicio central se cae — contradice "vive en tu
  cuenta, sin dependencias obligatorias". Recomendado: cuenta central = identidad
  + marketplace + visibilidad de instalaciones (como ya hace `admin-pagos` con
  licencias); login a cada bot sigue siendo local (§ A) con SSO opcional vía
  token firmado (mismo mecanismo Ed25519 que ya usa `license.ts`), nunca como
  único camino de entrada.

### Disparador para retomar

- **A**: cuando un cliente pida explícitamente tener empleados atendiendo desde
  el mismo panel (hoy nadie lo pidió).
- **B**: cuando haya varias instalaciones/revendedores simultáneos y administrar
  licencias a mano (hoja de cálculo, `gen-license.ts`) deje de alcanzar — no antes.

---

## Orden recomendado de ejecución

1. **Fase 1-2 OpenReply** — matcher avanzado + `{username}` + links trackeados (mayor valor). | ✅ HECHO (v d59c390c)
2. **B2 + B3** — panel de conexiones con tokens (pegar tokens desde `/admin`).
3. **C2 + C3 + C4** — sistema de licencia Pro.
4. **F2** — prueba del handoff con el dueño.
5. **Fases 3-7 OpenReply** — follow gate, dedup, rate limit, logs, plantillas. | 🎉 PLAN COMPLETO (v86b83401): follow gate ✅ + dedup ✅ + rate limit ✅ + logs ✅ + plantillas ✅
6. **E7** — generar la landing con los prompts de `sitio-web/`.
7. **PWA Fase 1** (`§ Q`) — avisos push. ✅ v1.16.0.
8. **Móvil + filtros** (`§ S`) — ✅ v1.14.3–v1.14.5.
9. **Scraping web → KB** (`§ L`) — ✅ código v1.15.0; falta activar URLs en cardealer.
10. **Rediseño visual** (`§ T`) — aprobado, siguiente bloque. Proponer paleta primero.
11. **Campañas** (`§ R`) — ⏸️ **PAUSADO TOTALMENTE** por Joel. Archivado; no se retoma salvo pedido explícito.
