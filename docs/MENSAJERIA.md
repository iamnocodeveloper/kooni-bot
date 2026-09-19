# Mensajería y conversaciones — ciclo de vida

Cómo entra un mensaje, dónde se guarda y cuándo responde el bot. Esta guía
existe por un bug real: **una conversación aparecía en el panel pero sin ningún
mensaje (ni recibidos ni enviados) y el bot no respondía**. Acá queda documentado
el contrato que lo evita.

## La regla de oro: guardar ≠ responder

> El mensaje del cliente se guarda SIEMPRE. La pausa apaga la **respuesta**,
> nunca el **registro**.

Antes, `ingest()` creaba la fila de la conversación (`ConversationsRepo.getOrCreate`)
y recién guardaba el mensaje mucho después, dentro de `processBuffer()` —que corre
cuando dispara la alarma del buffer—. Cualquier salida temprana entre esos dos
puntos (pausa de canal, bot pausado, takeover, spam, tope diario) dejaba la
conversación **creada pero vacía**.

Hoy `ingest()` llama a `SupportAgent.persistInbound()` **antes** de cualquier
decisión de responder (`src/agent.ts`). `processBuffer()` ya NO vuelve a guardar
el entrante (evita el duplicado): el hilo del LLM se arma directo desde la DB.

## Pipeline

```
Webhook (src/index.ts)
  → adapter.parseIncoming / parseXEvents   (normaliza a IncomingMessage)
  → Durable Object por (canal + usuario):   env.AGENT.idFromName(`${channel}:${channelUserId}`)
  → SupportAgent.ingest()                  buffers + persiste el entrante + arma alarma
  → SupportAgent.processBuffer()           corre el LLM y responde
  → adapter.sendReply()                    entrega por el canal
```

- **Persistencia**: D1 — `conversations` (una por `channel + channel_user_id`) y
  `messages` (roles `user | assistant | owner | tool`). Ver `src/db/schema.sql`.
- **Buffer**: `ingest` agrupa ráfagas con `BUFFER_SECONDS` y arma una alarma
  (`cf_agents_schedules` 'msg-buffer'). La alarma dispara `processBuffer`.
- **Idempotencia del hilo**: el `conversation_id` es determinístico
  (`<canal>:<usuario>`), así que el mismo contacto siempre cae en el mismo hilo.

## Matriz de estados (qué se guarda y qué se responde)

| Estado | Mensaje guardado | ¿Responde el bot? | ¿Alarma armada? |
|---|---|---|---|
| Normal | Sí | Sí | Sí |
| Canal pausado (`paused_channels`) | **Sí** | No | No |
| Bot pausado (`bot_paused=1`) | **Sí** | No | No |
| Conversación pausada (takeover / `paused_until`) | **Sí** | No | No |
| Spam (3ª repetición en 5) | **Sí** | No (cooldown 1 h) | No |
| Tope diario (50 turnos/24 h) | **Sí** + despedida | Despedida 1 vez, luego 12 h | No |
| Límite de plan free | **Sí** + aviso de límite | Aviso 1 vez | No |
| Comentario de post (Zernio) | No entra al agente (va a `comments`/DM) | Auto-DM | — |
| Eco del dueño (`ownerEcho`) | Sí (rol `owner`) | No (pausa 1 h) | No |

Regla: **"guardado" es incondicional; "responde" y "alarma" dependen del estado.**

## Canales

Cada canal tiene su ruta de webhook y su adaptador. `ChannelId` en
`src/channels/shared.ts`.

| Canal | Entrada | Adaptador |
|---|---|---|
| Telegram | `POST /webhooks/telegram` | `src/channels/telegram.ts` |
| ManyChat (IG/FB/WA) | `POST /webhooks/manychat` | `src/channels/manychat.ts` |
| Twilio (WhatsApp) | `POST /webhooks/twilio` | `src/channels/twilio.ts` |
| Meta oficial (Messenger + IG DMs) | `POST /webhooks/meta` | `src/channels/meta.ts` |
| WhatsApp Cloud API | `POST /webhooks/whatsapp` | `src/channels/whatsapp.ts` |
| **Zernio** (multicanal) | `POST /webhooks/zernio` | `src/channels/zernio.ts` |
| **WAHA** (WhatsApp self-hosted) | `POST /webhooks/waha` | `src/channels/waha.ts` |
| MercadoLibre | `POST /webhooks/mercadolibre` | `src/channels/mercadolibre.ts` |

**Ojo con Instagram:** si el DM de IG entra por **Zernio**, el canal de la
conversación es `zernio`, no `instagram`. Filtrar la bandeja por "instagram"
oculta esas conversaciones. Hay además dos banderas que descartan IG **antes** de
crear la conversación (por eso, en esos casos, no aparece nada):

- `IG_OFFICIAL="off"` → el webhook `/webhooks/meta` ignora todo lo de Instagram.
- `IG_DM_SOURCE="manychat"` → el webhook oficial ignora los DMs de IG (entran
  solo por ManyChat) para no procesarlos dos veces.

## Entrega (salida)

- Los envíos usan `fetch` con **timeout** (`AbortSignal.timeout(15_000)`) en
  Zernio, WAHA y Meta: un proveedor colgado no puede bloquear el Durable Object
  (y con él, toda la conversación).
- Una entrega fallida **no borra** la respuesta: el mensaje del bot ya quedó
  persistido como `assistant` antes de enviarse. El error queda en el log con el
  cuerpo del proveedor (`wrangler tail`).
- WAHA envía media con `sendFile` en modo best-effort: si el adjunto falla, el
  texto igual sale (el error se loguea, no se pierde en silencio).

## Diagnóstico rápido

1. ¿Aparece la conversación pero sin mensajes? Revisá el badge ⏸ en la bandeja
   (conversación pausada) y `/admin/agente` (bot pausado) + `/admin/conexiones`
   (canales pausados). Con el arreglo actual, el entrante igual queda guardado.
2. ¿No aparece NINGUNA conversación? El webhook no llegó o el canal está
   descartando antes de `ingest` (firma inválida, `IG_OFFICIAL`/`IG_DM_SOURCE`,
   o un filtro del parser que exige texto/media).
3. Confirmá si el webhook entra con `wrangler tail` y buscá:
   `meta in:`, `[zernio] msg in:`, `[ingest] alarm was not armed`.
4. Si la alarma de Cloudflare no dispara, el entrante queda guardado igual y el
   bot lo procesa cuando el cliente vuelva a escribir (rescate de mensaje
   "stranded" en `ingest`).

## Referencias en código

- `src/agent.ts` — `ingest()`, `persistInbound()`, `processBuffer()`, `recordOwnerEcho()`.
- `src/db/conversations.ts`, `src/db/messages.ts` — repos de persistencia.
- `src/spam.ts` — cooldown por repetición y tope diario.
- `src/replies/sender.ts` — `pickAdapter` (envío por canal).
- `test/agent.media.test.ts` — regresión: "el mensaje del cliente NUNCA se pierde".
