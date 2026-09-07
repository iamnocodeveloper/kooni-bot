# Política de seguridad

## Reportar una vulnerabilidad

Si encontrás un problema de seguridad en el código de Kooni, **no abras un issue
público**. Reportalo en privado:

- **GitHub Security Advisories:** pestaña **Security → Report a vulnerability**
  de este repositorio (`github.com/iamnocodeveloper/kooni-bot`).
- **Correo:** `nocodeveloper2024@gmail.com` con el asunto `[SEGURIDAD] Kooni`.

Incluí, si podés: qué versión, cómo reproducirlo, y el impacto que ves. Si es un
problema de una clase peligrosa, describí la clase — no hace falta un exploit
funcional.

Respondemos en un plazo razonable (días, no semanas) y coordinamos la
divulgación. No hay programa de recompensas.

## Alcance

- **En alcance:** el Worker (`src/`), el CLI (`cli-kooni/`), las plantillas de
  despliegue.
- **Fuera de alcance:** tu propia instalación mal configurada (secrets expuestos
  por vos, `wrangler.toml` con IDs, etc.), servicios de terceros (Cloudflare,
  proveedores de IA, canales).

## Notas de diseño relevantes

- Cada instalación corre en **la cuenta de Cloudflare del usuario** con **sus
  llaves**. Kooni no tiene servidores que procesen datos de clientes.
- Los **secrets** (llaves de IA, tokens de canales, contraseña del panel) van
  como `wrangler secret`, nunca al repo ni al código. No se pueden leer de
  vuelta.
- La **licencia Pro** se valida **localmente** con una firma Ed25519 (clave
  pública embebida). El repo es MIT y abierto: cualquiera puede quitar la
  validación. Eso es esperado — ver [`docs/LICENCIAS.md`](./docs/LICENCIAS.md).
- Los **mensajes** se purgan a los 90 días (cron). El bot **no envía telemetría**.
