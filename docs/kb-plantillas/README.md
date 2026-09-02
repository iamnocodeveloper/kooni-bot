# Plantillas de base de conocimiento

Documentos listos para **pegar en el panel** → `/admin` → Conocimiento →
**Nuevo documento** (título + contenido). Se indexan al guardar y el bot los usa
vía `searchKb`.

Estos NO se cargan solos: son plantillas. Copia el que te sirva, ajústalo a tu
negocio y pégalo. La KB del panel vive en D1 (tabla `kb_docs`), se edita desde
`/admin/kb` y sobrevive los `kooni-bot update`.

| Archivo | Para qué |
|---|---|
| `que-es-kooni.md` | Explica el servicio de montar chatbots de IA (Kooni). |
| `planes-y-precios.md` | Planes y precios de la licencia de Kooni. |
| `canales-y-costos.md` | Canales que conecta y costo de infraestructura. |
| `faq-kooni.md` | Preguntas frecuentes sobre Kooni. |

> Antes vivían en `member/kb/` (fragmentos precargados del repo). Se movieron
> aquí porque ese contenido es específico de quien revende Kooni, no del
> template — y desde el panel se edita, desde el repo no.
