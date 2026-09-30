// Diccionario del panel del bot (claves planas `area.clave`). El ESPAÑOL es la
// fuente de verdad y el default: si `panel_language` no está seteado, el panel
// se ve exactamente igual que siempre (los tests que esperan textos en español
// siguen pasando). El inglés debe cubrir TODAS las claves (lo garantiza el tipo).
export const es = {
  // ── Navegación ─────────────────────────────────────────────────────────────
  "nav.overview": "Resumen",
  "nav.conversations": "Conversaciones",
  "nav.comentarios": "Comentarios",
  "nav.contactos": "Contactos",
  "nav.leads": "Leads",
  "nav.tickets": "Tickets",
  "nav.agente": "Flujo",
  "nav.probar": "Probar el bot",
  "nav.comandos": "Comandos",
  "nav.equipo": "Equipo",
  "nav.automatizaciones": "Automatizaciones",
  "nav.kb": "Conocimiento",
  "nav.mejoras": "Mejoras",
  "nav.campanas": "Campañas",
  "nav.conexiones": "Conexiones",
  "nav.licencia": "Licencia",
  "nav.config": "Configuración",
  "nav.extras": "Habilidades",
  "nav.insights": "Insights",
  "nav.stats": "Estadísticas",
  "nav.scraping": "Scraping",
  "nav.costs": "Costos",
  "nav.auditoria": "Auditoría",

  // Secciones del sidebar
  "navSec.inicio": "Inicio",
  "navSec.inbox": "Inbox",
  "navSec.agente": "Mi Agente",
  "navSec.extras": "Extras",
  "navSec.analisis": "Análisis",

  // ── Chrome del layout ──────────────────────────────────────────────────────
  "chrome.online": "BOT EN LÍNEA",
  "chrome.logout": "Cerrar sesión",
  "chrome.logoutTitle": "Cerrar sesión y volver a la pantalla de ingreso",
  "chrome.theme": "Cambiar tema claro/oscuro",
  "chrome.menu": "Abrir menú",
  "chrome.push": "Avisos en este dispositivo",
  "chrome.panelBot": "Panel del bot",
  "chrome.session": "sesión activa",
  "chrome.lang": "Idioma",
  "chrome.langLabel": "Idioma del panel",

  // ── Comunes ────────────────────────────────────────────────────────────────
  "common.save": "Guardar",
  "common.saving": "Guardando…",
  "common.loading": "Cargando…",
  "common.view": "ver",
  "common.viewing": "viendo",
  "common.run": "Correr",
  "common.all": "Todos",
  "common.none": "Ninguno",
  "common.yes": "Sí",
  "common.no": "No",
} as const;
