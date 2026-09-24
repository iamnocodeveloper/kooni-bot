-- Catálogo de proveedores de IA (el panel del bot los ofrece como "cerebro").
-- `incluido` = es el cerebro incluido en la plataforma; si no, es BYO-LLM.
create table if not exists public.ia_proveedores (
  id text primary key,
  nombre text not null,
  incluido boolean not null default false,
  activo boolean not null default true,
  modelos jsonb not null default '[]'::jsonb,
  orden int not null default 100
);

alter table public.ia_proveedores enable row level security;

create policy ia_prov_select on public.ia_proveedores
  for select to authenticated
  using (activo or public.is_admin());

create policy ia_prov_admin_write on public.ia_proveedores
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.ia_proveedores from anon, authenticated;
grant select, insert, update, delete on public.ia_proveedores to authenticated;

insert into public.ia_proveedores (id, nombre, incluido, activo, modelos, orden) values
  ('anthropic', 'Claude (Anthropic)', false, true,
   '["claude-haiku-4-5-20251001","claude-sonnet-4-5-20250929","claude-sonnet-4-6","claude-opus-4-6"]'::jsonb, 10),
  ('openai', 'ChatGPT (OpenAI)', false, true,
   '["gpt-4o-mini","gpt-4o","gpt-4.1-mini","gpt-4.1"]'::jsonb, 20),
  ('google', 'Gemini (Google)', false, true,
   '["gemini-2.5-flash-lite","gemini-2.5-flash","gemini-2.5-pro"]'::jsonb, 30),
  ('xai', 'Grok (xAI)', false, true,
   '["grok-4-fast-non-reasoning","grok-3-mini","grok-4"]'::jsonb, 40),
  ('minimax', 'MiniMax', false, true,
   '["abab6.5s-chat","MiniMax-Text-01"]'::jsonb, 50)
on conflict (id) do nothing;
