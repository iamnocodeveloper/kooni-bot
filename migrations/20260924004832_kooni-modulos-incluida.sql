-- Separa "Habilidades" (lo incluido en el plan base) de "Superpoderes" (lo de
-- pago), y anota qué requisito necesita cada uno para poder encenderse.
alter table public.modulos_catalogo
  add column if not exists incluida boolean not null default false,
  add column if not exists requiere text;

-- Requisitos conocidos (config extra para que el superpoder funcione).
update public.modulos_catalogo set requiere = 'google_review' where id = 'resenas';
update public.modulos_catalogo set requiere = 'stripe' where id = 'cobros';
