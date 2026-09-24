-- Soporte: FAQ editable (la ve el cliente) + bandeja de mensajes (duda/bug).
create table if not exists public.faq (
  id text primary key,
  pregunta text not null,
  respuesta text not null,
  orden int not null default 100,
  activo boolean not null default true
);

create table if not exists public.soporte_mensajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  asunto text not null,
  mensaje text not null,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'leido', 'respondido')),
  created_at timestamptz not null default now()
);

create index if not exists soporte_mensajes_created_idx on public.soporte_mensajes (created_at desc);

alter table public.faq enable row level security;
alter table public.soporte_mensajes enable row level security;

-- FAQ: cualquiera autenticado la lee (las activas); solo admin la edita.
create policy faq_select on public.faq
  for select to authenticated
  using (activo or public.is_admin());
create policy faq_admin_write on public.faq
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Mensajes: el usuario crea el suyo y ve los suyos; el admin ve y edita todos.
create policy soporte_insert on public.soporte_mensajes
  for insert to authenticated
  with check (user_id = (select auth.uid()) or user_id is null);
create policy soporte_select on public.soporte_mensajes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy soporte_admin_update on public.soporte_mensajes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.faq, public.soporte_mensajes from anon, authenticated;
grant select, insert, update, delete on public.faq to authenticated;
grant select, insert, update, delete on public.soporte_mensajes to authenticated;

insert into public.faq (id, pregunta, respuesta, orden) values
  ('f-que', '¿Qué es Kooni y qué me da exactamente?', 'Un asistente de IA multicanal (WhatsApp, Instagram, Messenger, Telegram) que vive en TU Cloudflare, con tu llave de IA. Atiende 24/7, responde con tu información y te avisa cuando algo importa.', 10),
  ('f-instalar', '¿Cómo instalo mi bot? ¿Es gratis para empezar?', 'Corré `npx kooni-bot init` y seguí los pasos. Sí: Cloudflare tiene capa gratis y vos pagás solo tu llave de IA (~$1–2/mes).', 20),
  ('f-tokens', '¿Mi bot gasta tokens de Claude Code cada vez que contesta?', 'No. El bot usa tu llave de IA (Claude/ChatGPT/Gemini/Grok), no Claude Code.', 30),
  ('f-datos', '¿Dónde viven mis datos (y los de mis clientes)?', 'En TU cuenta de Cloudflare (D1/Vectorize/R2). Nadie más los ve; el bot no comparte datos de personas.', 40),
  ('f-actualizar', '¿Cómo actualizo mi bot a la última versión?', '`npx kooni-bot update` (o `update --all`). Conserva tu configuración y tus datos.', 50),
  ('f-info', '¿Cómo cambio precios, horario o la info que da el bot?', 'Desde el panel → Configuración y Conocimiento. O decile a tu agente `/afinar-prompt`.', 60),
  ('f-revender', '¿Puedo revender bots a mis clientes?', 'Sí: mirá Plantillas y el modo agencia en tu panel.', 70),
  ('f-bug', 'Encontré un bug — ¿qué hago?', 'Mandanos el detalle con el formulario de Soporte (o reportalo a tu proveedor).', 80)
on conflict (id) do nothing;
