-- ============================================================================
-- Kooni — Etiquetas+IA, Cotizaciones PDF, archivos salientes, Disparadores
-- (keyword→flujo) y la novedad de MIGRACIÓN entre cuentas de Cloudflare.
-- ----------------------------------------------------------------------------
-- 1) Nuevos módulos en el catálogo (espeja PAID_MODULES de src/modules.ts) para
--    que el super admin los active por licencia.
-- 2) Novedades visibles a TODOS los usuarios: la migración de instalación
--    (npx kooni-bot migrate) y las funciones nuevas.
-- Idempotente: re-ejecutarlo no duplica módulos ni novedades.
-- ============================================================================

-- ── 1. Catálogo de módulos ──────────────────────────────────────────────────
insert into public.modulos_catalogo (id, nombre, descripcion, tipo, tab, orden) values
  ('etiquetas_ia', 'Etiquetado inteligente', 'Crea tus propias etiquetas y deja que el bot etiquete cada conversación solo: por palabras clave o por IA. Filtra y organiza por etiqueta.', 'membresia', null, 210),
  ('archivos_salientes', 'Enviar archivos y PDF', 'El bot puede enviar imágenes y documentos (PDF) en sus respuestas, no solo texto. El PDF se genera al vuelo por un enlace firmado.', 'membresia', null, 220),
  ('cotizaciones', 'Cotizaciones en PDF', 'El bot arma la cotización con tu formato, se genera el PDF y se envía al cliente en la conversación. Editable y reenviable desde el panel.', 'membresia', null, 230),
  ('flujos', 'Disparadores por palabra clave con IA', 'Cuando el cliente dice cierta palabra (o la IA detecta una intención) se dispara un flujo: responder fijo/IA, etiquetar, capturar lead, pasar a humano o una secuencia.', 'membresia', null, 240),
  ('canal_waha', 'Canal WhatsApp (WAHA)', 'Habilita el canal de WhatsApp self-hosted (WAHA) por licencia. Requiere además la URL/API key del servidor WAHA en Conexiones. Sin este módulo, el webhook de WAHA queda apagado.', 'membresia', null, 250)
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  tipo = excluded.tipo,
  tab = excluded.tab,
  orden = excluded.orden;

-- ── 2. Novedades ────────────────────────────────────────────────────────────

-- 2a. Migración entre cuentas de Cloudflare (la más importante para el cliente).
insert into public.novedades (fecha, origen, tipo, version, titulo, cuerpo, cta_label, cta_url, update_hint, visible)
select current_date, 'kooni', 'nuevo', null,
  'Migra tu instalación a otra cuenta de Cloudflare',
  E'¿Configuraste un demo para un cliente y ya está listo para producción? Ahora puedes MIGRARLO ENTERO a otra cuenta de Cloudflare sin reinstalar desde cero.\n\nSe copia todo tal como está: la base de datos (clientes, conversaciones, cotizaciones, etiquetas, pedidos…), la configuración, los secrets, la base de conocimiento (se re-indexa sola) y la licencia (se re-vincula a la cuenta nueva). Tu cuenta de origen no se toca.\n\nRequisitos: un API token con permiso de Workers/D1/Vectorize en la cuenta DESTINO, y su Account ID.',
  'Ver cómo migrar',
  'https://github.com/iamnocodeveloper/kooni-bot/blob/main/docs/MIGRACION.md',
  'npx kooni-bot migrate ./mi-bot --to-token <TOKEN> --to-account <ACCOUNT_ID>',
  true
where not exists (select 1 from public.novedades where titulo = 'Migra tu instalación a otra cuenta de Cloudflare');

-- 2b. Etiquetas + IA, cotizaciones y disparadores.
insert into public.novedades (fecha, origen, tipo, version, titulo, cuerpo, cta_label, cta_url, update_hint, visible)
select current_date, 'kooni', 'nuevo', null,
  'Etiquetas con IA, cotizaciones en PDF y disparadores por palabra clave',
  E'Llegaron tres funciones nuevas:\n\n• ETIQUETAS CON IA — crea tus propias etiquetas y el bot las pone solo: por palabras clave ("si dice factura → etiqueta X") o por IA (entiende la intención). Etiqueta a mano desde el panel y filtra las conversaciones por etiqueta.\n\n• COTIZACIONES EN PDF — el bot arma la cotización con tu formato, se genera el PDF y se envía al cliente en la conversación. Ves el borrador en el chat, lo editas y lo reenvías.\n\n• DISPARADORES — cuando el cliente dice una palabra (o la IA detecta una intención) se dispara una acción: responder texto/IA, etiquetar, capturar lead, pasar a un humano o una secuencia de mensajes. En todos los canales.',
  'Ver mis funciones',
  null,
  'npx kooni-bot update',
  true
where not exists (select 1 from public.novedades where titulo = 'Etiquetas con IA, cotizaciones en PDF y disparadores por palabra clave');
