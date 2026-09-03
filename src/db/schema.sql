-- Conversations: one row per (channel, channel_user_id) customer
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  channel_user_id TEXT NOT NULL,
  display_name TEXT,
  started_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  paused_until INTEGER,
  open_ticket_id TEXT,
  metadata TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_unique ON conversations(channel, channel_user_id);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON conversations(last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_input_tokens INTEGER,
  audio_seconds REAL,
  image_count INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  name TEXT,
  contact TEXT,
  channel_user_id TEXT,
  intent TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'new',
  exported_to TEXT,
  external_id TEXT,
  -- JSON con campos propios del nicho (reservacion con fecha/hora/personas, o
  -- comprador con presupuesto/zona/operacion). El dashboard del nicho lee de aqui.
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  category TEXT,
  summary TEXT NOT NULL,
  transcript TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  resolved_at INTEGER,
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS admin_emails (
  email TEXT PRIMARY KEY,
  role TEXT DEFAULT 'owner',
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_links(email);
CREATE INDEX IF NOT EXISTS idx_magic_expires ON magic_links(expires_at);

-- Settings: key/value overlay edited from the dashboard. Empty/absent => default.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- AI-generated quality analysis: one row per conversation, written by the
-- insights analyzer (Haiku) once the conversation goes idle. Re-analyzed if
-- the customer comes back (analyzed_at < last_message_at).
-- sentiment: positive | neutral | frustrated | angry
-- resolution: resolved | unresolved | escalated | abandoned
-- bot_score: 1-5 quality of the bot's replies · topics: JSON array (es)
-- summary: 1-2 sentences (es) · missed_kb: question the KB couldn't answer
-- sale_opportunity: 1 = open sale left on the table
CREATE TABLE IF NOT EXISTS conversation_insights (
  conversation_id TEXT PRIMARY KEY,
  analyzed_at INTEGER NOT NULL,
  sentiment TEXT,
  resolution TEXT,
  bot_score INTEGER,
  topics TEXT,
  summary TEXT,
  missed_kb TEXT,
  sale_opportunity INTEGER DEFAULT 0,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_insights_analyzed ON conversation_insights(analyzed_at);

-- Knowledge-base documents editable from the dashboard. Indexed into Vectorize
-- on save (chunked). The repo kb-fixtures.json remains a separate source.
-- NOTE: never put semicolons inside schema comments (the test helper splits on them).
CREATE TABLE IF NOT EXISTS kb_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Flywheel (F5) - every proposed self-improvement is a reviewable row.
-- kind: kb_entry | leccion. fingerprint dedupes across any status so a
-- dismissed suggestion is never re-proposed.
CREATE TABLE IF NOT EXISTS improvement_suggestions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  evidence TEXT,
  status TEXT DEFAULT 'proposed',
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sugg_status ON improvement_suggestions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sugg_fp ON improvement_suggestions(kind, fingerprint);

-- Follow-up bot - one row per conversation that ever received a follow-up.
-- The PRIMARY KEY doubles as the send claim (INSERT OR IGNORE) so a
-- conversation can never get more than one follow-up, ever.
CREATE TABLE IF NOT EXISTS followup_sends (
  conversation_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);

-- Reenganche (Kooni+): SEGUNDO toque del Cazador. followup_sends tiene PK por
-- conversación (un solo toque de por vida), así que el segundo toque vive en su
-- propia tabla: solo conversaciones que ya recibieron follow-up y siguen frías.
CREATE TABLE IF NOT EXISTS reengagement_sends (
  conversation_id TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL
);

-- Per-customer memory extracted by the insights analyzer. Injected into the
-- system context when the same customer writes again.
CREATE TABLE IF NOT EXISTS customer_facts (
  conversation_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  learned_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, fact)
);

-- Links de trackeo por conversación (código destino, con contador de clicks).
-- Un código por conversación y destino, alimenta la segmentación de campañas.
CREATE TABLE IF NOT EXISTS tracked_links (
  code TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  target TEXT NOT NULL,
  target_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  last_click_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tracked_links_conv ON tracked_links(conversation_id);

-- Hits de keywords (QUIERO / RECURSOS) — alimenta la segmentación de campañas
CREATE TABLE IF NOT EXISTS keyword_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_keyword_hits_kw ON keyword_hits(keyword);

-- Etiquetas por conversación (interés + objeción) para la segmentación de campañas.
-- La tabla se conserva para el módulo de campañas/segmentos.
CREATE TABLE IF NOT EXISTS conv_labels (
  conversation_id TEXT PRIMARY KEY,
  variant TEXT,
  interest TEXT,
  objection TEXT,
  summary TEXT,
  labeled_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_labels_interest ON conv_labels(interest);

-- Envíos de campañas (free-form dentro de ventana / plantilla HSM fuera)
-- El UNIQUE es el candado anti-doble-envío por campaña
CREATE TABLE IF NOT EXISTS template_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_key TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  template_sid TEXT,
  sent_at INTEGER NOT NULL,
  UNIQUE (campaign_key, conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_template_sends_time ON template_sends(sent_at);

-- Flujos de automatización (Zernio y multicanal): reglas keyword → respuesta.
-- Editables desde el panel /admin/flujos. Se aplican ANTES de la IA: si un
-- comentario o DM matchea una regla activa, la regla gana (respuesta automática
-- con DM, respuesta pública, o ambas) y el mensaje no entra al agente.
-- kind: comment_dm | comment_reply | dm_reply
-- platform: all | instagram | facebook
-- keywords: JSON array (case-insensitive)
CREATE TABLE IF NOT EXISTS auto_rules (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all',
  keywords TEXT NOT NULL,
  message TEXT NOT NULL,
  button_label TEXT,
  button_url TEXT,
  reply_to_comment TEXT,
  ai_reply_prompt TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  whole_word_match INTEGER NOT NULL DEFAULT 1,
  require_follow INTEGER NOT NULL DEFAULT 0,
  follow_prompt_message TEXT,
  follow_button_label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auto_rules_active ON auto_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_auto_rules_kind ON auto_rules(kind);

-- Links trackeados de AUTOMATIZACIONES (port OpenReply): cada link de un DM
-- automático se sirve vía /r/:slug → 302 al destino + registra el click.
-- (Nombre auto_rule_* para no chocar con la tabla tracked_links del módulo de
-- ofertas/campañas, que tiene otra estructura y se usa en segments.ts.)
CREATE TABLE IF NOT EXISTS auto_rule_links (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auto_rule_links_rule ON auto_rule_links(rule_id);

CREATE TABLE IF NOT EXISTS auto_rule_clicks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  ip_hash TEXT,
  clicked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auto_rule_clicks_slug ON auto_rule_clicks(slug);

-- Follow gate pendiente: al enviar el DM "Sígueme" con botón postback, Zernio NO
-- reenvía el payload del botón al presionarlo (manda solo la ETIQUETA + prefijo
-- "postback_" en platformMessageId). Guardamos aquí el estado para poder
-- completar la entrega del link cuando el usuario toca "Ya te sigo".
CREATE TABLE IF NOT EXISTS follow_gate_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  commenter_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  comment_id TEXT,
  post_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fg_pending ON follow_gate_pending(account_id, commenter_id);

-- Dedup por huella de comentario (post + autor + texto normalizado). Zernio a
-- veces reentrega el MISMO comentario con un comment.id distinto, y la huella
-- es estable entre entregas. El claim atómico (PK dedup_key, INSERT OR IGNORE)
-- garantiza UNA única respuesta por comentario real. Ver src/db/fingerprints.ts.
CREATE TABLE IF NOT EXISTS comment_fingerprints (
  dedup_key TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comment_fingerprints_time ON comment_fingerprints(created_at);

-- Dedup de comentarios (port OpenReply): Meta permite UNA sola private reply
-- por comentario, para siempre, a través de TODAS las reglas. Antes de enviar
-- un DM se chequea si el comment_id ya recibió uno. Se registra el resultado.
-- status: sent | skipped_dedup | failed
CREATE TABLE IF NOT EXISTS processed_comments (
  comment_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  status TEXT NOT NULL,
  matched_keyword TEXT,
  dm_sent_at INTEGER,
  public_reply_sent_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);

-- Logs de automatizaciones (historial en el panel): cada intento de DM /
-- respuesta pública, con estado y motivo. Alimenta /admin/automatizaciones.
-- kind: comment_dm | comment_reply | dm_reply
-- target: comment_id o conversation_id
-- status: sent | skipped | failed
CREATE TABLE IF NOT EXISTS dm_logs (
  id TEXT PRIMARY KEY,
  rule_id TEXT,
  kind TEXT NOT NULL,
  platform TEXT,
  target TEXT,
  username TEXT,
  message TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dm_logs_rule ON dm_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_dm_logs_time ON dm_logs(created_at);

-- Rate limit de DM por cuenta (port OpenReply): Meta permite ~750 private
-- replies por hora por cuenta. Reservamos slots con tope configurable
-- (default 700, margen de seguridad) usando una ventana de 1 hora en D1.
-- Sin Redis: el PK compuesto (account_id, window_start) da el contador por hora
-- y el upsert incrementa atómicamente en D1.
-- window_start: epoch_ms de la hora actual (floor a 1h)
CREATE TABLE IF NOT EXISTS dm_rate_limits (
  account_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, window_start)
);

-- Rate-limit del login del panel (§O / hallazgo S5): intentos FALLIDOS de
-- POST /admin/login por IP en ventanas de 15 min. Al pasar el tope se rechaza
-- sin comprobar la contraseña. Un login correcto borra la fila de esa IP.
-- ip_hash: SHA-256 de la IP (nunca se guarda la IP en claro).
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, window_start)
);

-- Comentarios recibidos (igual que la pestaña "Comentarios" de Zernio).
-- Se guarda CADA comment.received: texto, autor, post, y qué hizo la
-- automatización (DM enviado, respuesta pública enviada).
-- id: commentId de Zernio (único) · rule_id: regla que disparó (si matcheó)
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT,
  platform_post_id TEXT,
  text TEXT,
  author_username TEXT,
  author_name TEXT,
  author_id TEXT,
  platform TEXT DEFAULT 'instagram',
  account_id TEXT,
  rule_id TEXT,
  dm_sent INTEGER NOT NULL DEFAULT 0,
  public_reply_sent INTEGER NOT NULL DEFAULT 0,
  public_reply_text TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_platform ON comments(platform);
CREATE INDEX IF NOT EXISTS idx_comments_dm ON comments(dm_sent);

-- Contactos: TODOS los que interactúan (DM o comentario), separados de Leads.
-- Un contacto se crea la primera vez que alguien escribe o comenta. El lead es
-- el contacto calificado (captura de intención). Un contacto puede tener 0..1 lead.
-- channel: telegram | zernio | whatsapp | ... · channel_user_id: id del usuario
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  channel_user_id TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  last_interaction_at INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  interaction_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (channel, channel_user_id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_last ON contacts(last_interaction_at);

-- PWA: suscripciones push de los dispositivos del dueno (panel instalado como
-- app). endpoint es unico por navegador y dispositivo. p256dh y auth son las
-- claves del cliente en base64url que devuelve pushManager.subscribe
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER
);

-- PWA: cola de avisos. El push que se manda NO lleva cuerpo (evita la cifra de
-- RFC 8291) y el service worker, al recibirlo, pide /admin/push/latest y muestra
-- el mas reciente. shown se marca cuando el SW lo consumio.
CREATE TABLE IF NOT EXISTS push_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/admin/overview',
  created_at INTEGER NOT NULL,
  shown INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_events_created ON push_events(created_at);
