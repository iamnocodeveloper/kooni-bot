# Kooni — Uso del panel y día a día

> Cómo usar el panel `/admin`, conectar y supervisar canales, gestionar la base de
> conocimiento y leer las métricas. Para instalar: [`DESPLIEGUE.md`](./DESPLIEGUE.md).

---

## 1. Entrar al panel

```
https://<tu-worker>.workers.dev/admin
```

- **usuario:** `admin`
- **contraseña:** la que definiste con `DASHBOARD_PASSWORD`. Para **cambiarla**:
  `cd <carpeta-del-bot>` → `npx wrangler secret put DASHBOARD_PASSWORD` (aplica al
  instante, sin redeploy). Detalle de todos los secrets en `docs/DESPLIEGUE.md §4.1`.
- (Alternativa: magic link — entra con tu email si `admin_emails` lo contiene.)

El panel está en español, tema oscuro Kooni (tinta + teal). De izquierda a derecha:

| Sección | Qué verás |
|---|---|
| **Inicio → Resumen** | Estado del bot: canales conectados, mensajes del día, clientes únicos, leads, costo del mes, alerts (badges rojos). |
| **Bandeja** | Conversaciones, Leads, Tickets (escalaciones), Campañas. |
| **Mi Agente** | Flujo (cómo piensa el bot), Conocimiento (KB), Mejoras (flywheel), Conexiones, Configuración. |
| **Análisis** *(Pro)* | Insights (IA), Estadísticas, Costos. |

> Las secciones de **Análisis** y **Campañas/Mejoras** requieren `BOT_TIER = "pro"`
> en `wrangler.toml`. En free se ven bloqueadas con un candado.

---

## 2. Resumen (vista diaria)

- **Bot en línea** (pill verde arriba a la derecha): el worker responde.
- **Badges rojos** = algo pendiente: canal sin conectar, handoff sin configurar.
- **Costos del mes**: cuánto gastó el bot en IA (tokens) — vía `messages.input_tokens/output_tokens`.

---

## 3. Bandeja

### Conversaciones
- Todas las conversaciones de todos los canales en una sola lista.
- Abre una conversación para leer el hilo; puedes **responder tú mismo** (handoff)
  y marcar resuelta.
- Filtros por canal y estado.

### Leads
- Prospectos capturados automáticamente (`captureLead`): nombre, contacto, intención.
- Según el nicho, las columnas cambian (ej. "Reservaciones" con fecha/hora/personas).
- Exportar: skill `/exportar` (CSV/JSON vía D1).

### Tickets (escalaciones)
- Conversaciones que el bot no pudo resolver o pidieron humano.
- Se crean con `handoffHuman`; el dueño recibe aviso (Telegram/correo/WhatsApp).
- Resolver desde aquí deja registro (`resolved_by`, `resolved_at`).

### Campañas *(Pro)*
- Difusiones a segmentos (por interés/objeción etiquetados en `conv_labels`).
- Seguimientos automáticos (un follow-up por conversación, con candado anti-duplicado).

---

## 4. Mi Agente

### Flujo
- Diagrama de cómo piensa el bot: tools activas, pasos, handoff.
- Ver `src/agent.ts` y `src/tools/`.

### Conocimiento (KB)
- **Agregar documento** → se indexa solo en Vectorize al instante (búsqueda semántica).
- Editar/borrar documentos existentes.
- El bot busca aquí antes de responder (`searchKb`); si no encuentra, escala.
- Los datos estructurados (horarios, precios, ubicación) NO van aquí: van en
  **Configuración → Información del negocio**.

### Mejoras *(Pro)*
- Sugerencias del **flywheel**: el bot detecta preguntas que no pudo responder
  (`missed_kb`) y propone entradas de KB o lecciones. Aprueba/descarta desde aquí.

### Conexiones
- Estado de cada canal: **verde** = conectado, **gris** = no configurado.
- **Zernio** (si está configurado): multicanal unificado — un solo canal verde cubre
  IG, Messenger, X, Telegram, WhatsApp, etc. El **comentario → DM por keyword** se
  configura con `ZERNIO_AUTO_DM_KEYWORD` (ver `docs/DESPLIEGUE.md`).
- Webhooks y secrets asociados (los secrets no se muestran, solo si existen).
- Aquí se ve si falta un secret (ej. `TELEGRAM_BOT_TOKEN` sin setear).

### Configuración
- **Información del negocio**: horarios, servicios/precios, ubicación, pagos,
  teléfono, FAQ. Editable en vivo — **aplica al instante, sin redeploy**.
- **Modelo de IA**: proveedor (Anthropic/OpenAI/xAI), tu llave, modelos fast/smart.
- **Avisos**: correo del dueño, canal de handoff.
- **Buffer**: segundos de espera para juntar mensajes antes de responder.

---

## 5. Análisis *(Pro)*

- **Insights**: resumen IA por conversación (sentimiento, resolución, bot_score,
  temas, oportunidad de venta). Se genera con un modelo barato (Haiku) cuando la
  conversación queda inactiva.
- **Estadísticas**: volumen, retención, desempeño en el tiempo.
- **Costos**: gasto de IA por modelo, con **tope de presupuesto** mensual
  (`src/budget.ts`).

---

## 6. Nichos (giros)

Con `BOT_NICHE` en `wrangler.toml` el panel se re-etiqueta (ej. "Leads" →
"Reservaciones") y el bot adopta el playbook del giro. Cómo crear un nicho propio:
`docs/ARQUITECTURA.md` §7.

---

## 7. Comandos útiles (mantenimiento)

| Comando | Para qué |
|---|---|
| `pnpm dev` | Worker local (wrangler dev) |
| `pnpm test` / `pnpm typecheck` | Verificación antes de desplegar cambios |
| `pnpm db:apply:remote` | Migraciones D1 en la nube |
| `pnpm run deploy` | Publicar |
| `pnpm kb:reindex` | Reindexar `member/kb/*.md` (no es el camino normal — usa el panel) |
| `npx wrangler secret list` | Ver qué secrets existen (sin valores) |
| `npx wrangler secret put <NOMBRE>` | **Cambiar/crear un secret** (contraseña del panel, llaves de IA, tokens de canales) — te la pide en entrada oculta; aplica al instante sin redeploy |
| `npx wrangler secret delete <NOMBRE>` | Borrar un secret (ej. desactivar un canal) |
| `npx wrangler secret bulk secrets.json` | Poner varios secrets a la vez desde un JSON (no lo commitees) |
| `npx wrangler tail` | Logs en vivo del worker |

> Los secrets de Cloudflare **no se pueden leer de vuelta** (solo sobrescribir o
> borrar). Los secrets locales para `wrangler dev` viven en `.dev.vars`. Guía
> completa de qué secret es cada canal: `docs/DESPLIEGUE.md §4.1`.

---

## 8. Privacidad (recordatorio)

- Los **mensajes se purgan a los 90 días** automáticamente (cron diario).
- El bot **no envía telemetría** a nadie.
- El texto viaja al proveedor de IA que **tú** elegiste (con tu llave).
- Si un cliente pregunta si es un bot, **lo admite** — no lo configures para negarlo.
- Detalle completo: [`PRIVACY.md`](../PRIVACY.md).
