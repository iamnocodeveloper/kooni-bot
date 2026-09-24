# Kooni — Paneles (super admin + cliente)

App web única que sirve **dos áreas** desde un solo despliegue de InsForge:

| Ruta      | Área          | Para quién                                                   |
| --------- | ------------- | ------------------------------------------------------------ |
| `/`       | Panel cliente | El dueño del bot: su plan, sus instalaciones, conectar el CLI |
| `/admin`  | Super admin   | Vos: licencias, módulos por licencia, instalaciones/stats, clientes |

> InsForge hospeda **un sitio por proyecto**, por eso las dos áreas viven en la
> misma app (rutas distintas) en vez de dos despliegues separados. El backend
> (`/functions`, `/migrations`) es el mismo proyecto InsForge `kooni`.

## Enlaces

- **Sitio:** https://t6bferet.insforge.site
- **Proyecto InsForge:** `kooni` (appkey `t6bferet`, región us-east)
- **API base:** https://t6bferet.us-east.insforge.app

## Cómo correr local

```bash
cd kooni-paneles
npm install --include=dev
cp .env.example .env   # llena VITE_INSFORGE_ANON_KEY
npm run dev
```

## Cómo desplegar

```bash
# Las env vars se configuran una vez (persisten entre despliegues):
npx -y @insforge/cli deployments env set VITE_INSFORGE_URL https://t6bferet.us-east.insforge.app
npx -y @insforge/cli deployments env set VITE_INSFORGE_ANON_KEY <anon_key>

# Build local primero, luego desplegar el directorio fuente (no dist/):
cd kooni-paneles && npm run build && cd ..
npx -y @insforge/cli deployments deploy kooni-paneles
```

## Primer arranque: hacerte super admin

El primer usuario que se registre queda como `cliente`. Para habilitar el
super admin, promové tu cuenta (una sola vez):

```bash
npx -y @insforge/cli db query \
  "update public.profiles set role = 'admin' where email = 'tu@correo.com';"
```

Luego entrá a `/admin`. Desde **Clientes** podés promover/revocar otros roles.

## Backend (InsForge)

### Tablas (`migrations/20260923213128_kooni-licencias-core.sql`)

- `profiles` — espejo de `auth.users` con `role` (`cliente` | `revendedor` | `admin`).
- `licencias` — `plan`, `kind`, `expiry`, `estado`, `modules`, `limits`, `brand`, `code`.
- `instalaciones` — cada bot: `uid`, `slug`, `worker_url`, `tier`, `last_seen`, `token_hash`.
- `uso_instalaciones` — reporte agregado diario (sin PII).
- `modulos_catalogo` — catálogo de funciones (espeja `src/modules.ts`).
- `dominios`, `device_codes`, `cli_tokens`, `pagos`.

Todas con **RLS**: cada usuario ve lo suyo; el admin todo. Helpers
`is_admin()` y `ensure_profile()` son `SECURITY DEFINER`.

### Edge functions

| Slug                  | Quién la llama        | Para qué                                          |
| --------------------- | --------------------- | ------------------------------------------------- |
| `licencia-firmar`     | Super admin           | Firma un código `KOONI-PRO-V2-…` (Ed25519)        |
| `licencia-emitir`     | CLI (logueado)        | Registra la instalación y devuelve su token       |
| `estado-licencia`     | Worker del bot        | Plan, módulos, límites y marca vigentes           |
| `registrar-uso`       | Worker del bot        | Empuja métricas agregadas (sin PII)               |
| `cli-device-start`    | CLI                   | Inicia el login por dispositivo                   |
| `cli-device-poll`     | CLI                   | Consulta si el código fue aprobado                |
| `cli-device-approve`  | Panel cliente         | Aprueba el código (logueado)                      |

### Secrets

- `LICENSE_PRIVATE_KEY` — clave privada Ed25519 (firma códigos). Nunca sale de InsForge.
- Pública (embebida en el bot/CLI):
  `MCowBQYDK2VwAyEALxrjpy7pkyHSqlCcObUfMygNXNznd9/YXhamO17e4tc=`

### Pagos (Facturación)

Las keys se ponen **desde el panel**: super admin → **Config. pagos**. Cada
proveedor se activa solo cuando está encendido y completo. (También acepta el
secret de entorno como respaldo: `STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_ID`, etc.)

| Proveedor | Datos a pegar en "Config. pagos" | Cómo cobra |
| --- | --- | --- |
| **Stripe** | `secret_key`, `webhook_secret` | Redirect a Stripe Checkout |
| **PayPal** | `client_id`, `client_secret`, `webhook_id` | Redirect a PayPal |
| **Payphone** | `token`, `store_id` | **Cajita de Pagos** (widget) + confirmación en 5 min |
| **Binance** | `pay_id`, `instrucciones` | **Pago manual**: el admin lo marca pagado en Facturación |

Webhooks a configurar en cada proveedor:
`https://t6bferet.function2.insforge.app/pago-webhook?provider=stripe|paypal`
(además `SITE_URL` con el origen del hub).

**Payphone:** el dominio del hub debe estar registrado en Payphone Developers
(tipo WEB) con la **URL de respuesta** `https://t6bferet.insforge.site/plan`.
El hub confirma la transacción automáticamente al volver (obligatorio: si no se
confirma en 5 minutos, Payphone la reversa).

Al confirmarse el pago, se activa la licencia (plan `pro`, módulos del plan,
`expiry` +30 días y **código firmado nuevo**).

## Flujo (lógica Forja, sin copiar código)

1. El usuario corre `npx kooni-bot init` → el CLI abre el device login.
2. Se registra/loguea en `/` y aprueba el código en **Conectar CLI**.
3. El CLI registra la instalación (`licencia-emitir`) y recibe su token.
4. El bot corre; cada noche empuja su uso (`registrar-uso`).
5. Vos ves todo en `/admin` y activás plan/módulos/límites/marca por licencia.
6. El bot lo aplica en su próximo `estado-licencia` (fail-open).
