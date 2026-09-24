-- Configuración de proveedores de pago, editable desde el super admin.
-- Las keys se guardan aquí (RLS: solo admin) y las edge functions las leen con
-- service role. Si un proveedor no tiene config, se usa el secret de entorno.
create table if not exists public.pago_proveedores (
  id text primary key,
  nombre text not null,
  activo boolean not null default false,
  modo text not null default 'test' check (modo in ('test', 'live')),
  config jsonb not null default '{}'::jsonb,
  orden int not null default 100,
  updated_at timestamptz not null default now()
);

create trigger pago_proveedores_updated_at before update on public.pago_proveedores
  for each row execute function system.update_updated_at();

alter table public.pago_proveedores enable row level security;

create policy pago_prov_select on public.pago_proveedores
  for select to authenticated
  using (public.is_admin());

create policy pago_prov_admin_write on public.pago_proveedores
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.pago_proveedores from anon, authenticated;
grant select, insert, update, delete on public.pago_proveedores to authenticated;

insert into public.pago_proveedores (id, nombre, activo, modo, config, orden) values
  ('stripe',   'Stripe',   false, 'test', '{"secret_key":"","webhook_secret":""}'::jsonb, 10),
  ('paypal',   'PayPal',   false, 'test', '{"client_id":"","client_secret":"","webhook_id":""}'::jsonb, 20),
  ('payphone', 'Payphone', false, 'test', '{"token":"","store_id":""}'::jsonb, 30),
  ('binance',  'Binance (manual)', false, 'test', '{"pay_id":"","instructions":""}'::jsonb, 40)
on conflict (id) do nothing;
