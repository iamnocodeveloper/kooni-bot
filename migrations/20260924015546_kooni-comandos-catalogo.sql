-- Catálogo de comandos/skills que el CLI y el agente ofrecen (cheat sheet).
-- Es la fuente para el panel del cliente y para la distribución por el CLI.
create table if not exists public.comandos_catalogo (
  id text primary key,
  tipo text not null default 'agente' check (tipo in ('terminal', 'agente')),
  comando text not null,
  descripcion text,
  requiere_pro boolean not null default false,
  version text,
  activo boolean not null default true,
  orden int not null default 100
);

alter table public.comandos_catalogo enable row level security;

create policy comandos_select on public.comandos_catalogo
  for select to authenticated
  using (activo or public.is_admin());

create policy comandos_admin_write on public.comandos_catalogo
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.comandos_catalogo from anon, authenticated;
grant select, insert, update, delete on public.comandos_catalogo to authenticated;

insert into public.comandos_catalogo (id, tipo, comando, descripcion, requiere_pro, orden) values
  ('c-init', 'terminal', 'npx kooni-bot init', 'Instala: descarga el template, configura el bot y despliega.', false, 10),
  ('c-list', 'terminal', 'npx kooni-bot list', 'Lista los giros (nichos) disponibles.', false, 20),
  ('c-install', 'terminal', 'npx kooni-bot install <giro>', 'Instala el bot de un giro (ej. restaurante).', true, 30),
  ('c-login', 'terminal', 'npx kooni-bot login', 'Conecta el CLI a tu cuenta Kooni (abre el navegador).', false, 40),
  ('c-whoami', 'terminal', 'npx kooni-bot whoami', 'Muestra con qué cuenta estás conectado.', false, 50),
  ('c-pair', 'terminal', 'npx kooni-bot pair', 'Vincula un bot ya desplegado a tu cuenta.', false, 60),
  ('c-update', 'terminal', 'npx kooni-bot update', 'Actualiza tu bot sin perder tu config ni tus datos.', false, 70),
  ('c-deploy', 'terminal', 'npx kooni-bot deploy', 'Provisiona Cloudflare y publica el worker.', false, 80),
  ('c-doctor', 'terminal', 'npx kooni-bot doctor', 'Diagnóstico del bot instalado.', false, 90),
  ('a-configurar', 'agente', '/configurar-mi-chatbot', 'Setup inicial completo (negocio, canales, deploy).', false, 110),
  ('a-reporte', 'agente', '/reporte', 'Informe de valor de lo que hizo tu bot.', true, 120),
  ('a-exportar', 'agente', '/exportar', 'Exporta tus datos (leads, conversaciones).', true, 130),
  ('a-actualizar', 'agente', '/actualizar-mi-bot', 'Actualiza el bot a la última versión.', false, 140),
  ('a-prompt', 'agente', '/prompt', 'Ve y editá tu prompt por secciones.', true, 150),
  ('a-limpiar', 'agente', '/limpiar-prompt', 'Desinfla un prompt largo (mueve datos a la KB, quita duplicados).', true, 160),
  ('a-versionar', 'agente', '/versionar-prompt', 'Historial del prompt: guardá versiones y volvé a cualquiera.', true, 170),
  ('a-lab', 'agente', '/lab-prompt', 'A/B del prompt: variantes + conversaciones simuladas.', true, 180),
  ('a-canal', 'agente', '/prompt-por-canal', 'Una personalidad por canal (WhatsApp, Instagram…).', true, 190),
  ('a-auditar', 'agente', '/auditar-prompt', 'Califica tu prompt contra las buenas prácticas.', true, 200),
  ('a-ejemplos', 'agente', '/ejemplos-prompt', 'Convierte tus mejores chats en ejemplos (few-shot).', true, 210)
on conflict (id) do nothing;
