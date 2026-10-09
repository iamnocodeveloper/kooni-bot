-- Novedades (hub) — Galería con subida, recursos de campaña en el primer
-- mensaje, y seguimiento personalizable con adjuntos. Idempotente por título;
-- visibles para todos los clientes en /novedades. origen 'kooni+' (funciones del
-- menú Extras). NO se menciona WAHA (edición privada).

insert into public.novedades
  (fecha, origen, tipo, version, titulo, cuerpo, cta_label, cta_url, update_hint, visible)
select current_date, 'kooni+', 'nuevo', '1.61.0',
  'Galería: subí imágenes, notas de voz, PDF y videos',
  E'Ahora cargás tus recursos desde el panel (Galería) y el bot los manda de verdad: imágenes, notas de voz, PDF y videos. Se suben con un clic (o pegás una URL) y quedan listos para usar cuando el cliente los pida.',
  null, null, 'npx kooni-bot update', true
where not exists (select 1 from public.novedades where titulo = 'Galería: subí imágenes, notas de voz, PDF y videos');

insert into public.novedades
  (fecha, origen, tipo, version, titulo, cuerpo, cta_label, cta_url, update_hint, visible)
select current_date, 'kooni+', 'nuevo', '1.61.0',
  'Material de campaña: se envía solo en el primer mensaje',
  E'Para quienes llegan de un anuncio: marcá un recurso como "enviar en el primer mensaje" y el bot lo manda apenas el cliente escribe por primera vez, sin depender de la IA. Después sigue la conversación normal (o tu pregunta de seguimiento).',
  null, null, 'npx kooni-bot update', true
where not exists (select 1 from public.novedades where titulo = 'Material de campaña: se envía solo en el primer mensaje');

insert into public.novedades
  (fecha, origen, tipo, version, titulo, cuerpo, cta_label, cta_url, update_hint, visible)
select current_date, 'kooni+', 'nuevo', '1.61.0',
  'Mensajes de seguimiento a tu medida (con adjuntos)',
  E'Ahora escribís hasta 3 mensajes de seguimiento con tus propias palabras (o los dejás con IA) y le adjuntás una imagen, video o PDF a cada uno. El bot retoma al cliente que se enfrió, en tu tono y con tu material.',
  null, null, 'npx kooni-bot update', true
where not exists (select 1 from public.novedades where titulo = 'Mensajes de seguimiento a tu medida (con adjuntos)');
