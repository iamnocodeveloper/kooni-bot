-- ============================================================================
-- Kooni — núcleo del sistema de licencias / super admin / panel del cliente
-- ============================================================================
-- Un solo proyecto InsForge sirve a los dos paneles:
--   · Super admin  → gestiona licencias, módulos por licencia, instalaciones,
--                    estadísticas agregadas, marca blanca y dominios.
--   · Cliente      → su cuenta, sus instalaciones y el estado de su plan.
-- La CLI y el worker del bot hablan por edge functions (service role).
--
-- Reglas de acceso: cada tabla con datos de usuario tiene RLS + GRANTs
-- explícitos. `is_admin()` es SECURITY DEFINER para no reentrar en RLS.
-- ============================================================================


-- ── profiles ────────────────────────────────────────────────────────────────
-- Espejo de auth.users con el rol del usuario. `admin` = super admin.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'cliente' check (role in ('cliente', 'revendedor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── licencias ───────────────────────────────────────────────────────────────
-- Una licencia por instalación/cliente. `code` es el código firmado Ed25519
-- (KOONI-PRO-V2-…) que el bot valida offline. `modules`/`limits`/`brand` son el
-- overlay que el panel aplica (módulos activos, topes, marca blanca).
create table if not exists public.licencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  kind text not null default 'lifetime' check (kind in ('lifetime', 'monthly')),
  expiry timestamptz,
  estado text not null default 'activa' check (estado in ('activa', 'revocada', 'vencida')),
  modules jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  brand jsonb not null default '{}'::jsonb,
  bot_slug text,
  inst_uid text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── instalaciones ───────────────────────────────────────────────────────────
-- Cada bot desplegado. `uid` es el id de 6 chars que estampa el CLI; liga la
-- licencia con el worker. `token_hash` = hash del token por instalación que usa
-- el worker para hablar con el backend (reemplaza el token compartido).
create table if not exists public.instalaciones (
  id uuid primary key default gen_random_uuid(),
  licencia_id uuid references public.licencias(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  uid text,
  slug text,
  worker_url text,
  bot_name text,
  db_name text,
  kb_name text,
  tier text default 'free',
  provider text,
  platform text,
  cli_version text,
  bot_version text,
  token_hash text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── uso_instalaciones ───────────────────────────────────────────────────────
-- Reporte agregado (sin PII) que el worker empuja cada noche. Un renglón por
-- instalación y día.
create table if not exists public.uso_instalaciones (
  id uuid primary key default gen_random_uuid(),
  instalacion_id uuid not null references public.instalaciones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null default current_date,
  conteos jsonb not null default '{}'::jsonb,
  costos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── modulos_catalogo ────────────────────────────────────────────────────────
-- Catálogo de funciones vendibles. Espeja PAID_MODULES de src/modules.ts para
-- que el panel liste y active funciones por licencia.
create table if not exists public.modulos_catalogo (
  id text primary key,
  nombre text not null,
  descripcion text,
  tipo text not null default 'membresia' check (tipo in ('pago_unico', 'membresia')),
  tab text,
  orden int not null default 100,
  activo boolean not null default true
);

-- ── dominios ────────────────────────────────────────────────────────────────
-- Dominios propios por instalación (marca blanca).
create table if not exists public.dominios (
  id uuid primary key default gen_random_uuid(),
  instalacion_id uuid references public.instalaciones(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hostname text not null unique,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activo', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── device_codes ────────────────────────────────────────────────────────────
-- Login del CLI por dispositivo (device flow, estilo Forja/GitHub). El CLI pide
-- un código; el usuario lo aprueba logueado en el panel; el CLI hace polling y
-- recibe su sesión. Solo lo tocan las edge functions (service role).
create table if not exists public.device_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired')),
  user_id uuid references auth.users(id) on delete set null,
  session_token text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- ── cli_tokens ──────────────────────────────────────────────────────────────
-- Sesiones del CLI (una por máquina). El token se guarda hasheado.
create table if not exists public.cli_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── pagos ───────────────────────────────────────────────────────────────────
-- Registro de pagos (manual desde el panel o por webhook del proveedor).
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  licencia_id uuid references public.licencias(id) on delete set null,
  provider text not null default 'manual',
  amount numeric(12, 2),
  currency text not null default 'usd',
  status text not null default 'pendiente' check (status in ('pendiente', 'pagado', 'fallido', 'reembolsado')),
  external_id text,
  notas text,
  created_at timestamptz not null default now()
);


-- ── índices ─────────────────────────────────────────────────────────────────
create index if not exists licencias_user_id_idx on public.licencias (user_id);
create index if not exists instalaciones_user_id_idx on public.instalaciones (user_id);
create index if not exists instalaciones_licencia_id_idx on public.instalaciones (licencia_id);
create unique index if not exists instalaciones_uid_key on public.instalaciones (uid) where uid is not null;
create index if not exists uso_instalaciones_instalacion_idx on public.uso_instalaciones (instalacion_id, fecha desc);
create index if not exists uso_instalaciones_user_id_idx on public.uso_instalaciones (user_id);
create index if not exists dominios_user_id_idx on public.dominios (user_id);
create index if not exists cli_tokens_user_id_idx on public.cli_tokens (user_id);
create index if not exists device_codes_code_idx on public.device_codes (code);
create index if not exists pagos_user_id_idx on public.pagos (user_id);


-- ── updated_at ──────────────────────────────────────────────────────────────
create trigger profiles_updated_at before update on public.profiles
  for each row execute function system.update_updated_at();
create trigger licencias_updated_at before update on public.licencias
  for each row execute function system.update_updated_at();
create trigger instalaciones_updated_at before update on public.instalaciones
  for each row execute function system.update_updated_at();
create trigger dominios_updated_at before update on public.dominios
  for each row execute function system.update_updated_at();


-- ── helpers ─────────────────────────────────────────────────────────────────
-- ¿El usuario actual es super admin? SECURITY DEFINER: no reentra en RLS.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

-- Crea (o completa) el perfil del usuario autenticado. La app lo llama al entrar
-- para no depender de un trigger sobre el esquema `auth` (gestionado).
create or replace function public.ensure_profile(p_email text default null, p_name text default null)
returns public.profiles
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  prof public.profiles;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.profiles (id, email, display_name)
  values (uid, p_email, p_name)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        display_name = coalesce(excluded.display_name, public.profiles.display_name)
  returning * into prof;
  return prof;
end;
$$;

-- El rol no se puede cambiar por UPDATE normal: solo un admin lo mueve.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'no autorizado a cambiar el rol';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation before update on public.profiles
  for each row execute function public.prevent_role_escalation();


-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.licencias enable row level security;
alter table public.instalaciones enable row level security;
alter table public.uso_instalaciones enable row level security;
alter table public.modulos_catalogo enable row level security;
alter table public.dominios enable row level security;
alter table public.device_codes enable row level security;
alter table public.cli_tokens enable row level security;
alter table public.pagos enable row level security;

-- profiles: ve/edita el suyo; el admin ve y edita todos.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());

-- licencias: el cliente ve las suyas; solo el admin escribe.
create policy licencias_select on public.licencias
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy licencias_admin_write on public.licencias
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- instalaciones: el cliente ve las suyas; solo el admin escribe.
create policy instalaciones_select on public.instalaciones
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy instalaciones_admin_write on public.instalaciones
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- uso_instalaciones: el cliente ve el suyo; solo el admin escribe.
create policy uso_select on public.uso_instalaciones
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy uso_admin_write on public.uso_instalaciones
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- modulos_catalogo: lo lee cualquier autenticado; solo el admin lo edita.
create policy modulos_select on public.modulos_catalogo
  for select to authenticated
  using (true);
create policy modulos_admin_write on public.modulos_catalogo
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- dominios: el cliente ve/crea los suyos; el admin todo.
create policy dominios_select on public.dominios
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy dominios_insert on public.dominios
  for insert to authenticated
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy dominios_admin_update on public.dominios
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy dominios_admin_delete on public.dominios
  for delete to authenticated
  using (public.is_admin());

-- cli_tokens: el usuario ve y revoca sus sesiones del CLI.
create policy cli_tokens_select on public.cli_tokens
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy cli_tokens_delete on public.cli_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- pagos: el cliente ve los suyos; el admin todo.
create policy pagos_select on public.pagos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy pagos_admin_write on public.pagos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- device_codes: sin políticas → solo las edge functions (service role) lo tocan.


-- ── grants ──────────────────────────────────────────────────────────────────
-- Revocamos el DML amplio por defecto y concedemos exactamente lo que cada rol
-- necesita; las políticas deciden las filas.
revoke all on public.profiles, public.licencias, public.instalaciones,
  public.uso_instalaciones, public.modulos_catalogo, public.dominios,
  public.device_codes, public.cli_tokens, public.pagos from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.licencias to authenticated;
grant select, insert, update, delete on public.instalaciones to authenticated;
grant select, insert, update, delete on public.uso_instalaciones to authenticated;
grant select, insert, update, delete on public.modulos_catalogo to authenticated;
grant select, insert, update, delete on public.dominios to authenticated;
grant select, delete on public.cli_tokens to authenticated;
grant select, insert, update, delete on public.pagos to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.ensure_profile(text, text) to authenticated;


-- ── semilla: catálogo de módulos (espeja src/modules.ts) ─────────────────────
insert into public.modulos_catalogo (id, nombre, descripcion, tipo, tab, orden) values
  ('nightly_report', 'Reporte nocturno', 'Resumen del día en tu Telegram o correo cada noche: clientes, leads, ventas calientes y clientes molestos.', 'pago_unico', null, 10),
  ('analista', 'Analista IA', 'La IA califica cada conversación: sentimiento, resolución, calidad del bot, temas y ventas abiertas.', 'membresia', 'insights', 20),
  ('metricas', 'Métricas del negocio', 'Tablero de métricas y estadísticas de conversaciones y clientes.', 'membresia', 'stats', 30),
  ('costos', 'Costos de IA', 'Cuánto gasta el bot por cliente y por conversación, para controlar el presupuesto.', 'membresia', 'costs', 40),
  ('mejoras', 'Mejoras automáticas', 'El bot detecta huecos de conocimiento y propone mejoras para responder mejor.', 'membresia', 'mejoras', 50),
  ('campanas', 'Campañas', 'Envíos programados de seguimiento y promociones a tus contactos.', 'membresia', 'campanas', 60),
  ('blindaje', 'Blindaje anti-inventos', 'El bot verifica cada respuesta contra tu información real y jamás adivina: si no está seguro, te lo pasa.', 'membresia', null, 70),
  ('vigilante', 'Vigilante con IA', 'Cada conversación se revisa sola: si un cliente se enoja o una venta se cae, te llega el aviso.', 'membresia', null, 80),
  ('handoff_smart', 'Handoff que sí atina', 'El bot distingue cuándo pasarte el chat de verdad y lo entrega con contexto.', 'membresia', null, 90),
  ('cazador', 'Cazador de ventas', 'El bot le escribe solito al cliente que preguntó y se enfrió, en tu tono.', 'membresia', null, 100),
  ('oido_vista', 'Oído y vista', 'El bot escucha notas de voz y ve fotos, y responde al tiro.', 'membresia', null, 110),
  ('voz_marca', 'Voz de marca', 'El bot contesta en el tono del negocio en cada mensaje y canal.', 'membresia', null, 120),
  ('multiidioma', 'Multi-idioma', 'Detecta el idioma del cliente y responde en ese idioma.', 'membresia', null, 130),
  ('encuestas', 'Encuestas de satisfacción', 'Al cerrar cada conversación pregunta del 1 al 5 cómo le fue.', 'membresia', null, 140),
  ('reenganche', 'Reenganche', 'Si el Cazador escribió y el cliente no contesta, el bot insiste una vez más.', 'membresia', null, 150),
  ('resenas', 'Pide reseñas', 'Cuando el cliente queda contento, el bot le pide la reseña de Google.', 'membresia', null, 160),
  ('cobros', 'Cobros por WhatsApp', 'En cuanto el cliente dice que sí, el bot le manda tu link de pago seguro.', 'membresia', null, 170),
  ('galeria', 'Galería', 'El bot manda fotos, videos y audios desde tu biblioteca de recursos.', 'membresia', null, 180),
  ('auditoria', 'Registro de auditoría', 'Ventana de solo lectura con cada acción del panel: quién, cuándo y qué cambió.', 'membresia', 'auditoria', 190),
  ('web_sync', 'Sincronizar sitio web', 'El bot lee páginas de tu sitio y responde con esa información, actualizada cada noche.', 'membresia', null, 200)
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  tipo = excluded.tipo,
  tab = excluded.tab,
  orden = excluded.orden;
