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

**Verificación:** `pnpm test`. Tests en `test/admin/pwa.test.ts`.

**v1.14.1 — botón "Instalar app":** Joel reportó que "en móvil no se ve la PWA
para instalar". Android Chrome esconde la opción en el menú ⋮ e iOS Safari no
tiene prompt. Se agregó un botón flotante "📲 Instalar app" en `pwaHeadTags`:
Android/desktop usa `beforeinstallprompt`; iOS muestra la instrucción manual;
se oculta si ya está instalada.

**Pendiente (documentado en `PLAN.md` § Q y § S):** Fase 1 = avisos push con
VAPID (la más valiosa), Fase 2 = lectura offline, Fase 3 = bandeja móvil;
§ S = filtros de conversaciones (canal/fecha) + responsive.

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

### Mejora 4 (bug) — v1.14.1 — El reindex por HTTP ignoraba los documentos del panel

**Qué se observó:** al mover los 4 KB de Kooni de `member/kb/` (repo) a la tabla
`kb_docs` (editables desde `/admin/kb`), el reindex vía `POST /kb/reindex`
devolvió `indexed: 0`. Causa: ese endpoint llamaba `reindexKb(env)` —solo los
fragmentos de `kb-fixtures.json`—, no `reindexAll` (repo + `kb_docs`). Efecto
colateral: después de cada `kooni-bot update`, los documentos que el dueño
escribió en el panel quedaban sin re-embeber.

**Qué se cambió:** `src/index.ts` — `POST /kb/reindex` ahora llama `reindexAll`.
Test nuevo en `test/index.test.ts` (token válido → embebe también `kb_docs`).

### Dónde se ven y editan los KB del negocio

- **`/admin` → Conocimiento (`/admin/kb`)** — los documentos que el dueño
  escribe y edita. Viven en D1 (`kb_docs`), se reindexan al guardar, sobreviven
  los updates. **Aquí quedaron los 4 de Kooni** (qué es, planes y precios,
  canales y costos, FAQ) tras migrarlos de `member/kb/`.
- `member/kb/*.md` (archivos del repo) — fragmentos precargados; en el panel solo
  se ven como el contador "N fragmentos precargados del repo", no editables ahí.
  La instalación de Joel ya no usa esta vía (carpeta vacía).

### Mejora 5 — v1.14.3 — Responsive móvil: navegación, bandeja, tamaños (Fase 1)

**Qué se observó (Joel, en el celular):** el panel no se usa bien en móvil — la
navegación era una tira de iconos con scroll horizontal, el header se
amontonaba, y en Conversaciones la lista y el hilo competían por un espacio
minúsculo.

**Qué se cambió** (`layout.ts`, `conversations.ts`):

- **Navegación → cajón deslizable.** Botón hamburguesa en el header; la barra
  entra desde la izquierda con un backdrop; cierra al tocar un link, el fondo o
  Escape. Se conservan las secciones, el acordeón y el pie (antes se perdían).
- **Header compacto en móvil:** sin breadcrumb, título más chico, "BOT EN LÍNEA"
  solo el punto, el selector de proyecto y "Cerrar sesión" se ocultan.
- **Bandeja de conversaciones = una vista a la vez:** en móvil se ve la lista, o
  el hilo con una barra "← Conversaciones". Los filtros van en fila con scroll
  horizontal y se ocultan al abrir un hilo. Altura `100dvh`.
- **Tamaños:** inputs a 16px en móvil (sin el zoom de iOS), tap targets de nav
  ≥ 44px, menos padding, `body{overflow-x:clip}`, utilidad `.xscroll`.

Fases 2 y 3 (pase por vista: tablas → tarjetas, gráficas, formularios, modales;
detalles de iOS/perf) en `PLAN.md § S2`.

**Verificación:** `pnpm test` (suite completa flakea por un problema conocido de
miniflare + vitest 4 —`TypeError: fetch failed` al crear instancias en
paralelo—; los archivos afectados pasan al correrse aislados y
`test/admin/` pasa 146/146). Tests nuevos en `test/admin/layout-scripts.test.ts`
(cajón de nav) y `test/admin/pwa.test.ts`.

### Mejora 6 — v1.14.4 — El bot decía "no tengo esa información" pese a tener los KB de Kooni

**Qué se observó (Joel):** cargados los 4 documentos de Kooni y con la búsqueda
vectorial OK (`vectorCount: 8`, dim 1024), el bot igual respondía *"no tengo esa
información"* al preguntarle por Kooni o sus precios.

**Causa — no era la KB, era el prompt.** El `business_context` de Joel es muy
estricto: sección 2 *"Servicios que ofreces (solo estos, no inventes otros)"*
(y Kooni no estaba en la lista) + sección 3 *"NUNCA inventar precios que no
estén en esta lista"*. Ante esas reglas absolutas, el modelo (además en `haiku`)
NO usa lo que devuelve `searchKb` para un tema "fuera de la lista" — lo trata
como inventar. El `business_context` gana sobre la KB.

**Arreglo (instalación de Joel):** se llenó `custom_instructions` (panel →
Configuración → reglas del negocio; setting D1, se aplica sin redeploy):
declara que **también ofrecemos montar chatbots (Kooni)**, que los datos de
Kooni de la base de conocimiento **son oficiales** (no inventados), y que el
montaje se cotiza con Joel. El resto del prompt sigue igual (no cierra ventas).

**Herramienta nueva (todas las instalaciones): "Probar búsqueda" en `/admin/kb`.**
Corre la MISMA consulta que la tool `searchKb` del bot y muestra el top-5 con
score + un veredicto ("el bot usaría esto" si el mejor score ≥ 0.70, o el aviso
de que lo tomaría como "sin información"). Así el dueño ve exactamente qué
encuentra el bot antes de que un cliente escriba.

| Cambio | Archivo |
|---|---|
| `queryKb()` compartido (una sola implementación para la tool y el panel) | `src/kb/query.ts` |
| `searchKb` tool usa `queryKb` | `src/tools/searchKb.ts` |
| Ruta `GET /admin/kb/search` + fragmento de resultados | `src/admin/routes.ts`, `src/admin/views/kb.ts` |
| Caja "Probar búsqueda" en la pestaña Conocimiento | `src/admin/views/kb.ts` |
| Tests | `test/admin/kb-routes.test.ts` |

### Despliegue del cambio de móvil (v1.14.3)

- La red de la máquina estuvo intermitente (`fetch failed` en `wrangler deploy`,
  `git` a GitHub con "connection reset"). El deploy entró al **7º reintento** de
  un bucle. **Instalación de Joel en v1.14.3** (Version ID `149fdcdd`), el cajón
  de navegación y la bandeja móvil verificados en vivo en `/admin/login`.
- Tareas que faltan para el móvil: ver `PLAN.md § S2` Fase 2 (pase por vista) y
  Fase 3 (detalles iOS/perf). No bloquean nada.

### Mejora 7 — v1.14.5 — Filtros de conversaciones + responsive Fase 2-3

**Filtros (`§ S1`)** — `src/admin/views/conversations.ts`, `routes.ts`:
- Filtro por **canal** (`<select>` con los canales presentes) y por **fecha**
  (chips 24h / 7d / 30d).
- La **búsqueda** ahora matchea también el texto de los mensajes, no solo el nombre.
- Se combinan y persisten en la URL (`f`, `q`, `ch`, `d`); chip "✕ limpiar".

**Responsive Fase 2-3 (`§ S2`)** — `layout.ts`, `contactos.ts`, `conversations.ts`:
- Contactos: tabla con `min-width` + scroll (antes se comprimía).
- Regla global: cualquier `<table>` que no quepa en móvil → scroll horizontal.
- Modales casi a pantalla completa en móvil (pegados abajo, scroll interno).
- Composer del hilo respeta la safe-area de iOS.
- `viewport-fit=cover`, scanlines a `opacity:.18` en móvil, bandeja en `100dvh`.

**De paso — flakiness de la suite:** `maxWorkers: 2` en `vitest.config.ts`. Sin
tope, decenas de Miniflare arrancaban en paralelo y el proxy tronaba con
`TypeError: fetch failed` (rojos falsos distintos en cada corrida). Ahora
**691/691 estable y más rápido** (145s vs 300s).

## 2026-09-02 · v1.16.0 — Avisos push en la PWA (Fase 1)

Joel pidió los avisos push. Implementado:

| Archivo | Qué |
|---|---|
| `src/push.ts` | JWT VAPID (ES256, WebCrypto) + `notifyOwnerPush()`. Push **sin cuerpo** — el SW pide `/admin/push/latest` al recibirlo. Evita la cifra RFC 8291. |
| `src/db/push.ts` + `schema.sql` | `push_subscriptions` (dispositivos del dueño) + `push_events` (cola, purga a 7 días). |
| `src/admin/routes.ts` | `/push/config`, `/push/subscribe`, `/push/unsubscribe`, `/push/latest`, `/push/test`. |
| `src/admin/pwa.ts` + `layout.ts` | Botón campana en el header. Aparece solo si el worker tiene VAPID. Suscribe este dispositivo + manda aviso de prueba. SW actualizado. |
| `src/tools/handoffHuman.ts`, `captureLead.ts` | Disparan push: ticket/handoff y nuevo prospecto. |

**Llaves VAPID (las dio Joel):** `VAPID_PUBLIC_KEY` + `VAPID_SUBJECT` van como
vars en `wrangler.toml`; `VAPID_PRIVATE_KEY` como secret. Mismo par sirve para
las dos instalaciones. Joel puede rotarlas cuando quiera (regenera y re-pone).

Tests: `test/push.test.ts` (verifica la firma ES256), `test/admin/pwa.test.ts`. 710/710.

## 2026-09-02 · v1.15.0 — Módulo "Sincronizar sitio web" (Decodo) para cardealer

**Pedido:** el cliente cardealer-daniel2 ("Daniel autos") quiere que el bot
conteste con el inventario de su sitio, actualizado solo.

**Implementado** (inerte en todas las instalaciones — se enciende solo en la de
Daniel con módulo + secret):

| Archivo | Qué |
|---|---|
| `src/integrations/decodo.ts` | Cliente de Decodo Scraper API (`/v2/scrape`, `markdown:true`, `headless:html`). `DECODO_AUTH` acepta `user:pass` o el base64. Fail-soft. |
| `src/kb/webSync.ts` | Orquesta: URLs de la config → scrape → hash → si cambió, `kb_doc` `web:<slug>` + `indexDoc`. Limpia docs de URLs que se quitaron. 2 candados: módulo `web_sync` + `DECODO_AUTH`, ambos fallan cerrados. |
| `src/modules.ts` | Módulo `web_sync` en el catálogo. |
| `src/features.ts` | Card "🌐 Sincronizar sitio web" en Extras, con campo para las URLs. |
| `src/index.ts` | Corre en el tick nocturno (3am). |
| `src/admin/routes.ts` + `views/kb.ts` | Botón "Sincronizar sitio ahora" en `/admin/kb` (visible solo si el módulo está desbloqueado). |

**Clave:** el endpoint `/llm/inventory/` del sitio ya devuelve texto para IA;
con Decodo `markdown:true` llega limpio → **cero parseo de HTML**. Mucho más
simple que el plan de `§ L`.

**Pendiente (Joel):** actualizar cardealer a v1.15.0, poner el secret
`DECODO_AUTH`, activar el módulo en su D1 y cargar las URLs. Pasos en `PLAN.md § L`.

**Nota de seguridad:** la credencial de Decodo la pegó Joel en el chat. NO se
commiteó ni quedó en código — va solo como `wrangler secret` en el worker de
cardealer. Conviene que Joel la rote en el panel de Decodo por las dudas.

## 2026-09-02 · v1.17.0 — Rediseño visual (§ T) — base

Joel aprobó el rumbo: **identidad propia**, distinta de Forja, para los videos y
el marketing. Dirección: **claro + oscuro con toggle**, acento **morado/fucsia**.

**Base implementada** (`src/admin/views/layout.ts`):

| Antes (Forja) | Ahora (Kooni) |
|---|---|
| Todo en JetBrains Mono | **Sora** (texto) + **IBM Plex Mono** (solo datos/código) |
| Space Grotesk para títulos | Sora |
| Teal/menta sobre tinta azulada | **Fucsia `#e05fd8` + violeta `#a679f6`** sobre tinta con matiz violeta |
| Solo tema oscuro | **Claro + oscuro**, toggle en el header, `data-theme` en `<html>` + `localStorage`, respeta `prefers-color-scheme`, sin parpadeo (script en el `<head>`) |
| Sombras duras `Npx Npx 0` (brutalismo) | Sombra suave `var(--shadow)`, bordes redondeados |
| Overlay de scanlines | Retirado (clase inerte por compat) |

- Los colores viven en CSS custom properties (`:root` oscuro + `:root[data-theme="light"]`);
  Tailwind los mapea con `var()`. Las vistas que usan `var(--x)` cambian solas.
- `#1a1206` (texto sobre botón teal) → `var(--on-accent)` en todas las vistas.
- Marca blanca: `resolveBrand` ahora solo emite overrides de las vars `BRAND_*`
  que el revendedor puso; sin ellas, identidad Kooni pura.

**Verificación:** `pnpm test` 711/711. Tests en `test/admin/layout-scripts.test.ts`.

**Pendiente (Fase 2 del rediseño):** pase fino por vista (algún inline style con
color hardcodeado, contraste en tema claro en vistas densas —Estadísticas,
Costos, canvas de Flujo—), y actualizar `docs/IDENTIDAD-KOONI.md` +
`docs/design-system.md` con la paleta final. **Joel revisa la base primero** y
dice si el rumbo va — la paleta son 6 líneas de tokens, fácil de ajustar.

---

## Estado al cierre — 2026-09-02

### Versiones

- **`origin/main`**: v1.16.0.
- **`kooni-bot-joel-nocode-ec53aa`** (Joel Araujo / Nocodeveloper): **v1.16.0**, desplegado y verificado.
- **`kooni-bot-cardealer-daniel2-948b8b`** (Daniel autos, cuenta `Info@dmezzadri.com`): **v1.16.0**, desplegado.
- **CLI / npm**: sin cambios en `cli-kooni/` en toda la sesión → no hubo publicación.

### Qué se entregó (v1.14.0 → v1.16.0)

| Área | Estado |
|---|---|
| Niche `agencia-ia` (flujo de venta conversacional) + KB de Kooni | ✅ · aprobado por Joel |
| Fix "el bot dice que no tiene la info" (`custom_instructions` en Joel) | ✅ · aprobado |
| CRM registra respuestas hechas desde la app nativa (`ownerEcho`) | ✅ |
| PWA instalable + botón "Instalar" + offline básico (Fase 0) | ✅ |
| **PWA avisos push (Fase 1)** — botón campana, dispara con prospecto/ticket | ✅ código · **cada quien activa en su celular** |
| "Probar búsqueda" en `/admin/kb` (ve lo que ve el bot + score) | ✅ |
| Filtros de conversaciones: canal, fecha, texto de mensajes | ✅ |
| Responsive móvil: navegación en cajón, bandeja de una vista, tablas, modales, iOS | ✅ Fases 1-3 |
| **Módulo "Sincronizar sitio web" (Decodo → KB)** | ✅ código · **activar en cardealer** (secret + `module_unlocks` + URLs) |
| **Rediseño visual — base** (claro/oscuro, Sora, morado/fucsia) v1.17.0 | ✅ base · **Joel revisa el rumbo** · falta Fase 2 (pase por vista) |
| Fix `/kb/reindex` (ignoraba los docs del panel) | ✅ |
| `vitest maxWorkers: 2` (arregla el flakeo de la suite) | ✅ · 711/711 estable |

### Config aplicada en las instalaciones

- **Joel:** `BOT_NICHE = "agencia-ia"`, `custom_instructions` (KB de Kooni oficial),
  KB migrados a `kb_docs`, modelo **gpt-4o-mini** (elección de Joel), VAPID vars
  en `wrangler.toml` + secret `VAPID_PRIVATE_KEY`.
- **cardealer:** VAPID vars + secret. `DECODO_AUTH` puesto. **Pendiente de
  verificar:** que `module_unlocks` incluya `web_sync` (Joel se topó con el
  escape de comillas de PowerShell — se le dio la versión con `.sql` file). Si
  la licencia de Daniel es legada (todos los módulos), ya está activo.

### Pendientes

**Joel:**
1. Verificar que en cardealer el botón "Sincronizar sitio ahora" aparezca en
   `/admin/kb`. Si no → correr el `.sql` de activación (ver mensaje / `PLAN.md § L`).
2. Cargar en el panel de Daniel las URLs del inventario (Extras → Sincronizar
   sitio web) + primera sincronización.
3. Pedirle a Daniel las 5 preguntas que el bot debe poder contestar.
4. Activar el push en cada celular (instalar PWA → 🔔 → permitir).
5. Rotar la credencial de Decodo y el par VAPID (ambos se pegaron en el chat).
6. **Revisar la base del rediseño (v1.17.0)** — actualizar una instalación, abrir
   el panel, probar el toggle claro/oscuro, y decir si el rumbo (Sora +
   morado/fucsia) va. La paleta se ajusta en 6 líneas.
7. Dejar "Modelo" en **Automático** en el panel de Joel (el override haiku/sonnet
   no aplica con OpenAI).

**Claude:**
- Rediseño `§ T` **Fase 2** — pase fino por vista + `docs/IDENTIDAD-KOONI.md` (cuando Joel dé el OK al rumbo).
- Sumar el Vigilante a los disparadores de push.
- Campañas `§ R` — **PAUSADO TOTALMENTE** (no se retoma salvo pedido explícito de Joel).
- Web Sync Fase 2 (crawl / paginación) si el volumen lo pide — hoy: lista fija de URLs.
