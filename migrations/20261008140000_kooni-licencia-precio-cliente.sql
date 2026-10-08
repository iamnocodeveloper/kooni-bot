-- Tarifa mensual personalizada por cliente (override por licencia).
-- Se aplica en `pago-crear` (functions/) en vez del precio del plan cuando está
-- seteada. `plan_ref` limita el override a un plan comercial concreto (null =
-- aplica a cualquier plan que compre el cliente).
alter table public.licencias
  add column if not exists precio numeric(10,2),
  add column if not exists moneda text,
  add column if not exists plan_ref text;
