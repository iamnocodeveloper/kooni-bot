# Kooni — Planes: Free vs Pro

> Cómo funciona el modelo de **versión gratis + versión de pago**:
> qué desbloquea cada tier, cómo se controla, y cómo crecer a un modelo de pago
> cuando esté listo. (Uso interno hoy; el modelo de cobro se detalla después.)

---

## 1. El modelo

- **Starter (Free)** — el bot funciona completo para cualquier negocio: responde
  con IA, captura leads, escala a humano, agenda con Cal.com, KB, multicanal.
- **Pro (pago)** — desbloquea análisis y crecimiento: Insights IA, Estadísticas,
  Costos, Mejoras (flywheel), Campañas, catálogo de productos, y los **giros
  (niche packs)** con panel a la medida.

> El tier lo controla `BOT_TIER` por bot (o una licencia Pro local); los giros son
> archivos propios en `src/niches/` (sin servidor de licencias externo).

## 2. Qué incluye cada tier (código real)

| Función | Free | Pro |
|---|---|---|
| Responder con IA (todos los canales) | ✅ | ✅ |
| Base de conocimiento (RAG, sube documentos) | ✅ | ✅ |
| Captura de leads (`captureLead`) | ✅ | ✅ |
| Agendar citas Cal.com (`scheduleAppointment`) | ✅ | ✅ |
| Escalar a humano (`handoffHuman`, avisos) | ✅ | ✅ |
| Entender audio (Whisper) | ✅ | ✅ |
| Panel: Resumen, Conversaciones, Leads, Tickets, Flujo, KB, Conexiones, Config | ✅ | ✅ |
| **Insights IA** (resumen/sentimiento por conversación) | 🔒 | ✅ |
| **Estadísticas** (volumen, retención) | 🔒 | ✅ |
| **Costos** (gasto de IA con tope mensual) | 🔒 | ✅ |
| **Mejoras** (flywheel: el bot propone KB/lecciones) | 🔒 | ✅ |
| **Campañas** (difusiones por segmento) | 🔒 | ✅ |
| **Catálogo** (`catalogQuery` — productos/inventario) | 🔒 | ✅ |
| **Imágenes** (el bot "ve" fotos) | 🔒 | ✅ |
| **Giros (niche packs)** con panel a la medida | 🔒 | ✅ |

> Implementación: `src/config.ts` (`PRO_ONLY_TOOLS`, `PRO_ONLY_TABS`),
> `src/tools/index.ts` (gating de `catalogQuery`), `src/admin/views/layout.ts`
> (tabs bloqueados con candado + nota de upgrade interna).

## 3. Cómo se controla

| Mecanismo | Cómo |
|---|---|
| **Tier del bot** | `BOT_TIER = "free" \| "pro"` en `wrangler.toml` → `[vars]` |
| **Panel** | En Pro se ven Análisis/Campañas; en Free se ven bloqueados con candado |
| **Tools** | `catalogQuery` solo existe en Pro; las demás son libres |
| **Nota de upgrade** | La página de upgrade explica cómo activar Pro (sin links externos) |

> Por bot: cada instancia desplegada tiene SU tier. Un bot free y uno pro
> pueden convivir en la misma cuenta con recursos separados.

## 4. Camino a un modelo de pago (roadmap — pendiente de detallar)

Cuando quieras cobrar, las piezas ya preparadas son:

1. **Giros premium como producto.** Crear `src/niches/*.ts` por giro (barbería,
   restaurante, clínica…) y ofrecerlos como el diferenciador de pago
   (patrón: `docs/FLUJOS.md` § Nivel 3).
2. **Licencias por bot.** El tier se decide por bot: el plan pago activa
   `BOT_TIER="pro"` + giros. Opciones:
   - **Simple (hoy):** entregar el repo/config al cliente con su tier y su
     propia Cloudflare (self-host).
   - **Con dashboard central (después):** el bot ya trae `/api/*` (conteos,
     protegido por `CONTROL_PLANE_TOKEN`) y `PEER_BOTS` (selector de proyectos)
     — la base para un panel multibot.
3. **Cobro.** Stripe/Mercado Pago vía el dashboard central (no implementado aún
   — se detalla en una iteración futura).
4. **Blindaje anti-piratería.** Los giros premium pueden vivir en un repo/carpeta
   aparte (`member/` se conserva en updates; los nichos se entregan como archivos
   de config, no como secreto).

## 5. Recomendación (lo simple primero)

1. Sigue con **un solo bot Pro** para ti (internal) y prueba todo.
2. Cuando quieras vender: **cobra por bot desplegado** (instalación +
   configuración + mantenimiento), con el tier pro como "feature".
3. Documenta cada giro como un archivo (`src/niches/`) — el "catálogo" de tu
   oferta. Eso ES el producto.

Detalle de despliegue para producción: [`DESPLIEGUE.md`](./DESPLIEGUE.md).
