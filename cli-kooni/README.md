# kooni-bot

CLI para instalar y mantener **Kooni** — tu asistente de IA multicanal
(WhatsApp, Instagram, Messenger, Telegram) en **tu propia Cloudflare**, con
**tu** llave de IA.

```bash
npx kooni-bot init
```

El CLI descarga el template, te hace unas preguntas sobre tu negocio y despliega
tu bot en tu cuenta de Cloudflare. Al terminar tienes tu panel en
`https://<slug>.workers.dev/admin`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npx kooni-bot login` | Conecta el CLI a tu cuenta Kooni (abre el navegador y aprueba un código). |
| `npx kooni-bot init [dir]` | Instala: descarga el template, configura el bot y (opcional) despliega. |
| `npx kooni-bot deploy [dir]` | Provisiona Cloudflare (D1 + Vectorize + R2, secrets, migraciones) y publica el worker. |
| `npx kooni-bot update [dir]` | Trae la versión nueva **sin perder** tu configuración (`member/`), tu `wrangler.toml` ni tus datos. |
| `npx kooni-bot update --all` | Actualiza todas las instalaciones registradas en esta máquina. |
| `npx kooni-bot doctor [dir]` | Diagnóstico del bot instalado. |
| `npx kooni-bot version` | Versión del CLI. |

## Requisitos

- **Node ≥ 20** (usa `wrangler` 4, que requiere Node 20+).
- Una cuenta de **Cloudflare** (el bot vive ahí; la capa gratis alcanza para empezar).
- Una **llave de IA** propia (Anthropic / OpenAI / xAI / MiniMax o un gateway).

## Cómo funciona

1. `npx kooni-bot init` — descarga el template y te pregunta lo básico (negocio, idioma, cerebro).
2. `npx kooni-bot deploy` — hace login en Cloudflare, crea los recursos, guarda los secrets y despliega.
3. Abre tu panel `/admin` y conecta tus canales (Telegram, WhatsApp, Meta…) desde **Conexiones**.
4. `npx kooni-bot update` cuando salga una versión nueva.

Cada instalación tiene un `uid` propio (worker, D1 y Vectorize namespaced), así
puedes tener varios bots en la misma cuenta sin que compartan datos.

## Licencia

MIT — ver [LICENSE](./LICENSE). El nombre "Kooni", el logo y los packs de
conocimiento comerciales se distribuyen aparte.

Repo: <https://github.com/iamnocodeveloper/kooni-bot>
