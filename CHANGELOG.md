# Changelog

Cambios notables de Kooni. Formato aproximado de
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones = `package.json`.

El CLI `kooni-bot` se versiona aparte (npm) — ver la nota de cada versión.

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
