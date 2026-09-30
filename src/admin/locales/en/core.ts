import type { es } from "../es/core";

export const en: Record<keyof typeof es, string> = {
  "nav.overview": "Overview",
  "nav.conversations": "Conversations",
  "nav.comentarios": "Comments",
  "nav.contactos": "Contacts",
  "nav.leads": "Leads",
  "nav.tickets": "Tickets",
  "nav.agente": "Flow",
  "nav.probar": "Test the bot",
  "nav.comandos": "Commands",
  "nav.equipo": "Team",
  "nav.automatizaciones": "Automations",
  "nav.kb": "Knowledge",
  "nav.mejoras": "Improvements",
  "nav.campanas": "Campaigns",
  "nav.conexiones": "Connections",
  "nav.licencia": "License",
  "nav.config": "Settings",
  "nav.extras": "Skills",
  "nav.insights": "Insights",
  "nav.stats": "Statistics",
  "nav.scraping": "Scraping",
  "nav.costs": "Costs",
  "nav.auditoria": "Audit log",

  "navSec.inicio": "Home",
  "navSec.inbox": "Inbox",
  "navSec.agente": "My Agent",
  "navSec.extras": "Extras",
  "navSec.analisis": "Analytics",

  "chrome.online": "BOT ONLINE",
  "chrome.logout": "Sign out",
  "chrome.logoutTitle": "Sign out and return to the login screen",
  "chrome.theme": "Toggle light/dark theme",
  "chrome.menu": "Open menu",
  "chrome.push": "Notifications on this device",
  "chrome.panelBot": "Bot panel",
  "chrome.session": "active session",
  "chrome.lang": "Language",
  "chrome.langLabel": "Panel language",
  "chrome.proTab": "Available in Pro",
  "chrome.switchProject": "Switch project",

  "login.tagline": "AI agents that handle your business 24/7 — WhatsApp, Instagram, Messenger and Telegram, from your own infrastructure.",
  "login.panelOf": "Panel for",
  "login.title": "Sign in",
  "login.userLabel": "User:",
  "login.passwordPlaceholder": "Password",
  "login.submit": "Sign in",

  "common.save": "Save",
  "common.saving": "Saving…",
  "common.loading": "Loading…",
  "common.view": "view",
  "common.viewing": "viewing",
  "common.run": "Run",
  "common.all": "All",
  "common.none": "None",
  "common.yes": "Yes",
  "common.no": "No",

  "sh.now": "now",
  "sh.min": "{n} min ago",
  "sh.hour": "{n} h ago",
  "sh.day": "{n} d ago",

  // ── Panel flash / banner / toast messages (msg.*) ──────────────────────────
  "msg.loginTooManyAttempts": "Too many failed attempts. Wait {mins} minute(s) and try again.",
  "msg.loginWrongPassword": "Incorrect password. Try again.",

  "msg.saved": "✓ Saved",
  "msg.botNameFallback": "My bot",

  // KB / Web sync
  "msg.kbWebSyncSkipped": "skipped: {skipped}",
  "msg.kbWebSyncUpdated": "{updated} updated · {unchanged} unchanged",
  "msg.kbWebSyncVehicles": "{vehicles} cars",
  "msg.kbWebSyncImagesPending": "{imagesPending} photos pending (fetched in the background)",
  "msg.kbWebSyncDelta": "{added} new / {removed} gone / {changed} changed",
  "msg.kbWebSyncError": "error at {path}: {error}",

  // Scraping
  "msg.scrapingSkipped": "Skipped: {skipped}",
  "msg.scrapingOk": "{added} new · {removed} gone · {changed} changed · {vehicles} cars",
  "msg.scrapingErrors": "{n} error(s)",

  // My Agent (canvas)
  "msg.agenteUnknownNode": "Unknown node",
  "msg.agenteToolNotFound": "Tool not found",

  // Test the bot
  "msg.probarEmpty": "type a message",

  // Connections (per-channel error banner fallbacks)
  "msg.conexionesErrZernio": "Could not validate the API key.",
  "msg.conexionesErrTelegram": "Could not validate the Telegram token.",
  "msg.conexionesErrMl": "Could not connect to MercadoLibre.",
  "msg.conexionesErrWaha": "Could not connect to the WAHA server.",
  "msg.conexionesErrVapi": "Could not validate the Vapi API key.",
  "msg.conexionesErrRetell": "Could not validate the Retell API key.",

  "msg.conexionesZernioNoContact": "Could not reach Zernio to validate the API key.",
  "msg.conexionesZernioKeyInvalid": "The API key is not valid (HTTP {status}).",
  "msg.conexionesZernioWebhookRegFail": "API key saved, but I couldn't register the webhook in Zernio (HTTP {status}).",
  "msg.conexionesZernioWebhookNoContact": "API key saved, but I couldn't reach Zernio to register the webhook.",

  "msg.conexionesTelegramTokenInvalid": "The Telegram token is not valid.",
  "msg.conexionesTelegramNoContact": "Could not reach Telegram to validate the token.",
  "msg.conexionesTelegramWebhookFail": "Token saved, but I couldn't register the webhook: {error}",
  "msg.conexionesTelegramWebhookErrDefault": "Telegram error",
  "msg.conexionesTelegramWebhookUnreachable": "could not reach Telegram",

  "msg.conexionesWahaMissing": "Missing the WAHA server URL or API key.",
  "msg.conexionesWahaSavedButError": "Data saved, but {msg}.",
  "msg.conexionesWahaConnectFail": "I couldn't connect to WAHA",
  "msg.conexionesWahaRestartError": "I couldn't restart the session: {msg}.",
  "msg.conexionesWahaUnknown": "unknown error",
  "msg.conexionesWahaNoQr": "I couldn't generate the QR: the WAHA session isn't waiting for a scan (or the server isn't responding). Use «Restart session and generate QR» on the WAHA card.",

  "msg.conexionesVapiMissing": "Missing the Vapi API key.",
  "msg.conexionesVapiBadStatus": "Data saved, but Vapi responded HTTP {status} when validating the API key.",
  "msg.conexionesRetellMissing": "Missing the Retell API key.",
  "msg.conexionesRetellBadStatus": "Data saved, but Retell responded HTTP {status} when validating the API key.",

  "msg.conexionesMlMissingCreds": "First save the App ID and the Secret Key.",

  // Team
  "msg.equipoSaved": "Saved ✓",

  // License
  "msg.licenciaSyncOk": "✓ Synced with the panel ({detail}).",
  "msg.licenciaSyncError": "I couldn't sync: {detail}. The previous state is kept.",
  "msg.licenciaRemoved": "License removed. The bot goes back to the free plan.",
  "msg.licenciaEmpty": "Paste a license code.",
  "msg.licenciaInvalid": "Invalid or expired code. Check it with whoever sold it to you.",
  "msg.licenciaWrongInstance": "This code belongs to ANOTHER installation. Ask for a license for this specific bot.",
  "msg.licenciaValidUntil": "valid until {date}",
  "msg.licenciaForever": "forever",
  "msg.licenciaActivated": "✓ Pro activated ({kind}, {detail}). Limits removed.",

  // Automations
  "msg.automationsKeywordsRequired": "keywords and message are required",
  "msg.automationsLimit": "Free rule limit reached ({used}/{limit}). Activate Pro in License to remove it.",
  "msg.automationsRuleNotFound": "rule not found",

  // Campaigns
  "msg.campaignsMissingFields": "Missing the segment, the campaign name, or a message/template.",
  "msg.campaignsInvalidJson": "The variables are not valid JSON.",

  // Settings
  "msg.configReportNoChannel": "No channel is configured (Telegram or email). Check Connections and the secrets.",
  "msg.configHandoffNoTemplate": "no template — run the setup first",

  // Comments
  "msg.commentsMissingData": "Missing data to reply.",
  "msg.commentsDailyLimit": "Daily limit of public replies reached ({n}/24h). Skipped to avoid flooding the public.",
  "msg.commentsReplySent": "Public reply sent.",
  "msg.commentsReplyError": "Could not reply: {error}",
  "msg.commentsDmMissingData": "Missing data to send the DM.",
  "msg.commentsDmSent": "DM sent.",
  "msg.commentsDmConsumed": "Instagram had already used the private reply for that comment (only one is allowed).",
  "msg.commentsDmError": "Could not send the DM: {error}",
  "msg.commentsSuggestError": "Could not generate a suggestion. Write the reply by hand.",

  // Conversations
  "msg.conversationsEmptyMessage": "Type a message first.",
  "msg.conversationsNotFound": "✗ Conversation not found.",
  "msg.conversationsSendError": "✗ Could not send: {error}",
  "msg.conversationsSent": "✓ Sent via {channel}",

  // Taxis (pick a driver from the chat)
  "msg.taxiPickDriver": "Pick a driver.",
  "msg.taxiDriverNotFound": "✗ Driver not found.",
  "msg.taxiTripNoAssign": "✗ The trip doesn't accept the assignment.",

  // Push notifications (PWA)
  "msg.pushFallbackBody": "You have a new update in the panel.",
  "msg.pushTestTitle": "Test ✓",
  "msg.pushTestBody": "Notifications work on this device.",

  // Not found (404)
  "msg.notFoundTitle": "Not found",
  "msg.notFoundBody": "Page not found.",
};
