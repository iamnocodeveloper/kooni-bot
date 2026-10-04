-- Giro nuevo: concesionario (venta de autos nuevos/usados con inventario real).
-- Catálogo de packs del hub: la landing y el panel de licencias leen de acá.
-- Idempotente: se puede correr más de una vez sin duplicar.
insert into public.packs (id, nombre, emoji, descripcion, version, orden)
values
  ('concesionario', 'Concesionario / venta de autos', '🚗', 'Muestra tu inventario real y agenda pruebas de manejo.', '1.0', 46)
on conflict (id) do update
  set nombre = excluded.nombre,
      emoji = excluded.emoji,
      descripcion = excluded.descripcion,
      version = excluded.version,
      orden = excluded.orden;

-- Texto corregido: el bot no envía recordatorios de cita (solo agenda).
update public.packs
  set descripcion = 'Llena la silla con citas por WhatsApp.'
  where id = 'barberia' and descripcion = 'Llena la silla y baja los no-shows.';
