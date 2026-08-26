# Documentación de Kooni

| Doc | Contenido |
|---|---|
| [`IDENTIDAD-KOONI.md`](./IDENTIDAD-KOONI.md) | Marca: nombre, paleta, tipografía, logo, voz y reglas de uso. |
| [`ARQUITECTURA.md`](./ARQUITECTURA.md) | Cómo funciona el bot por dentro (piezas, flujo, DB, canales, nichos, cron). |
| [`FLUJOS.md`](./FLUJOS.md) | **Agentes, flujos dinámicos y automatizaciones** — la guía para crear/replicar flujos DM y contenido. |
| [`DESPLIEGUE.md`](./DESPLIEGUE.md) | Despliegue paso a paso: recursos Cloudflare, secrets, canales, KB. |
| [`USO.md`](./USO.md) | El panel `/admin` y el día a día (bandeja, KB, conexiones, análisis). |
| [`PRUEBA-LOCAL.md`](./PRUEBA-LOCAL.md) | **Runbook local**: arrancar `wrangler dev`, probar canales y un flujo de IA real, verificar en D1. |
| [`PLANES.md`](./PLANES.md) | **Free vs Pro** (la lógica de Forja): qué desbloquea cada tier y camino al modelo de pago. |
| `scripts/kooni-init.sh` | **Instalador interactivo**: te pregunta todo y escribe `.dev.vars`/`wrangler.toml`/`member`; modos `local` y `deploy`. |
| [`design-system.md`](./design-system.md) | Contrato visual del panel (tokens, componentes, tipografía) — para devs. |

Guías de conexión de canales: [`skill/references/channel-setup-guides/`](../skill/references/channel-setup-guides/).

Origen: proyecto derivado de **Forja** (MIT © Horizontes IA) — ver [`LICENSE`](../LICENSE).
