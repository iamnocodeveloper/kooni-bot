# Migrar una instalación a otra cuenta de Cloudflare

> Caso típico: armaste un **demo** para un cliente en tu cuenta de Cloudflare y
> ya está listo para producción. En vez de reinstalar desde cero, **migras la
> instalación íntegra** a la cuenta del cliente (o a otra cuenta tuya).

`npx kooni-bot migrate` **COPIA** todo lo que ya hiciste: la cuenta de origen no
se toca ni se borra. Al terminar, el bot vive en la cuenta nueva y queda
vinculado a su licencia, listo para seguir operando.

---

## Qué se migra

| Se copia | Cómo |
|---|---|
| **Base de datos (D1)** | Export del origen → import en la cuenta destino. Incluye clientes, conversaciones, mensajes, leads, etiquetas, cotizaciones, pedidos, tickets, productos, auditoría… |
| **Esquema** | Se reaplica `src/db/schema.sql` (idempotente) sobre la base destino. |
| **Base de conocimiento** | Se **re-indexa** desde los documentos guardados en D1 al nuevo índice Vectorize (los vectores no se exportan; se re-embeben). |
| **Secrets** | Se suben los que estén en `.dev.vars`: `DASHBOARD_PASSWORD`, `KB_REINDEX_TOKEN` y las llaves de IA. |
| **Worker** | Se despliega en la cuenta destino y se detecta su URL. |
| **Licencia / vinculación** | Se re-registra la instalación y se re-vincula su licencia (token por instalación). |

## Qué NO se migra

- **La cuenta de origen** no se modifica ni se borra (puedes dejar el demo como copia de seguridad).
- **Los webhooks de los canales** apuntan a la URL anterior. Si cambia la URL, vuelve a **registrarlos** desde el panel → **Conexiones** (o borra el webhook viejo).
- **Configuración de cuenta** de Cloudflare (dominios, WAF, etc.): eso es de la cuenta, no del bot.

---

## Requisitos

1. La carpeta de la instalación (con su `wrangler.toml`, `member/`, `.dev.vars`).
2. Un **API token de Cloudflare** con permiso **Workers Scripts: Edit**, **D1: Edit** y **Vectorize: Edit** en la cuenta DESTINO.
3. El **Account ID** de la cuenta destino (Dashboard → Workers & Pages → Account ID).
4. La cuenta destino debe tener **subdominio `workers.dev`** activo (si no, el deploy lo crea y reintenta — igual que `deploy`).

> **Origen:** si no pasas `--from-token`/`--from-account`, se usan las variables
> de entorno actuales (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`) o la sesión
> de `wrangler` que tengas activa. Para no pelear con dos sesiones, lo más simple
> es pasar **los dos** tokens por flag.

---

## Comando

```bash
npx kooni-bot migrate ./mi-bot \
  --to-token   <CF_API_TOKEN_DESTINO> \
  --to-account <ACCOUNT_ID_DESTINO> \
  --yes
```

Flags:

| Flag | Qué hace |
|---|---|
| `--to-token` | **Requerido.** API token de la cuenta destino. |
| `--to-account` | **Requerido.** Account ID de la cuenta destino. |
| `--from-token` | Opcional. Token de la cuenta origen (si no, usa el entorno/wrangler). |
| `--from-account` | Opcional. Account ID del origen. |
| `--yes` | Modo no-interactivo. |
| `--lang es-MX\|en` | Idioma de la salida. |

---

## Qué hace, paso a paso

1. **Exporta** la base D1 del origen a un backup temporal.
2. **Crea** una base D1 nueva en la cuenta destino y la engancha al `wrangler.toml`.
3. **Importa** los datos y **reaplica** el esquema.
4. **Crea** el índice Vectorize en el destino.
5. **Sube los secrets** (desde `.dev.vars`) y **despliega** el worker.
6. **Re-indexa** la base de conocimiento (re-embebe los documentos).
7. **Re-vincula** la instalación y la licencia; guarda la URL en el marker local.

Al terminar verás la URL nueva del worker.

---

## Después de migrar

1. Abre `https://<worker-nuevo>/admin` y revisa que todo esté (conversaciones, KB, etiquetas, cotizaciones).
2. **Re-registra los webhooks** de los canales que uses (Telegram/Zernio/WAHA) desde **Conexiones**, porque apuntan a la URL anterior.
3. Manda un mensaje de prueba real.
4. Si vas a dejar de usar el demo en la cuenta vieja, borra sus recursos a mano desde el Dashboard (el comando **no** los borra por seguridad).

---

## Problemas comunes

- **`no pude crear/encontrar la base D1`** → el token destino no tiene permiso de D1, o el Account ID no es el correcto.
- **El deploy falla con `10063`** → la cuenta destino no tiene subdominio `workers.dev`; se crea solo y reintenta (igual que en `deploy`).
- **El bot responde pero no encuentra su información** → faltó re-indexar; vuelve a correr `npx kooni-bot update` en la carpeta (re-indexa) o dispara `POST /kb/reindex` con el `X-Reindex-Token`.
- **La licencia no aplica** → corre `npx kooni-bot pair` en la carpeta para re-vincularla.
