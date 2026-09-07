# Kooni — Planes: Free vs Pro

> **Modelo (desde 2026-09-07):** *todas las funciones están disponibles en el
> plan gratis.* No hay ninguna feature bloqueada por tier. Lo único que separa
> Free de Pro son **límites de cantidad** (contactos, mensajes/mes, canales…).
> Pro los quita todos.

---

## 1. El modelo en una frase

**Free = Kooni completo, con topes de uso. Pro = Kooni completo, sin topes.**

- Mismo cerebro, mismos canales, mismo panel, mismas tools, mismas automatizaciones,
  mismos "Extras" (analista IA, campañas, oído/vista, voz de marca, web sync…).
- El plan gratis solo corta la **cantidad**: cuántos contactos registra, cuántos
  mensajes procesa al mes, cuántos canales conecta, etc.
- Al topar un límite el bot **no se apaga**: responde una vez "llegaste al límite"
  y deja de procesar ese recurso hasta el mes siguiente (o hasta que se active Pro).

## 2. Límites del plan gratis (código real: `src/limits.ts`)

| Recurso | Free | Pro | Se hace cumplir en |
|---|---|---|---|
| Contactos únicos | 50 | ∞ | `agent.ts` (conversación nueva) |
| Mensajes IA / mes | 500 | ∞ | `agent.ts` (cada entrante) |
| Canales conectados | 2 | ∞ | `routes.ts` (POST de Conexiones) |
| Reglas de automatización | 5 | ∞ | `routes.ts` (`auto_rules`) |
| Respuestas automáticas (auto-DM) / mes | 100 | ∞ | `channels/zernio.ts` |
| Links trackeados | 3 | ∞ | `limits.checkLimit("trackedLinks")` |
| Cuentas Zernio | 1 | ∞ | (definido; se muestra en el panel) |
| Historial de logs | 7 días | ∞ | (definido; la purga real es a 90 d) |

Todos los chequeos son **fail-open**: si el conteo falla, el mensaje pasa.

- `FREE_LIMITS` / `PRO_LIMITS` en `src/limits.ts` — cambia ahí los números.
- `PRO_LIMITS` = todo `null` (sin tope).
- `checkChannelLimit()` — gate de canales; `channelLimitGate()` en `routes.ts` lo
  aplica a las cards de Telegram, Zernio, WAHA y MercadoLibre. **Nota:** los
  canales que se conectan por `wrangler secret put` (Twilio, Meta, ManyChat) NO
  pasan por el panel, así que ese tope solo aplica a los canales de panel.

## 3. Cómo se controla el tier

| Mecanismo | Cómo |
|---|---|
| **Tier del bot** | Licencia Pro (`KOONI-PRO-V2-…`, Ed25519) pegada en `/admin/licencia`. Sin licencia válida → Free (con límites). `BOT_TIER` en `wrangler.toml` es solo informativo. |
| **Funciones** | Ninguna gateada. `PRO_ONLY_TOOLS` y `PRO_ONLY_TABS` (en `src/config.ts`) quedaron vacíos; `unlockedModules()` devuelve siempre todo. |
| **Límites** | `getLimits(env)` → `PRO_LIMITS` si hay licencia válida, `FREE_LIMITS` si no. |

> Por bot: cada instancia desplegada tiene SU licencia. Un bot free y uno pro
> conviven en la misma cuenta con recursos separados.

## 4. Volver a un modelo con paywall (si algún día se quiere)

Todo quedó preparado para revertir:

- Repoblar `PRO_ONLY_TOOLS` / `PRO_ONLY_TABS` / `PRO_GATE` (en `routes.ts`).
- Devolver a `unlockedModules()` / `isModuleUnlocked()` (en `src/modules.ts`) la
  lógica de licencia + `module_unlocks` (está en el historial de git).
- El catálogo `PAID_MODULES` sigue intacto (se usa para las etiquetas del panel).

## 5. Los tres niveles

| Nivel | Precio | Qué entrega |
|---|---|---|
| **Gratis** | $0 | El código completo (MIT), con los límites de uso del panel (§ 2). |
| **Licencia** | fundador **$39** · Pro **$12/mes** | Quita los límites de uso del panel. Código `KOONI-PRO-V2-…` (`kind: monthly` con 7 días de gracia). |
| **Kit de agencia** | **$149** | Packs de conocimiento por rubro, materiales de marca blanca, guía de venta y soporte de implementación. **NO es "el código"** — el código ya es gratis. Vive fuera de este repo. |

> El código nunca es lo que se paga: es MIT y es el embudo. Lo que se cobra es
> quitar topes (Licencia) o contenido + servicio (Kit de agencia).

Detalle de despliegue para producción: [`DESPLIEGUE.md`](./DESPLIEGUE.md) ·
Licencias: [`LICENCIAS.md`](./LICENCIAS.md).
