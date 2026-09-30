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
  "chrome.proTab": "Disponible en Pro",
  "chrome.switchProject": "Cambiar de proyecto",

  // Pantalla de ingreso
  "login.tagline": "Agentes de IA que atienden tu negocio 24/7 — WhatsApp, Instagram, Messenger y Telegram, desde tu propia infraestructura.",
  "login.panelOf": "Panel de",
  "login.title": "Ingresar",
  "login.userLabel": "Usuario:",
  "login.passwordPlaceholder": "Contraseña",
  "login.submit": "Entrar",

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

  // Tiempo relativo (helpers compartidos)
  "sh.now": "ahora",
  "sh.min": "hace {n} min",
  "sh.hour": "hace {n} h",
  "sh.day": "hace {n} d",

  // ── Mensajes flash / banners / toasts del panel (msg.*) ────────────────────
  // Texto que ve el dueño tras una acción: redirects con ?ok/?err/?websync,
  // banners de sección, toasts de HTMX y errores devueltos por los POST.
  "msg.loginTooManyAttempts": "Demasiados intentos fallidos. Espera {mins} minuto(s) y prueba de nuevo.",
  "msg.loginWrongPassword": "Contraseña incorrecta. Prueba de nuevo.",

  "msg.saved": "✓ Guardado",
  "msg.botNameFallback": "Mi bot",

  // KB / Web sync
  "msg.kbWebSyncSkipped": "omitido: {skipped}",
  "msg.kbWebSyncUpdated": "{updated} actualizadas · {unchanged} sin cambios",
  "msg.kbWebSyncVehicles": "{vehicles} autos",
  "msg.kbWebSyncImagesPending": "{imagesPending} fotos pendientes (se buscan en segundo plano)",
  "msg.kbWebSyncDelta": "{added} nuevos / {removed} salieron / {changed} cambios",
  "msg.kbWebSyncError": "error en {path}: {error}",

  // Scraping
  "msg.scrapingSkipped": "Omitido: {skipped}",
  "msg.scrapingOk": "{added} nuevos · {removed} salieron · {changed} cambios · {vehicles} autos",
  "msg.scrapingErrors": "{n} error(es)",

  // Mi Agente (canvas)
  "msg.agenteUnknownNode": "Nodo desconocido",
  "msg.agenteToolNotFound": "Tool no encontrada",

  // Probar el bot
  "msg.probarEmpty": "escribe un mensaje",

  // Conexiones (fallbacks del banner de error por canal)
  "msg.conexionesErrZernio": "No se pudo validar la API key.",
  "msg.conexionesErrTelegram": "No se pudo validar el token de Telegram.",
  "msg.conexionesErrMl": "No se pudo conectar MercadoLibre.",
  "msg.conexionesErrWaha": "No se pudo conectar con el servidor de WAHA.",
  "msg.conexionesErrVapi": "No se pudo validar la API key de Vapi.",
  "msg.conexionesErrRetell": "No se pudo validar la API key de Retell.",

  "msg.conexionesZernioNoContact": "No se pudo contactar Zernio para validar la API key.",
  "msg.conexionesZernioKeyInvalid": "La API key no es válida (HTTP {status}).",
  "msg.conexionesZernioWebhookRegFail": "API key guardada, pero no pude registrar el webhook en Zernio (HTTP {status}).",
  "msg.conexionesZernioWebhookNoContact": "API key guardada, pero no pude contactar Zernio para registrar el webhook.",

  "msg.conexionesTelegramTokenInvalid": "El token de Telegram no es válido.",
  "msg.conexionesTelegramNoContact": "No se pudo contactar Telegram para validar el token.",
  "msg.conexionesTelegramWebhookFail": "Token guardado, pero no pude registrar el webhook: {error}",
  "msg.conexionesTelegramWebhookErrDefault": "error de Telegram",
  "msg.conexionesTelegramWebhookUnreachable": "no se pudo contactar Telegram",

  "msg.conexionesWahaMissing": "Falta la URL del servidor o la API key de WAHA.",
  "msg.conexionesWahaSavedButError": "Datos guardados, pero {msg}.",
  "msg.conexionesWahaConnectFail": "no pude conectar con WAHA",
  "msg.conexionesWahaRestartError": "No pude reiniciar la sesión: {msg}.",
  "msg.conexionesWahaUnknown": "error desconocido",
  "msg.conexionesWahaNoQr": "No pude generar el QR: la sesión de WAHA no está esperando escaneo (o el servidor no responde). Usa «Reiniciar sesión y generar QR» en la card de WAHA.",

  "msg.conexionesVapiMissing": "Falta la API key de Vapi.",
  "msg.conexionesVapiBadStatus": "Datos guardados, pero Vapi respondió HTTP {status} al validar la API key.",
  "msg.conexionesRetellMissing": "Falta la API key de Retell.",
  "msg.conexionesRetellBadStatus": "Datos guardados, pero Retell respondió HTTP {status} al validar la API key.",

  "msg.conexionesMlMissingCreds": "Primero guarda el App ID y la Secret Key.",

  // Equipo
  "msg.equipoSaved": "Guardado ✓",

  // Licencia
  "msg.licenciaSyncOk": "✓ Sincronizado con el panel ({detail}).",
  "msg.licenciaSyncError": "No pude sincronizar: {detail}. Se conserva el estado anterior.",
  "msg.licenciaRemoved": "Licencia quitada. El bot vuelve al plan gratis.",
  "msg.licenciaEmpty": "Pega un código de licencia.",
  "msg.licenciaInvalid": "Código inválido o vencido. Verifícalo con quien te lo vendió.",
  "msg.licenciaWrongInstance": "Este código es de OTRA instalación. Pide una licencia para este bot específico.",
  "msg.licenciaValidUntil": "válido hasta {date}",
  "msg.licenciaForever": "para siempre",
  "msg.licenciaActivated": "✓ Pro activado ({kind}, {detail}). Límites quitados.",

  // Automatizaciones
  "msg.automationsKeywordsRequired": "keywords y mensaje son obligatorios",
  "msg.automationsLimit": "Límite gratis de reglas alcanzado ({used}/{limit}). Activa Pro en Licencia para quitarlo.",
  "msg.automationsRuleNotFound": "regla no encontrada",

  // Campañas
  "msg.campaignsMissingFields": "Falta el segmento, el nombre de campaña, o un mensaje/plantilla.",
  "msg.campaignsInvalidJson": "Las variables no son JSON válido.",

  // Configuración
  "msg.configReportNoChannel": "No hay ningún canal configurado (Telegram o correo). Revisa Conexiones y los secrets.",
  "msg.configHandoffNoTemplate": "sin plantilla — corre el setup primero",

  // Comentarios
  "msg.commentsMissingData": "Faltan datos para responder.",
  "msg.commentsDailyLimit": "Tope diario de respuestas públicas alcanzado ({n}/24h). Se omite para no inundar el público.",
  "msg.commentsReplySent": "Respuesta pública enviada.",
  "msg.commentsReplyError": "No se pudo responder: {error}",
  "msg.commentsDmMissingData": "Faltan datos para enviar el DM.",
  "msg.commentsDmSent": "DM enviado.",
  "msg.commentsDmConsumed": "Instagram ya había usado la respuesta privada de ese comentario (solo se permite una).",
  "msg.commentsDmError": "No se pudo enviar el DM: {error}",
  "msg.commentsSuggestError": "No se pudo generar una sugerencia. Escribí la respuesta a mano.",

  // Conversaciones
  "msg.conversationsEmptyMessage": "Escribe un mensaje primero.",
  "msg.conversationsNotFound": "✗ Conversación no encontrada.",
  "msg.conversationsSendError": "✗ No se pudo enviar: {error}",
  "msg.conversationsSent": "✓ Enviado por {channel}",

  // Taxis (elegir conductor desde el chat)
  "msg.taxiPickDriver": "Elegí un conductor.",
  "msg.taxiDriverNotFound": "✗ Conductor no encontrado.",
  "msg.taxiTripNoAssign": "✗ El viaje no acepta la asignación.",

  // Avisos push (PWA)
  "msg.pushFallbackBody": "Tienes una novedad en el panel.",
  "msg.pushTestTitle": "Prueba ✓",
  "msg.pushTestBody": "Los avisos funcionan en este dispositivo.",

  // Página no encontrada (404)
  "msg.notFoundTitle": "No encontrado",
  "msg.notFoundBody": "Página no encontrada.",
} as const;
