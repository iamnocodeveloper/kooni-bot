# Changelog

Cambios notables de Kooni. Formato aproximado de
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones = `package.json`.

El CLI `kooni-bot` se versiona aparte (npm) — ver la nota de cada versión.

## [1.37.0] — 2026-09-10

### Agregado — Cobros por voz: configuración de Vapi y Retell

- Nueva sección **Conexiones → “Cobros por voz: Vapi / Retell”** con todos los
  campos para conectar cada plataforma: API key, Assistant/Agent ID, Phone
  Number ID / número saliente, webhook secret, API base URL, proveedor activo,
  objetivo/tono del guion de cobranza y intentos máximos por deudor.
- Webhooks listos para pegar en cada dashboard: `POST /webhooks/vapi` (header
  `X-Vapi-Secret`) y `POST /webhooks/retell` (`x-retell-signature`); por ahora
  ack + log (el flujo de llamadas se cablea en la próxima etapa).
- `src/integrations/voiceProviders.ts`: resolución de credenciales (settings D1
  gana; env fallback), claves nuevas en `SETTING_KEYS`/`SETTING_LABELS` y
  redacción de los secretos en el registro de auditoría.

### Notas de la etapa (cardealer)
- Cierre documentado en `PLAN.md` → § CIERRE DE ETAPA — cardealer-daniel.
- Webhooks de WhatsApp/IG/WAHA y el flujo de inventario tal como quedaron.

## [1.36.0] — 2026-09-10

### Agregado

- **`rebuildInventoryKb` + `POST /kb/rebuild`** (mismo token): reconstruye los
  docs de KB del inventario a partir del **store ya poblado** (con precios,
  millas y condición enriquecidos), **sin scrapear el feed**. Sirve cuando el
  sitemap está bloqueado/caído (hoy Cloudflare lo devuelve 403) y deja la KB
  completa y actualizada igual. Idempotente: re-embebe cada parte y borra las
  sobrantes.

## [1.35.1] — 2026-09-10

### Arreglado (crítico)

- **Un fallo de scrape ya no vacía el store del inventario.** La rama que
  limpiaba el store cuando la corrida "no veía inventario" también se disparaba
  ante un error transitorio de Decodo (scrape vacío) — borró los 449 autos.
  Ahora solo se quitan los autos cuyo `feedUrl` ya no está configurado, y nunca
  se toca el store si hubo errores en la corrida.

## [1.35.0] — 2026-09-10

### Agregado

- **KB del inventario con datos reales completos**: al renderizar los docs del
  listado se superponen precio/millas/condición ya enriquecidos del store (el
  sitemap solo trae título/condición/VIN) — el listado queda completo y real.
- **Links clickeables**: `toPlainLinks()` convierte `[texto](url)` a
  `texto (url)` y `<url>` a `url`; aplicado en `stripMarkdown` (todo lo que se
  envía) y al guardar la respuesta del agente (CRM consistente). WhatsApp e
  Instagram no renderizan Markdown: antes llegaba el link literal sin ser
  clickeable.

## [1.34.1] — 2026-09-10

### Arreglado

- El refetch forzado por `key` ya no borra precio/millas/desglose si el scrape
  falla (Turnstile intermitente): solo sobrescribe si Decodo respondió con
  contenido.

## [1.34.0] — 2026-09-10

### Agregado — desglose de precio de la ficha (Price/Discount/Fees/Transparent)

- `extractPricingFromText` + `stripTags`: saca el desglose del widget de precio
  de la ficha (Price, Dealer Discount, Dealer Fee, Admin Processing Fee, Tag
  Agency Fee, WPB Kia Transparent Price) y lo guarda en `StoredVehicle.pricing`.
- El **precio principal** del auto pasa a ser el *Transparent Price* cuando
  existe (es el que expone el JSON-LD `offers.price`).
- `fichaAuto` devuelve `desglosePrecio` y la instrucción pide mostrarlo.
- `mergeVehicleStore` preserva el desglose entre syncs livianos.
- Se quitó el endpoint temporal de diagnóstico.

## [1.33.1] — 2026-09-10

### Arreglado

- Refetch forzado por `key` (`/kb/enrich?key=…`) sobrescribe precio/millas
  aunque el scrape devuelva null, para reparar datos ya guardados.

## [1.33.0] — 2026-09-10

### Arreglado — precio correcto (JSON-LD autoritativo, no texto libre)

- `fetchVehicleDetails` ahora scrapea la **ficha en HTML primero** y toma precio/
  millas del **JSON-LD**. El texto libre del markdown puede traer precios de
  autos "similares" u otros montos (se vio un "$52,110" en un Dodge Durango
  2005). El markdown queda solo como respaldo para la **foto**.
- `POST /kb/enrich?key=vin:…` permite forzar el refetch de autos puntuales
  (para reparar datos ya guardados).

## [1.32.0] — 2026-09-10

### Agregado — detalle completo de cada auto (precio/millas/foto) + link

- **`fetchVehicleDetails`**: al scrapear la ficha de un auto ahora extrae
  **precio, millas y foto**. Precio/millas salen del **JSON-LD** de la ficha
  (`extractDetailsFromHtml`); fallback a texto etiquetado ("Sale Price $…",
  "45,210 miles") y a `og:image`/`<img>`.
- `refreshVehicleImages` y `ensureVehicleDetails` guardan precio/millas además
  de la foto, y `imageCandidates` vuelve a considerar autos **sin precio**
  (el sitemap de origen no lo trae).
- **`fichaAuto`** entrega la ficha completa (VIN, condición, precio, millas,
  link y foto) y ahora se usa SIEMPRE que el cliente pide un auto puntual
  (por nombre/modelo/año/VIN). `inventarioQuery` devuelve también `url` por
  auto y su nota pide incluir el link.
- Prompt: bloque `<inventario>` endurecido — auto puntual → `fichaAuto`;
  siempre incluir el link; nunca inventar precio.
- **`POST /kb/enrich`** (mismo token que `/kb/reindex`): precarga detalles en
  lote sin re-scrapear el sitemap, para llenar el store rápido.

## [1.31.0] — 2026-09-10

### Arreglado — Web Sync del bot de autos (feed muerto → sitemap)

- **El feed `/llm/inventory/` de DealerInspire dejó de existir**: hoy sirve la
  homepage a cualquier user-agent (verificado con GPTBot/ClaudeBot/PerplexityBot/
  Googlebot/Chrome, vía Decodo y vía reader). Por eso el "modo inventario" caía a
  modo texto, `web_sync_vehicles` nunca se creaba y el bot improvisaba (recitaba
  marcas de la home o decía "no tengo acceso").
- **Nueva fuente: el sitemap de inventario de DealerInspire**
  (`/dealer-inspire-inventory/inventory_sitemap`). `parseDealerInventorySitemap`
  parsea cada URL `/inventory/<cond>-<año>-<marca>-<modelo>-<trim>-<VIN>/` y arma
  el vehículo completo (condición, año, marca, modelo, VIN y **el link real de la
  ficha**). `parseInventoryFromAny` elige sitemap o feed según el contenido.
- **`mergeVehicleStore` preserva lo enriquecido**: un sync liviano (sitemap, sin
  precio/millas/foto) ya no pisa el precio/millas/foto que se hayan completado
  scrapeando la ficha.
- **Prompt del agente**: cuando la instalación tiene inventario sincronizado se
  inyecta un bloque `<inventario>` que obliga a usar `inventarioQuery` (y
  `fichaAuto` para la ficha de un auto puntual) — nunca conocimiento general ni
  la KB. Si está configurada pero el store está vacío, un `<inventario_vacio>`
  prohíbe recitar marcas/autos.

## [1.30.0] — 2026-09-10

### Agregado — Web Sync "modo inventario" (bot de autos)

- **Inventario estructurado**: si la página scrapeada parsea como listado de
  vehículos, Web Sync guarda un store en D1 (`settings.web_sync_vehicles`: VIN,
  título, precio, millas, condición, URL de ficha) en vez de un blob de texto.
  Los docs de KB siguen **sin links** (regla v1.25) + un doc `-resumen` con las
  marcas reales y reglas anti-alucinación.
- **Tool `inventarioQuery`**: disponibilidad exacta (marca/modelo/condición/
  precio/VIN). Si una marca no está, devuelve 0 matches y las marcas disponibles
  — el bot no contesta de memoria.
- **Tool `fichaAuto`**: entrega la **ficha real de UN auto** — link de la página
  y **foto** (`og:image`) — solo cuando el cliente pide ese auto o da su VIN. La
  URL sale del store parseado, nunca la inventa el modelo.
- **Fotos**: el feed no trae imágenes; se scrapean de la ficha con Decodo
  (batch nocturno acotado con `refreshVehicleImages` + bajo demanda cacheada).
- `scrapeUrl` acepta `markdown:false` para leer `og:image` cuando el Markdown no
  trae imágenes; el disparo manual y el tick nocturno corren el batch de fotos en
  background (`executionCtx.waitUntil`).
- El pipeline cae al **modo texto legacy** si el contenido no parece inventario,
  así que las demás instalaciones con Web Sync no cambian de comportamiento.

## [1.29.0] — 2026-09-07

### Agregado

- **Kanban de leads** (`/admin/leads`). Vista kanban por defecto (5 columnas,
  drag & drop), vista tabla en `?vista=tabla`. Disponible en todos los planes.
- **Estado `entrada`** ("comunicación de entrada"): toda conversación real deja
  una ficha; si el bot no le sacó una intención queda ahí para clasificar.
- **Tool `moverLead`**: el bot mueve la ficha de la conversación entre etapas y
  deja una nota. El bot lee la etapa actual (`<ficha_panel>`) para dar
  continuidad la próxima vez que ese cliente escriba.

## [1.28.0] — 2026-09-07

### Agregado — nicho `restaurante` (pack "pedidos")

- **Motor de pedidos**: tablas `products` / `orders` / `order_items` /
  `order_events` (idempotentes, solo con `BOT_NICHE=restaurante`).
- **Tool `tomarPedido`**: el bot toma el pedido conversando y lo registra;
  reconcilia precios con el menú y avisa al restaurante.
- **Avisos de estado** al cliente por su canal (recibido → confirmado →
  preparación → en camino → entregado / cancelado) con link de seguimiento.
- **Panel**: `/admin/pedidos` (cola + cambio de estado), `/admin/menu` (CRUD de
  productos, "marcar agotado"), `/admin/reportes` (6 reportes en 1 pantalla,
  cada uno con acción sugerida, filtro por fechas, export CSV).
- **PWA de mostrador**: `/admin/pedidos/feed` + alerta sonora al entrar un
  pedido (Web Audio, sin depender del SO), `?tv=1` modo mostrador, manifest del
  restaurante que abre en Pedidos.
- `NichePack.hooks` (`extraTools` / `navExtra` / `orderEngine`) para packs
  "pesados".

## [1.27.0] — 2026-09-07

### Cambiado

- **Modelo de planes**: todas las funciones disponibles en el plan gratis. Free
  vs Pro se diferencian **solo por límites de cantidad** (`src/limits.ts`). Se
  eliminó el paywall por feature (`PRO_ONLY_TOOLS`/`PRO_ONLY_TABS` vacíos,
  `unlockedModules()` devuelve todo).
- Se hace cumplir el tope de **mensajes/mes** y de **canales** (antes solo se
  mostraban).
- Precios: fundador $39 · Pro $12/mes · Kit de agencia $149 (packs por rubro,
  fuera del repo).

### Eliminado

- `cli/` (CLI legacy de Forja) y `.github/workflows/publish-cli.yml`.

## [1.26.0] — 2026-09-07

### Agregado

- Chat del panel: links clicables, previsualización de imágenes/audio entrantes
  (proxy autenticado para Telegram/WAHA), botones del bot visibles en el hilo.

## [1.25.0] — 2026-09-04

### Corregido

- Búsqueda de KB: `queryKb` pedía metadata que Vectorize no devuelve → el bot
  decía "no tengo esa información" con la KB llena.

### Agregado

- Canal **WAHA** (WhatsApp HTTP API self-hosted) por instalación.

## [1.20.0–1.24.0] — 2026-09-03

- **Registro de auditoría** del panel (`/admin/auditoria`): quién, cuándo, qué
  cambió, antes → después. Purga a 180 días.
- Canal **MercadoLibre** (preguntas + mensajería post-venta).
- Umbral de score de la KB configurable desde el panel.
- Periodo de gracia de 7 días para licencias mensuales vencidas.
- Niche packs por giro: `restaurante`, `inmobiliaria`, `clinica`, `barberia`.

## Antes de 1.20.0

Ver `PLAN.md` y `docs/BITACORA-*.md` para el detalle histórico (beta, sistema de
licencias v2 Ed25519, rediseño de identidad, Web Sync, playground "Probar el bot").
