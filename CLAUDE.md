# Kooni — instrucciones para Claude Code

Este repo es **Kooni**, un chatbot de soporte con IA open source (MIT): un Worker de
Cloudflare (Hono + Vercel AI SDK + D1 + Vectorize +
R2) con panel de administración en `/admin`. Proyecto de **uso interno**. Quien lo clona
probablemente **no sabe programar** — tú corres todo por él.

Marca y estilo: consulta `docs/IDENTIDAD-KOONI.md` antes de tocar cualquier texto visible
(paleta teal/menta sobre tinta, logo con la K de nodo, voz en español sencillo LATAM).

## Instalación (si no existe `.bot-state.json`)

Sigue el skill **`/configurar-mi-chatbot`** (en `skill/`; si no está registrado, abre
el archivo directo). Son 4 fases y el orden no se negocia:

1. **TU PLATAFORMA** — provisiona Cloudflare (D1/Vectorize/R2), guarda la API key del
   cerebro + `DASHBOARD_PASSWORD`, y despliega. Al terminar, su panel vive en
   `https://<worker>.workers.dev/admin`.
2. **TU CHATBOT** — negocio, tareas, idioma y base de conocimiento.
3. **TUS CONEXIONES** — canales uno por uno (Telegram, WhatsApp, Meta…) desde `/admin`.
4. **PRUEBA FINAL** — mensaje real + resumen sin badges rojos.

Antes de la Fase 1: verifica que existan **Node ≥18** y **pnpm** (`corepack enable pnpm`
si falta), y explícale al usuario cómo funciona y cuánto cuesta — vive en SU cuenta de
Cloudflare (~gratis, ~$5/mes con tráfico) y el cerebro es su propia llave de IA (~$1–2/mes).

> Nota: Kooni se despliega directo con `git`/`pnpm run deploy` — NO se usa el CLI
> (el CLI legacy de referencia apunta a servidores externos — no usar).

> **Subdominio workers.dev (error 10063):** Cloudflare lo exige para publicar (una
> sola vez por cuenta). El CLI `npx kooni-bot` (v0.2.14+) y los instaladores
> `scripts/kooni-init.sh|ps1` lo crean solos con tu sesión OAuth y reintentan. Si
> aparece "Invalid access token [code: 9109]", la sesión se invalidó → `wrangler
> login`. Detalle: `docs/DESPLIEGUE.md §2.1`.

> **Cambiar contraseñas / secrets** (panel, cerebro, canales): `npx wrangler secret
> put <NOMBRE>` dentro de la carpeta del bot (aplica al instante, sin redeploy).
> No se pueden leer de vuelta; lista completa por secret en `docs/DESPLIEGUE.md
> §4.1`. Cuando el dueño pida cambiar su contraseña, pídele que la escriba él y
> guárdala con `secret put` (nunca pegarla en el chat).

## Reglas

- **Habla en español sencillo (LATAM)**, una pregunta a la vez.
- **Nunca pegues tokens/keys en el chat** — siempre `wrangler secret put`.
- **No toques `member/`** más allá de lo que indican los skills (ahí viven los datos del
  negocio del usuario; se respetan en cada actualización).
- **Uso interno**: no agregues CTAs a servicios externos.
  ni vínculos de venta. El tier (free/pro) se controla con `BOT_TIER` en `wrangler.toml`.
- Package manager: **pnpm** — `pnpm dev`, `pnpm run deploy`, `pnpm typecheck`, `pnpm test`,
  `pnpm db:apply:remote`. Corre `pnpm test` antes de cualquier deploy si tocaste `src/`.

## Mapa rápido

- `src/index.ts` — webhooks de canales (Telegram, WhatsApp, Meta…).
- `src/agent.ts` — el Durable Object que piensa y responde (buffer + tools).
- `src/llm/provider.ts` — el cerebro (Anthropic / OpenAI / xAI, con llave propia).
- `src/admin/` — el panel (`/admin`): Resumen, Conversaciones, Conexiones, Config, KB, Costos.
- `src/tools/` — searchKb, handoffHuman, pauseBot, captureLead, scheduleAppointment, catalogQuery.
- `src/niches/` — el "niche pack" genérico (Starter). Personaliza tono/columnas del panel;
  para giros propios, agrega un pack nuevo aquí (ver `docs/ARQUITECTURA.md` § Nichos).
- `skill/` — asistentes para el usuario.

## Skills disponibles

- `/configurar-mi-chatbot` — instalación de cero (las 4 fases).
- `/reporte` — informe mensual de valor para el cliente.
- `/exportar` — exporta leads y conversaciones (CSV/JSON).
- `/actualizar-mi-bot` — trae la última versión del template conservando tu config.

## Documentación

- `docs/IDENTIDAD-KOONI.md` — marca (nombre, paleta, tipografía, logo, voz).
- `docs/ARQUITECTURA.md` — arquitectura completa del bot (canales, agente, DB, KB, cron).
- `docs/FLUJOS.md` — agentes, flujos dinámicos (DM) y automatizaciones; receta para replicar un bot.
- `docs/DESPLIEGUE.md` — despliegue paso a paso (recursos, secrets, canales).
- `docs/PRUEBA-LOCAL.md` — runbook local: arrancar y probar el bot en `wrangler dev`.
- `docs/PLANES.md` — tiers Free vs Pro y el camino al modelo de pago.
- `docs/USO.md` — el panel `/admin` y el día a día.
