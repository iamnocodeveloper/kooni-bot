-- Giro nuevo: eventos (renta de equipo para fiestas / photobooth, audio, mobiliario).
-- Catálogo de packs del hub: la landing y el panel de licencias leen de acá.
-- Idempotente: se puede correr más de una vez sin duplicar.
insert into public.packs (id, nombre, emoji, descripcion, version, orden)
values
  ('eventos', 'Eventos / renta de equipo', '🎉', 'Cotiza por WhatsApp y aparta la fecha.', '1.0', 45)
on conflict (id) do update
  set nombre = excluded.nombre,
      emoji = excluded.emoji,
      descripcion = excluded.descripcion,
      version = excluded.version,
      orden = excluded.orden;
