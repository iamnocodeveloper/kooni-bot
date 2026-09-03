# MercadoLibre — conexión paso a paso (preguntas + post-venta)

> **¿Qué hace?** La IA responde automáticamente:
> - las **preguntas** que dejan los compradores en tus publicaciones, y
> - los **mensajes post-venta** (el chat con el comprador después de la compra).
>
> Todo queda en el panel de Kooni como una conversación más.
>
> **Modelo:** cada bot usa **su propia aplicación** de MercadoLibre (gratis),
> creada en la cuenta del vendedor. **No hay app central.** Todo el estado
> (App ID, Secret, tokens) vive en la base de datos del bot — **no se usa
> `wrangler secret put`**, se conecta desde `/admin/conexiones`.

---

## Qué se necesita

| Dato | Dónde se consigue |
|---|---|
| **App ID** (client_id) | developers.mercadolibre.com → tu aplicación |
| **Secret Key** (client_secret) | developers.mercadolibre.com → tu aplicación |
| **País** de la cuenta | lo eliges en el panel (Argentina, México, Brasil…) |
| Autorización del vendedor | botón "Autorizar con MercadoLibre" en el panel (OAuth) |

Costo para el dueño: **$0** — la API de MercadoLibre es gratis.

---

## Paso 1 — Crea la aplicación (una sola vez, ~5 min)

1. Entra a **developers.mercadolibre.com** con la **cuenta de MercadoLibre del
   dueño** (necesita **2FA / verificación en dos pasos** activada).
2. **Crear aplicación nueva** → nombre y descripción cualquiera.
3. **URI de redirect (redirect_uri):**
   ```
   https://<tu-worker>.workers.dev/webhooks/mercadolibre/oauth
   ```
   (En el panel, la tarjeta MercadoLibre te muestra esta URL con botón "copiar".)
4. **Permisos (scopes):** marca **read**, **write** y **offline_access**.
   `offline_access` es imprescindible: sin él no hay refresh token y la conexión
   se cae a las 6 horas.
5. **Notificaciones (callbacks / Topics):**
   - URL: `https://<tu-worker>.workers.dev/webhooks/mercadolibre`
   - Tópicos: **`questions`** y **`messages`**
6. Guarda. Copia el **App ID** y la **Secret Key**.

## Paso 2 — Conéctala en el panel

1. Abre `/admin/conexiones` → tarjeta **MercadoLibre**.
2. Elige el **país**, pega el **App ID** y la **Secret Key** → **Guardar datos**.
3. Toca **Autorizar con MercadoLibre →**. Se abre el login de MercadoLibre: el
   dueño inicia sesión y toca **Permitir**.
4. Vuelve solo al panel. La tarjeta se pone **verde** y muestra el nombre del
   vendedor autorizado.

## Paso 3 — Prueba

1. Desde **otra cuenta**, deja una pregunta en una de tus publicaciones.
2. En segundos, la IA la responde (queda pública debajo del producto) y aparece
   en el panel como conversación del canal **MercadoLibre**.

---

## Cómo funciona por dentro (referencia)

- **MercadoLibre no firma sus webhooks.** Manda solo un puntero:
  `{ "resource": "/questions/123", "topic": "questions", "user_id": 456 }`.
  Kooni valida que `user_id` sea el del vendedor conectado y va a **buscar el
  contenido** del recurso con el token del vendedor.
- **Preguntas** → `channelUserId = q:<questionId>:<buyerId>` → se responde con
  `POST /answers` (una sola vez; queda pública).
- **Post-venta** → `channelUserId = m:<packId>:<buyerId>` → se responde con
  `POST /messages/packs/{packId}/sellers/{sellerId}?tag=post_sale`.
- **Tokens** (`src/channels/mercadolibreCredentials.ts`): el access token dura
  ~6 h y se **refresca solo** bajo demanda. El refresh token dura 6 meses y es de
  **un solo uso** (se rota en cada refresh). Si el bot queda inactivo más de 6
  meses, hay que volver a **Autorizar**.

## Reglas de MercadoLibre a tener en cuenta

- Las **respuestas a preguntas son públicas**: MercadoLibre **prohíbe** compartir
  teléfonos, emails o links externos ahí. Ajusta la base de conocimiento / el
  prompt para que el bot no lo intente.
- La **mensajería post-venta** es más flexible, pero también está moderada.

## Troubleshooting

| Problema | Fix |
|---|---|
| "state inválido" al volver del login | Reintenta desde el botón del panel (el `state` caduca). |
| La tarjeta no se pone verde | ¿Autorizaste (Paso 2.3)? ¿El `redirect_uri` de la app es **exactamente** `<worker>/webhooks/mercadolibre/oauth`? |
| Llegan preguntas pero no responde | ¿Activaste los tópicos `questions` y `messages` en las notificaciones de la app? ¿El callback apunta a `<worker>/webhooks/mercadolibre`? |
| Dejó de responder tras unas horas | Falta el scope **offline_access** en la app → vuelve a crear/editar la app con ese permiso y **Autoriza** de nuevo. |
| "notificación para otro vendedor — se ignora" en los logs | La app está autorizada con una cuenta distinta a la que recibe las preguntas. Autoriza con la cuenta correcta. |
