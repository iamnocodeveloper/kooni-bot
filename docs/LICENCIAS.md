# Licencias de Kooni — cómo funcionan (v2, Ed25519)

> **Modelo de negocio:** cualquiera instala Kooni **gratis** desde npm, sin fricción
> y sin pedir permiso. Quien quiere **Pro** paga, y el dueño de la plataforma le
> envía un **código de licencia** que el cliente pega en su panel. No hay servidor
> de licencias en el medio: la validación es local y sin red.

Última revisión: 2026-10-04 · Estado: **implementado y en producción** (código local + overlay del panel; ver §8–§9)

---

## 1. La idea en una frase

Antes había **una sola llave** que servía para *firmar* y para *verificar*, y esa
llave viajaba dentro del paquete público de npm. Ahora hay **dos**: una privada
que solo firma (la tiene el dueño) y una pública que solo verifica (la lleva cada
bot y el CLI). Se puede publicar la pública sin riesgo — con ella no se puede
falsificar nada.

```
   DUEÑO (InsForge)                          CLIENTE (su Cloudflare)
   ────────────────                          ───────────────────────
   clave PRIVADA  ──firma──►  KOONI-PRO-V2-<payload>.<firma>
                                      │
                                      ▼  (el cliente lo pega en /admin/licencia)
                              clave PÚBLICA ──verifica──► Pro desbloqueado
                              (embebida en el bot y en el CLI)
```

## 2. Formato del código

```
KOONI-PRO-V2-<payload-base64url>.<firma-hex>
```

- `payload` — JSON firmado: `{ kind, expiry?, bot?, inst?, modules? }`
  - `kind`: `"lifetime"` (nunca vence) o `"monthly"` (vence en `expiry`)
  - `bot`: opcional, limita el código a un slug de bot
  - `inst`: opcional, limita el código a **una instalación** (uid de 6 caracteres)
  - `modules`: opcional, lista de módulos incluidos. **Ausente = Pro completo.**
- `firma` — Ed25519 del payload, hecha con la clave privada.

El formato viejo (`KOONI-PRO-…` con HMAC) está **desactivado**: `verifyLicense`
rechaza cualquier código que no empiece con `KOONI-PRO-V2-`.

## 3. Quién tiene qué llave

| Llave | Dónde vive | Puede |
|---|---|---|
| **Privada** | Secret `LICENSE_PRIVATE_KEY` en InsForge + respaldo del dueño | Firmar (emitir licencias) |
| **Pública** | Embebida en `src/license.ts` y en `cli-kooni/bin/kooni.js` | Solo verificar |

La pública se puede publicar en npm, GitHub y donde sea — es su propósito.
La privada **nunca** va al worker, ni al CLI, ni al repo.

> ⚠️ **La privada es irreemplazable.** Si se pierde, ningún bot ya desplegado
> vuelve a aceptar una licencia nueva: habría que re-desplegarlos todos con otra
> pública embebida. Guardala en un gestor de contraseñas.

## 4. Qué desbloquea una licencia

`isProUnlocked()` (en `src/config.ts`) es la única puerta. Controla:

- Los tabs Pro del panel: Insights, Estadísticas, Costos, Mejoras, Campañas.
- La tool `catalogQuery` (consultar catálogo/inventario).
- El análisis de imágenes del agente.
- El handoff al dueño por WhatsApp.
- Los límites (contactos, mensajes/mes, canales, reglas, DMs, links).

Y `unlockedModules()` (en `src/modules.ts`) decide qué **módulos de pago**
(Extras / Kooni+) están disponibles. Un módulo se activa por:

1. **Licencia con `modules`** → solo los listados.
2. **Licencia sin `modules`** → todos (licencia completa).
3. **Setting `module_unlocks`** en D1 → override manual del dueño, por
   instalación, sin generar códigos. Útil para activarle algo a **un** cliente.

> **`BOT_TIER` ya NO desbloquea nada.** Quedó como dato informativo. Antes,
> poner `BOT_TIER = "pro"` en `wrangler.toml` daba Pro completo — y como el
> template es público, cualquiera podía auto-otorgárselo. Ese era el agujero.

## 5. Emitir una licencia (dueño)

**Desde el panel de licencias** (lo normal): genera el código, lo guarda en la
base y lo deja listo para enviar. Requiere el secret `LICENSE_PRIVATE_KEY`.

**A mano** (respaldo, sin panel):

```bash
npx tsx scripts/gen-license.ts --privkey <clave privada Ed25519 base64> --kind lifetime
npx tsx scripts/gen-license.ts --privkey <…> --kind monthly --months 1
npx tsx scripts/gen-license.ts --privkey <…> --kind lifetime --inst 948b8b   # ligada a una instalación
npx tsx scripts/gen-license.ts --privkey <…> --kind lifetime --module analista --module metricas
```

## 6. Activar una licencia (cliente)

Dos caminos, los dos válidos:

- **Durante la instalación:** `npx kooni-bot init` pregunta si tiene licencia; al
  pegarla, el CLI la valida en local (Ed25519, sin red) y la activa al terminar.
  También por flag: `--license <código>`.
- **Después, desde el panel:** `/admin/licencia` → pegar el código. No requiere
  re-desplegar.

El código queda guardado en el setting `pro_license` de la D1 del cliente.

## 7. Preguntas que suelen aparecer

**¿Necesita internet para validar?** No. La verificación es local, con la clave
pública embebida. Un bot sin conexión al panel de licencias sigue siendo Pro.

**¿Se puede revocar una licencia?** No a distancia — es el precio de no tener
servidor de licencias. Se mitiga con licencias `monthly` (vencen solas) y con
`inst` (atadas a una instalación). Una revocación real exigiría que el bot
consultara un servidor, con todo lo que eso implica (dependencia, caída, latencia).

**¿Qué pasa si alguien copia un código a otra instalación?** Si el código se
emitió con `inst`, no funciona. Si se emitió sin `inst`, sí funciona — por eso
conviene emitirlos ligados a la instalación.

**¿Y si el cliente no paga y quiere seguir gratis?** No pasa nada: el bot
funciona completo en Free (responde con IA, capta leads, escala a humano, agenda,
KB, multicanal). Pro es análisis y crecimiento, no el servicio base.

## 8. Pro en dos capas: código local + overlay del panel

Pro se controla por **dos caminos que se complementan**:

**Capa 1 — el código (offline).** El código `KOONI-PRO-V2-…` vive en el setting
`pro_license` de la D1. `isProUnlocked()` (`src/config.ts` → `isProLicense` en
`src/limits.ts`) lo verifica con la clave **pública** (Ed25519, sin red). Funciona
aunque el bot no tenga conexión al panel. Se pega desde `/admin/licencia` o con
`init --license`.

**Capa 2 — el overlay (el panel manda en vivo).** `syncLicenseState()`
(`src/licenseSync.ts`) hace `POST {KOONI_API_URL}/estado-licencia` con el header
`X-Kooni-Token: {KOONI_INSTALL_TOKEN}` y guarda lo que devuelve el hub (plan,
estado, `code`, `modules`, `limits`, `brand`) en `settings` → `license_overlay`,
`pro_license`, `module_unlocks`. Así el super admin cambia plan/módulos/límites/
marca **sin redeploy**. Corre en cada tick del cron y al terminar un
`deploy`/`pair` (vía `POST /license/sync`), con caché de 6 h.

**Identidad del bot = token POR INSTALACIÓN.** `licencia-emitir` (el CLI ya
logueado) emite el token, registra la instalación y la liga a su licencia
(`instalaciones.licencia_id`); el CLI lo guarda como secret `KOONI_INSTALL_TOKEN`.
Ese token es con el que el bot pide licencia y reporta uso (`registrar-uso`).

| Quién | Escribe | Efecto |
|---|---|---|
| CLI (`init`/`deploy`/`pair`) | `instalaciones` + `licencia free` + token | El bot aparece en el panel y queda ligado |
| Super admin (Licencias) | `licencias` (plan/módulos/límites/marca/código) + `instalaciones.tier` | El plan se ve al instante en el panel |
| Bot (`estado-licencia`) | `settings.license_overlay` + `pro_license` | Aplica plan/módulos/límites/marca |
| Bot (`registrar-uso`) | `uso_instalaciones` + `instalaciones.tier` | Métricas + costo IA en el panel |

**Reglas de oro:**
- La **clave pública** debe ser la del firmador del panel (`…Lxrjpy…`). La
  estampan el CLI y `wrangler.toml.example`; la de respaldo en `src/license.ts`
  **debe** coincidir (estuvo mal: `…qpP9…` — corregido en v1.55.2).
- El **token por instalación** debe estar sincronizado. Si no, el hub responde
  `{"error":"token desconocido"}` y el bot **no** trae licencia ni reporta uso
  (queda en Free, sin métricas). Ver §9.
- Al activar en el super admin, el bot lo aplica en su **próximo sync** (botón
  **Sincronizar ahora** en `/admin/licencia`, o el cron nocturno).

## 9. Troubleshooting

**El bot quedó en Free aunque la licencia dice Pro / no aparecen métricas.**
Casi siempre es el token desincronizado. Diagnóstico: en el panel del bot,
`Licencia → Sincronizar ahora`; si el sync falla con **401 "token desconocido"**,
hay que **re-vincular**:

```bash
cd <carpeta-del-bot>
npx kooni-bot pair        # re-emite el token, lo guarda como secret y redespliega
```

El CLI **0.7.1+** avisa solo cuando `pair`/`deploy` no logran sincronizar (antes
era silencioso).

**El link de aprobación del `login` apunta a `kooni.click` (sitio de marketing).**
Falta el secret `SITE_URL` en el hub; debe ser el dominio del panel
(`https://t6bferet.insforge.site`). Se ajusta una vez por proyecto.

**Sospecha de clave pública equivocada.** Tomá un código `KOONI-PRO-V2-…` real y
verificá su firma contra las dos claves (la buena valida `true`, la mala `false`);
la buena es la que corresponde a la privada del panel.
