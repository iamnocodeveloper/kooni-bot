-- Facturación: la tabla `pagos` crece para soportar checkout por proveedor
-- (Stripe / PayPal / Payphone) y el match de webhooks.
alter table public.pagos
  add column if not exists plan_id text,
  add column if not exists checkout_ref text,
  add column if not exists checkout_url text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists raw jsonb;

create index if not exists pagos_checkout_ref_idx on public.pagos (checkout_ref);
create index if not exists pagos_external_id_idx on public.pagos (external_id);

create trigger pagos_updated_at before update on public.pagos
  for each row execute function system.update_updated_at();
