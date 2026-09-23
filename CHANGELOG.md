# Changelog

Cambios notables de Kooni. Formato aproximado de
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones = `package.json`.

El CLI `kooni-bot` se versiona aparte (npm) — ver la nota de cada versión.

## [1.48.0] — 2026-09-23

### Agregado — sistema de licencias (super admin + panel del cliente) y login del CLI

- **Backend InsForge `kooni`** (`migrations/` + `functions/`): licencias por
  instalación con módulos, límites y marca blanca; uso agregado (sin PII).
- **Paneles** (`kooni-paneles/`, React + Vite): super admin (`/admin`) y panel del
  cliente (`/`), desplegados en InsForge.
- **Bot**: `syncLicenseState()` (cron + `POST /license/sync`, fail-open) aplica
  plan/módulos/límites/marca desde el panel; `unlockedModules()` reactiva el gating
  por módulo (sin `module_unlocks` → todo abierto, retrocompatible).
- **CLI `kooni-bot login`** (device flow) + registro de la instalación
  (`licencia-emitir`) y token por instalación (`KOONI_INSTALL_TOKEN`).
- Nuevas vars: `KOONI_API_URL`, `KOONI_INSTALL_TOKEN`, `LICENSE_PUBLIC_KEY`.

## [Unreleased]

### Corregido — mensajes que se perdían al pausar (conversación "vacía")

Una conversación podía aparecer en la bandeja **sin ningún mensaje** (ni
recibidos ni enviados) y sin respuesta del bot. Causa: `ingest()` creaba el hilo
y recién guardaba el mensaje en `processBuffer()`; cualquier salida temprana
(pausa de canal, bot pausado, takeover, spam, tope diario, límite free) dejaba el
hilo creado pero vacío.

- **El entrante se guarda siempre** (`SupportAgent.persistInbound()`), antes de
  cualquier decisión de responder. `processBuffer()` ya no lo duplica.
- La pausa ahora apaga la **respuesta**, nunca el **registro**: el dueño ve en el
  panel lo que el cliente escribió aunque el bot esté en pausa o en takeover.
- **Timeouts de 15s** en los envíos salientes de Zernio, WAHA y Meta: un
  proveedor colgado ya no bloquea el Durable Object ni la conversación.
- Nuevo runbook: [`docs/MENSAJERIA.md`](./docs/MENSAJERIA.md) (ciclo de vida,
  matriz de pausas y diagnóstico).
- Regresión en `test/agent.media.test.ts`: "el mensaje del cliente NUNCA se pierde".

### Corregido — el QR de WAHA no aparecía (sesión en FAILED/STOPPED)

Con la URL y la API key bien puestas, la card de WAHA se veía "CONECTADO" pero
sin QR. El panel solo pintaba el QR cuando el estado era `SCAN_QR_CODE` o
`STARTING`; si la sesión quedaba `FAILED` (WhatsApp deslogueado), `STOPPED` o
inalcanzable, la card quedaba muda — sin QR y sin pista de qué hacer.

- **Nunca más en blanco**: cualquier estado configurado muestra algo — el QR, una
  explicación del estado real (con el status de WAHA) o el aviso de que el
  servidor no responde.
- **Botón «Reiniciar sesión y generar QR»** (`POST /admin/conexiones/waha/restart`)
  para recuperar una sesión caída sin re-guardar la card a mano.
- El `<img>` del QR tiene fallback visible si el proxy falla, y el QR se
  **renueva solo cada 20s** (WhatsApp lo rota: así el escaneo no falla por caducar).

## [1.47.0] — 2026-09-14

### Agregado — Nicho TAXIS (central de despacho con bases y cola de conductores)

Nuevo pack opt-in (`BOT_NICHE=taxis`) para cooperativas/centrales de taxis. El
bot atiende al cliente que pide un taxi y despacha solo; si no hay conductores,
escala al operador.

- **Bases y conductores** en el panel (`/admin/bases`, `/admin/conductores`):
  cada base tiene zonas (con tarifa), coordenadas, tarifa base y ETA; cada
  conductor tiene código, WhatsApp, base, vehículo y placa.
- **Cola FIFO por base** (`/admin/cola`): el conductor entra al final de la fila
  escribiendo desde su WhatsApp registrado; el bot lo reconoce e intercepta el
  mensaje ANTES del agente (`src/taxi/driverInbound.ts`), así no pasa por el
  modelo ni aparece como conversación de cliente. Comandos: `salir`, `fin`,
  `estado`; cualquier otro texto = “llegué”.
- **Despacho automático**: el bot pide la ubicación (pin de WhatsApp o zona) y
  elige la base más cercana con conductores — por GPS (Haversine) o por match de
  zona — y asigna al siguiente de la fila. Tool `solicitarTaxi`.
- **Sin conductores → urgente**: el viaje queda `sin_conductor` y el chat se
  marca con ticket + etiqueta de atención humana + aviso al dueño, para que el
  operador asigne a mano.
- **Elegir conductor desde el chat**: selector en la cabecera del hilo
  (`POST /admin/conversations/:id/assign-driver`) que asigna (o crea) el viaje y
  le manda al cliente el conductor asignado.
- **Panel de viajes** (`/admin/viajes`) con avance de estado, asignación manual y
  alerta sonora de viaje nuevo; PWA abre en Viajes (`/admin/viajes?tv=1`).
- **Reportes** (`/admin/reportes`): viajes, por base, ranking de conductores,
  demanda por zona, ingreso estimado y salud del bot — con export CSV.
- **Canales del nicho**: solo WhatsApp (Cloud API oficial + WAHA). En Conexiones
  y en el flujo del agente se ocultan los demás canales.
- **Cron**: `runTaxiMaintenance()` expira conductores que llevan demasiado en la
  cola y cierra viajes colgados.
- **Tablas nuevas** (idempotentes, `src/db/schema.sql`): `taxi_bases`,
  `taxi_drivers`, `taxi_queue`, `taxi_trips`, `taxi_trip_events`.
- **KB**: plantillas `docs/kb-plantillas/taxis-{faq,tarifas,casos-limite}.md`.
- **Ubicación entrante**: los adaptadores de WhatsApp Cloud y WAHA ahora leen el
  pin de ubicación (`IncomingMessage.location`).

> Instalaciones existentes: `pnpm db:apply:remote` crea las tablas (idempotente,
> no toca datos) y el `BOT_NICHE=taxis` queda inerte hasta que se active.

### CLI

- `kooni-bot@0.4.1`: `taxis` agregado a la lista de giros del instalador.

## [1.46.0] — 2026-09-14

### Agregado — Zona horaria del negocio configurable (una sola fuente de verdad)

- Nuevo setting **Configuración → 🕐 Zona horaria del negocio**
  (`business_timezone`, select de zonas IANA comunes). Se valida del lado del
  servidor: una zona inválida se ignora y cae al default, así un typo no puede
  mandar las citas a la hora equivocada.
- Antes había **tres orígenes** que se podían desincronizar: el reloj del bot y
  la agenda leían `env.CALCOM_TIMEZONE` (con fallback hardcodeado), y las fechas
  del panel leían `member/config.local.ts`. En cardaniel eso significaba que el
  bot pensaba en hora de Ciudad de México mientras el negocio está en Florida:
  **dos horas de desfase** al interpretar "hoy", "mañana" o al pedir horarios.
- Ahora manda el setting y todos leen de `src/timezone.ts`:
  el reloj del bot, la agenda de Cal.com, el guardia de "fecha en el pasado" y
  el default de Cal.com (antes duplicado). Precedencia:
  `business_timezone` → `CALCOM_TIMEZONE` (legacy) → default.

### Arreglado — El prompt del bot no se podía cachear nunca

- El prompt generado incluía la **hora con precisión de minuto**, así que su
  texto cambiaba cada 60 segundos y **OpenAI nunca acertaba el caché de prefijo**:
  el prompt completo (~2-3k tokens) se re-pagaba en cada turno y en cada paso del
  loop de tools.
- El prompt grande ahora lleva **solo la fecha** (estable durante todo el día) y
  la **hora exacta + offset** se inyecta en un bloque de sistema aparte,
  recalculado cada turno. El bot sigue sabiendo qué hora es —lo que necesita para
  agendar y para "hoy"/"mañana"— sin romper el caché.

### Tests

- `test/timezone.test.ts`: validación de zonas, precedencia, e invariancia de la
  fecha dentro del mismo día (que es lo que habilita el caché) incluyendo el
  cambio de día según la zona.

## [1.45.0] — 2026-09-14

### Arreglado — El scraping de inventario no traía datos (sitemaps XML)

- **Causa raíz**: los sitemaps de inventario (`.../inventory_sitemap`) son **XML**
  y se pedían a Decodo con `markdown: true`. El conversor a Markdown no maneja
  XML, así que Decodo respondía **200 con `content` vacío** → `scrapeUrl`
  devolvía "sin contenido" y la corrida entera fallaba. En cardaniel estaban
  fallando **las 3 últimas corridas**, y el sync caía a modo texto sin
  actualizar el inventario.
- Ahora, si la respuesta en Markdown viene vacía y no se pidió HTML de forma
  explícita, `scrapeUrl` **reintenta una vez sin markdown** y devuelve el
  XML/HTML crudo. El parseo determinista (`parseInventoryFromAny`) ya sabía leer
  sitemaps: solo faltaba que le llegara el contenido.
- **Verificado a nivel unitario con mocks.** No pudo confirmarse contra la API
  real: durante el diagnóstico Decodo devolvía `401` con saldo agotado.

### Arreglado — Un feed caído congelaba precios y fotos para siempre

- El enriquecimiento nocturno (`refreshVehicleImages`: precio, millas y foto de
  cada ficha) vivía **dentro** del bloque `inventorySeen`, así que bastaba con
  que el feed fallara para que ni se intentara. En cardaniel eso dejó **280 de
  449 autos sin precio y 152 sin foto**, acumulándose corrida tras corrida.
- Ahora corre siempre que la corrida nocturna lo pida, haya o no inventario
  nuevo. Sigue siendo seguro: solo AGREGA datos (nunca borra) y está acotado a
  20 autos por corrida con cooldown por ficha.

### Tests

- `test/integrations/decodo.test.ts`: 3 casos nuevos del fallback — recupera el
  XML, no reintenta si se pidió HTML explícito, y propaga el error si el
  reintento también falla.

## [1.44.0] — 2026-09-14

### Agregado — Modelo de análisis separado del del chat

- Nueva sección **Configuración → Modelo de análisis (scraping)**: proveedor,
  modelo, URL base y API key **propios**, independientes del chat. Permite pagar
  un modelo bueno para el análisis (ej. Claude Opus) y uno barato para chatear
  (ej. gpt-4o-mini), incluso contra **otra API**.
- Todo vacío = **hereda la configuración del bot** (misma API, mismo modelo).
  La API key y la URL base se heredan solo si el proveedor coincide: heredar una
  llave de OpenAI para llamar a Anthropic daría 401.
- Claves nuevas: `analysis_llm_provider`, `analysis_llm_api_key`,
  `analysis_llm_model`, `analysis_llm_api_base_url`.
- `createAnalysisModel()` en `src/llm/provider.ts` (tier `smart` por defecto:
  el análisis corre pocas veces al día y conviene el modelo bueno).

### Agregado — Análisis IA del inventario scrapeado (opcional)

- Nuevo toggle **Extras → Análisis IA del inventario**
  (`feature_web_sync_analysis_enabled`), **apagado por defecto**.
- Tras cada sincronización, el modelo revisa los autos ya parseados y devuelve
  **correcciones** de título, marca, modelo, año, precio, millaje y condición.
- **Garantías**: el modelo solo puede tocar autos que ya existen (por `key`) —
  nunca agrega ni borra —, cada corrección se valida por rango antes de
  aplicarse, y un fallo del modelo **nunca** bloquea ni vacía el inventario.
  Cota de 40 autos por corrida, priorizando los sospechosos (sin VIN, sin
  precio, sin año o con título basura).
- El resultado queda registrado en el scraping (`web_sync_runs.note`).

### Arreglado — Multi-idioma: no funcionaba en la práctica

- **Causa raíz**: las reglas de idioma vivían SOLO en el texto del prompt, así
  que un `system_prompt_override` las desactivaba por completo — el toggle de
  Extras se podía encender y apagar sin que cambiara nada.
- Nuevo detector de idioma determinista **es/en/pt** (`src/lang/detect.ts`):
  stopwords + señales diacríticas (`ñ/¿/¡` vs `ã/õ/ç`), sin API externa. Ante
  duda devuelve `null` en vez de adivinar.
- El idioma del cliente se detecta **una vez por conversación** y se inyecta
  como **bloque de sistema aparte** del prompt → gobierna haya o no override.
- **Contrato del toggle**: con Multi-idioma apagado el bot responde SIEMPRE en
  el idioma base (`BOT_LANGUAGE`); encendido, sigue el idioma del cliente.
- Las respuestas **públicas a comentarios** (`src/aiReply.ts`) ahora también
  respetan el idioma del comentario (antes estaban fijas en español).
- **Bug**: se pasaba `lastUserLang = "es-MX"` pero la tabla de palabras de
  frustración está indexada por `es|en|pt`, así que la detección de frustración
  nunca escalaba al modelo "smart".

### Arreglado — El bot no encontraba la información del inventario

- **Marca tolerante**: el filtro por marca exigía coincidencia EXACTA
  (`make === filtro`), así que mandar "kia sorento" o "KIA " devolvía 0
  resultados y el bot concluía que ese auto no existía.
- El límite de resultados por consulta pasó de **8 a 12** y, cuando hay más
  coincidencias que el límite, la tool devuelve un **panorama agregado** (rango
  de años y de precio) e instruye a acotar con el cliente en vez de listar todo
  o hacer creer que solo hay 12.

### Arreglado — Toggles del menú Extras que no gobernaban nada

- `feature_web_sync_enabled` se escribía desde el panel pero **nadie lo leía**:
  el sync corría igual. Ahora apagarlo detiene de verdad la corrida (cron, API y
  panel). Lectura compatible hacia atrás: solo un `"0"` explícito apaga; una
  instalación donde nunca se tocó sigue sincronizando como antes.
- `AgentConfig.oidoVistaEnabled` era un campo muerto (el gate releía los
  settings): ahora es la **única fuente de verdad** del toggle "Oído y vista".

### Arreglado — Respuestas públicas detrás de un gateway

- `aiReply` construía sus overrides a mano y **omitía `llm_api_base_url`**, así
  que con un gateway (AIsa/OpenRouter) esa llamada fallaba mientras el chat sí
  funcionaba.

### Notas

- El paquete npm `kooni-bot` (CLI) **no cambia**: todo esto vive en la app del
  Worker, no en el instalador.

## [1.43.0] — 2026-09-11

### Agregado — Registro de scraping (control interno de Decodo)

- **Nueva sección Análisis → “Scraping”** (`/admin/scraping`, solo lectura): qué
  pasó en cada corrida de Decodo (Web Sync / inventario), sea del **cron
  nocturno**, del botón **manual** del panel o del endpoint por token.
- Por corrida guarda el **resumen** (autos totales, nuevos, vendidos/salieron,
  cambios, errores, duración) y el **detalle**: autos **nuevos** (con link),
  **vendidos** y **cambios campo a campo** (título, condición, precio, millas,
  link y desglose de precio) mostrados como `antes → después`.
- KPIs (autos actuales, última corrida, nuevos/vendidos/cambios de 7 días),
  filtro por disparador, paginación, **export CSV** y botón **“Scrapear ahora”**.
- Persistencia en D1: tablas `web_sync_runs` + `web_sync_changes` (se crean en
  toda instalación) y retención de **90 días** (purga en el cron nocturno).
- El diff es **informativo**: nunca altera el inventario.
- Acceso directo desde **Configuración → Scraping web (Decodo)**.

## [1.42.0] — 2026-09-10

### Agregado — API key de Decodo configurable desde el panel

- Nueva sección **Configuración → Scraping web — API key de Decodo**: el dueño
  pega su credencial (`usuario:contraseña` o base64) **sin `wrangler secret`**.
- Resolución: **settings del panel** primero; si está vacía, cae al secret
  `DECODO_AUTH` del worker. **Instalación limpia → vacío** (el scraping queda
  apagado hasta que la pongan).
- Botón **“Usar la del worker”** + `POST /admin/config/decodo-import` y
  `POST /kb/decodo-import` (token) para persistir la key actual del worker.
- El valor se **redacta en el registro de auditoría** (`decodo_auth`).

## [1.41.0] — 2026-09-10

### Agregado — Cobranza: opt-out, ventana horaria, reglas con voz, reportes

- **Opt-out (DNC)**: tabla `collection_dnc` + botón en la ficha. Un deudor que
  pide no ser contactado **nunca** recibe mensajes ni llamadas del motor.
- **Ventana horaria** del motor: hora local desde/hasta + offset UTC (settings y
  panel). El botón “correr ahora” la ignora a propósito.
- **Reglas**: editar desde el panel (además de crear/borrar) y **canal “Voz”**
  que dispara la llamada con IA (Vapi/Retell) en vez de un mensaje.
- **Promesa cumplida**: al registrar el pago total de una deuda, la promesa pasa
  a `kept` y el caso a `pagado`.
- **Reportes** en `/admin/cartera`: tasa de recuperación, efectividad por canal
  (intentos/contactados/promesas/pagos) y embudo por etapa.
- **Filtros** por lista/etapa + paginación y export CSV.
- Docs: `docs/COBRANZA.md` (guía completa del nicho).

## [1.40.0] — 2026-09-10

### Agregado — Cobranza: motor, reglas, voz y promesas (nicho `cartera`)

- **Motor de cobranza** (`src/collections/engine.ts`): recorre las reglas de mora
  activas y manda recordatorios por el canal del deudor, con **cooldown 20 h**,
  **intentos máximos** y **tope por corrida**. Guarda el mensaje en el hilo del
  CRM y registra interacción + intento. Corre en el cron (solo BOT_NICHE=cartera).
- **Reglas de cobranza** en `/admin/cartera`: tramo de mora (días), canal,
  plantilla con variables `{nombre} {negocio} {saldo} {vence} {dias}` e intentos.
- **“Correr cobranza ahora”** y **export CSV** desde el panel; filtros y KPIs.
- **Voz (Vapi/Retell)**: tool `llamarDeudor` + botón en la ficha del deudor. Los
  webhooks `/webhooks/vapi` y `/webhooks/retell` registran el resultado
  (promesa / pago / disputa / sin respuesta) en la cartera y mueven la etapa.
- **Promesas de pago**: recordatorio en las 24 h previas y marcado automático de
  las incumplidas.

## [1.39.0] — 2026-09-10

### Agregado — Nicho “Cartera de cobros” (se elige al instalar)

- **Nuevo pack de nicho `cartera`** (`BOT_NICHE=cartera`): re-etiqueta el panel
  (Gestiones, estados de cobranza), aporta playbook de cobranza (tono firme y
  respetuoso, anti-acoso, escalado obligatorio) y tools propias.
- **Tools del agente**: `consultarDeuda` (saldo real, nunca inventar) y
  `registrarPromesa` (promesa de pago fecha+monto, mueve la gestión a
  `promesa`).
- **Panel `/admin/cartera`** (se suma al nav por `hooks.navExtra`): KPIs (deuda
  total, en mora, en promesa, recuperado), importación de cartera por CSV
  (`nombre, teléfono, monto, vence, referencia`), búsqueda, ficha del deudor con
  deuda, pagos, promesas, historial y etapas.
- **Esquema**: tablas `debtor_lists`, `debtors`, `debt_accounts`,
  `collection_cases`, `collection_interactions`, `collection_contact_attempts`,
  `collection_rules`, `payment_promises` (se crean en toda instalación).
- **CLI `kooni-bot` 0.4.0**: `init` ahora **pregunta el giro** y estampa
  `BOT_NICHE` en `wrangler.toml` (opciones: generico, agencia-ia, restaurante,
  inmobiliaria, clinica, barberia, **cartera**).

## [1.38.0] — 2026-09-10

### Agregado — “Atención humana”: etiqueta + tickets + kanban (general)

- Nueva tabla `conversation_labels` + `ConversationLabelsRepo`. Etiqueta de
  sistema `atencion_humana` (“Atención humana”).
- **Marcado automático**: la tool `handoffHuman` (el bot escala a un humano) y
  el **vigilante** (riesgo detectado) etiquetan la conversación.
- **Conversaciones**: chip/badge `⚑ atención humana` en la lista y un botón en
  el header del hilo para marcarla/quitarla a mano
  (`POST /admin/conversations/:id/label`). Al **resolver el ticket** se quita.
- **Tickets**: la sección ahora muestra el nombre del contacto, canal, el
  **resumen completo**, un extracto del hilo desplegable y un botón
  **“Abrir conversación →”**.
- **Kanban de leads**: badge `⚑ atención humana` en la tarjeta (y marca en la
  tabla).
- Aplica a **todas las instalaciones**: la tabla se crea con `schema.sql` en el
  update.

## [1.37.3] — 2026-09-10

### Arreglado — nombre del lead en WhatsApp (pushName, no el `@lid`)

- `wahaAdapter.parseIncoming` ahora devuelve `displayName` con el **pushName**
  del remitente: lo saca del payload (`_data.notifyName`, `pushName`, `name` de
  `contact`/`sender`) y, si no viene, se lo pide a WAHA
  (`GET /api/contacts?contactId=…&session=…` → `pushname` > `name` > ...). Antes
  no devolvía nombre, así que la conversación/lead quedaba sin nombre y el CRM
  mostraba el id (`7345…@lid`).
- `ConversationsRepo.getOrCreate` hace **backfill** del `display_name` cuando
  existía vacío (no pisa un nombre ya guardado).

## [1.37.2] — 2026-09-10

### Arreglado — los mensajes de WAHA no entraban (shape del webhook)

- `wahaAdapter.parseIncoming` esperaba `payload.text` + `payload.chatId`, pero
  WAHA (WAMessage, verificado contra su OpenAPI) manda **`payload.body`** y
  **`payload.from`**. Resultado: el webhook llegaba, el worker lo descartaba en
  silencio y **no se creaba ninguna conversación**.
- Ahora acepta ambos shapes (`body`/`text`, `from`/`chatId`) y también
  `payload.mediaUrl` como fuente del media. Tests que fijan el shape real de
  WAHA (texto y media).

## [1.37.1] — 2026-09-10

### Arreglado — links clickeables en TODOS los canales

- `pickAdapter` ahora envuelve cada adaptador y normaliza los chunks salientes
  con `toPlainLinks` (Markdown → URL plana). Es el punto único por el que pasan
  **todos** los envíos: agente, tools (`sendReplyCapped`), campañas, follow-ups
  y la respuesta manual del CRM. Antes solo el texto del agente y
  `chunkReply`/`stripMarkdown` lo hacían, así que otros caminos podían mandar
  `[texto](url)` literal (no clickeable en WhatsApp/Instagram/Messenger).
- Zernio: los mensajes de **automatización** (auto-DM, respuesta pública al
  comentario, follow prompt) también se normalizan.
- Test nuevo `test/replies/plainlinks.test.ts` que fija WhatsApp (WAHA),
  Instagram/ Messenger (Meta) y Zernio.

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
