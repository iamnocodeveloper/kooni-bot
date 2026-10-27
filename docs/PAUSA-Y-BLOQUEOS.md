# Pausa y contactos bloqueados

Kooni puede **callarse** para un contacto de tres formas distintas. No son lo
mismo y conviene elegir la correcta.

| Estado | Dónde se activa | Duración | ¿Cubre envíos proactivos? |
|---|---|---|---|
| **Pausa temporal** | Hilo → “Pausar bot aquí” | 1 hora (`TAKEOVER_MS`) | No: solo frena la respuesta al entrante |
| **Pausa hasta reactivar** | Hilo → “Pausar hasta reactivar” | Indefinida hasta “Devolver bot” | Parcial: los seguimientos ya respetan `paused_until`; campañas/disparadores no |
| **Contacto bloqueado** | Hilo → “Bloquear contacto” o `/admin/blocked` | Hasta desbloquear | **Sí: silencio total** |

> Regla de oro: **guardar ≠ responder**. El mensaje del cliente se guarda siempre
> para que el hilo del panel quede completo; la pausa/bloqueo apaga la respuesta,
> nunca el registro.

---

## 1. Pausa por conversación

- Se guarda en `conversations.paused_until` (epoch ms).
- “Pausar bot aquí” escribe `ahora + 1 h`.
- “Pausar hasta reactivar” escribe `PAUSE_INDEFINITE` (año 2100). No hay columna
  nueva: todos los `paused_until > now` existentes siguen funcionando.
- “Devolver bot” limpia el valor (`NULL`) y, si escribís una nota, la guarda como
  mensaje `owner` para que el bot retome con contexto.
- El bot deja de responder en `ingest` y también se re-chequea en
  `processBuffer` (si pausaron entre el entrante y la alarma, el buffer se
  descarta y no se gasta LLM).

**Uso típico:** el dueño quiere atender personalmente un rato, pero quiere que el
bot vuelva solo. Para que no vuelva nunca hasta que lo decidas, usá “Pausar
hasta reactivar”.

---

## 2. Contactos bloqueados (silencio total)

Tabla nueva **`contact_blocks`** (`src/db/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS contact_blocks (
  channel TEXT NOT NULL,
  channel_user_id TEXT NOT NULL,
  display_name TEXT,
  reason TEXT,
  created_by TEXT NOT NULL DEFAULT 'panel',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (channel, channel_user_id)
);
```

- Clave por **canal + identificador** (igual que `contacts`/`conversations`).
- Un contacto bloqueado **no recibe nada**: ni respuestas, ni seguimientos
  (`followup/*`), ni campañas (`segments.ts`/`campaigns.ts`), ni disparadores
  (`triggers/engine.ts`), ni recordatorios de cobranza
  (`collections/engine.ts`).
- El bloqueo **no borra** el contacto ni el historial. El mensaje entrante se
  registra, pero no se manda acuse de lectura ni se arma alarma.
- Se puede bloquear desde:
  - el hilo (`/admin/conversations?c=…` → “Bloquear contacto”);
  - la página **Contactos bloqueados** (`/admin/blocked`), eligiendo un contacto
    existente o pegando el identificador exacto del canal.
- Se desbloquea desde el mismo hilo o desde `/admin/blocked`.

> El bloqueo es **por canal**: la misma persona en otro canal no queda bloqueada
> automáticamente. Es intencional: los IDs de WhatsApp, Instagram y Telegram no
> son comparables entre sí.

**Auditoría:** cada alta/baja deja `conversation.block` / `conversation.unblock`
en `audit_log` (target `contact:<canal>:<id>` o `conv:<id>`).

---

## 3. El dueño responde desde fuera

Cuando el negocio responde **desde la app nativa** (no desde el panel), el bot
debe enterarse y callarse. La pausa es **indefinida hasta “Devolver bot”**.

| Canal | Cómo se detecta | Estado |
|---|---|---|
| **Meta** (Messenger / IG DM) | `message.is_echo` | ✅ |
| **Zernio** (multicanal) | `direction === "outgoing"` | ✅ |
| **WAHA** (WhatsApp self-hosted) | `payload.fromMe === true` | ✅ (v1.63.0) |
| **WhatsApp Cloud API** | `message_echoes` / `smb_message_echoes` | ✅ (v1.63.0) |
| **Panel** `/admin/conversations` | al enviar como humano | ✅ (pausa indefinida) |
| Telegram | chat del dueño ≠ conversación del cliente | No aplica |
| ManyChat / Twilio / MercadoLibre | el webhook solo trae entrantes | ❌ limitación del canal |

Detalles:

- `recordOwnerEcho` guarda el mensaje como rol **`owner`** (para que el CRM muestre
  la conversación completa), actualiza `last_message_at` y pausa.
- Ecos de **solo media** (foto/audio/sticker) se guardan como `[imagen]`/`[audio]`
  y también pausan.
- **Anti-duplicado:** si un mensaje idéntico ya está como `assistant`/`owner` de
  hace <3 minutos, se ignora. Eso evita que el propio eco del bot (por ejemplo,
  lo que WAHA reenvía de un `sendText`) pause la conversación.
- Si el contacto está **bloqueado**, se registra el mensaje del dueño pero no se
  toca la pausa: manda el bloqueo.

> **ManyChat:** si los DMs de Instagram entran solo por ManyChat, una respuesta
> desde la app de Instagram no produce webhook y el bot no puede enterarse. Es
> una limitación de la plataforma, no del bot.

---

## 4. Diagnóstico rápido (D1)

```sql
-- ¿Está bloqueado?
SELECT * FROM contact_blocks WHERE channel = 'waha' AND channel_user_id = '591…@c.us';

-- ¿Está pausada?
SELECT id, paused_until, datetime(paused_until/1000, 'unixepoch')
FROM conversations WHERE id = 'waha:591…@c.us';

-- Últimos bloqueos
SELECT channel, channel_user_id, reason, created_at
FROM contact_blocks ORDER BY created_at DESC LIMIT 20;
```

En los logs del Worker:

- `[ingest] contacto bloqueado (…) — mensaje registrado sin respuesta`
- `[processBuffer] conversación silenciada (bloqueada|pausada) — buffer descartado`
- `[recordOwnerEcho] respuesta manual registrada + bot pausado hasta reactivar`

---

## 5. Límites conocidos

- La pausa indefinida usa un timestamp lejano (`4102444800000`) para no migrar el
  esquema. El panel la muestra como “pausado”, no como fecha.
- Las campañas y disparadores ya no envían a bloqueados; los seguimientos y la
  cobranza los excluyen en SQL. Si agregás un canal nuevo de envío proactivo,
  usá `isContactBlocked` de `src/silence.ts`.
- Bloquear no cancela un mensaje ya encolado en el proveedor; el corte aplica a
  los siguientes envíos.
