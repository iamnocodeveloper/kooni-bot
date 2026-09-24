# Kooni — Etapa "Licencias + Paneles + CLI" (2026-09-24)

Documento de cierre de etapa. Todo lo de abajo está **commiteado** en
`github.com/iamnocodeveloper/kooni-bot` y los paneles **desplegados** en
https://t6bferet.insforge.site.

---

## 1. Qué se construyó

### Backend InsForge (proyecto `kooni`, appkey `t6bferet`)
- **Tablas**: `profiles`, `licencias`, `instalaciones`, `uso_instalaciones`,
  `modulos_catalogo`, `dominios`, `device_codes`, `cli_tokens`, `pagos`,
  `novedades`, `pago_proveedores`, `ia_proveedores`, `comandos_catalogo`,
  `integraciones`, `packs`, `faq`, `soporte_mensajes`, `config_plataforma`,
  `auditoria_admin`, `colaboradores_cuenta`. Todas con **RLS**.
- **Edge functions**: `licencia-firmar`, `licencia-emitir`, `estado-licencia`,
  `registrar-uso`, `cli-device-start/poll/approve`, `cli-whoami`,
  `colaborador-aceptar`, `pago-crear`, `pago-webhook`,
  `pago-confirmar-payphone`, `pago-confirmar-manual`, `pago-proveedores`.
- **Cripto**: par **Ed25519** (privada en el secret `LICENSE_PRIVATE_KEY`; pública
  embebida en el bot/CLI).

### Paneles (`kooni-paneles/`, React + Vite, un sitio con dos áreas)
- **Cliente `/`**: Mis bots · Vinculación · Novedades · Plantillas · Conectar CLI
  · Sesiones del CLI · Configuración · Mi plan · Invitación.
- **Super admin `/admin`** (20 vistas): Resumen · Clientes · Licencias ·
  Instalaciones · Módulos · Novedades · Planes · Facturación · Config. pagos ·
  Dominios · Proveedores IA · Comandos/Skills · Integraciones · Plantillas/Packs
  · Revendedores · Soporte · Estadísticas · Configuración · Auditoría ·
  Equipo (admins).

### Bot (`src/`)
- `syncLicenseState()` (fail-open, cron + `POST /license/sync`) aplica plan,
  módulos, límites y marca desde el panel.
- `unlockedModules()` reactivado (gating por licencia; sin `module_unlocks` → todo).
- **Habilidades / Superpoderes** separados en el panel.
- **Comandos** (cheat sheet) · **Equipo** (accesos) · **versionado del prompt**
  (historial + volver) · **Gemini** como proveedor de IA · **chat del Sitio web**
  (`/chat.js` + `/webhooks/webchat`) · `GET /api/leads` (control plane).

### CLI (`cli-kooni/`, `kooni-bot@0.5.0`)
- `login` (device flow) · `whoami` · `pair` · `list` · `install <giro>` · `init`
  (registra la instalación, estampa `KOONI_API_URL`/`USAGE_PUSH_URL`/
  `LICENSE_PUBLIC_KEY`, guarda `KOONI_INSTALL_TOKEN`) · `update` (re-sync).

---

## 2. PENDIENTES

### Fase C
- **Login por persona de Equipo** (multiusuario del bot): reactivar `magic_links`
  para que cada colaborador entre con **su correo** y tenga **sesión propia**
  (hoy es `DASHBOARD_PASSWORD` global), con roles y visibilidad por sección.
  Sub-pasos: (i) invitación con link · (ii) login por magic link + sesión propia ·
  (iii) roles/visibilidad.

### Fase D
- **Clientes** (bandeja consolidada de leads, opción **a: leer en vivo**):
  - ✅ Hecho: `GET /api/leads` en el bot (Bearer `CONTROL_PLANE_TOKEN`).
  - ⏳ **Pieza token**: el CLI genera un read-token por instalación, lo escribe
    como `CONTROL_PLANE_TOKEN` en el bot y lo manda a la plataforma en
    `licencia-emitir` (guardado en `instalaciones`).
  - ⏳ **Pieza proxy**: edge function `leads` que llama al bot y devuelve los leads
    **sin almacenarlos**.
  - ⏳ **Pieza UI**: página **Clientes** que agrupa los leads de todos los bots.
  - ⚠️ **Decisión**: `docs`/`PRIVACY` dicen que `/api/*` devuelve **solo agregados**.
    Exponer leads con PII cambia esa promesa → actualizarla o limitar al dueño.

### Fase B
- **Auto-renovación + avisos de vencimiento** (el webhook ya renueva al pagar;
  falta el aviso antes de vencer).

### Transversal
- **Cruzar los bugs del Anexo (Arena)** contra Kooni (20 items: `update` que borra
  parches, cron silencioso, `X-Api-Key` de ManyChat, bot en blanco, deps «latest»…).

### Operación
- **Deploy del bot**: los cambios de `src/` se ven al desplegar
  (`npx kooni-bot update` o `pnpm run deploy`).
- **Publish del CLI en npm**: `kooni-bot@0.5.0` listo; **bloqueado por el OTP**
  (`npm publish --otp=…`).
- **Instalaciones existentes**: correr `npx kooni-bot pair` para estampar
  `USAGE_PUSH_URL` + el token por instalación (telemetría).

---

## 3. Decisiones abiertas
- **Modelo de plan**: ¿plan único con todo (Forja) o free/pro + módulos por licencia?
- **Composio**: cuenta de plataforma vs por cliente.
- **IA incluida**: ¿cerebro incluido o solo BYO-LLM?
- **Clientes (leads)**: leer en vivo (elegido) — definir el flujo de token y la promesa.

---

## 4. Diferido (otra etapa)
App móvil nativa (Kooni usa PWA) · Plantillas de WhatsApp (HSM) · Composio ·
Marketplace/roadmap comunitario · Arena · Inbox+ · Facturación-vista · Recursos
(UI de biblioteca con subida).

---

## 5. Referencias
- Plan maestro: `~/.commandcode/plans/kooni-plan-completo.md`
- Análisis por ventana de Forja: `~/.commandcode/plans/kooni-panel-forja-parity.md`
- Guía de los paneles: `kooni-paneles/README.md`
