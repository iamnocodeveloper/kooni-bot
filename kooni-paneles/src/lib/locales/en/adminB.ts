import type { adminBEs } from "../es/adminB";

export const adminBEn: Record<keyof typeof adminBEs, string> = {
  // AdminDashboard
  "admin.dashboard.title": "Overview",
  "admin.dashboard.subtitle":
    "Global status of the licensing system. Aggregate statistics only.",
  "admin.dashboard.kpiClientes": "Customers",
  "admin.dashboard.kpiPro": "Pro licenses",
  "admin.dashboard.kpiFree": "Free licenses",
  "admin.dashboard.kpiInstalaciones": "Installations",
  "admin.dashboard.kpiActivas": "Active (7d)",
  "admin.dashboard.kpiMensajes": "Messages 30d",
  "admin.dashboard.kpiCosto": "AI cost 30d",

  // AdminClientes
  "admin.clientes.title": "Customers",
  "admin.clientes.subtitle":
    "Registered accounts and their role. Only the super admin can change it.",
  "admin.clientes.colEmail": "Email",
  "admin.clientes.colName": "Name",
  "admin.clientes.colRole": "Role",
  "admin.clientes.colAlta": "Joined",
  "admin.clientes.roleCliente": "customer",
  "admin.clientes.roleRevendedor": "reseller",
  "admin.clientes.roleAdmin": "admin",

  // AdminFacturacion
  "admin.facturacion.title": "Billing",
  "admin.facturacion.subtitle":
    "Kooni+ payments and provider status. Each provider is enabled just by setting its secrets.",
  "admin.facturacion.provReady": "ready",
  "admin.facturacion.provMissing": "not configured",
  "admin.facturacion.webhook": "Webhook:",
  "admin.facturacion.noProviders": "No providers.",
  "admin.facturacion.colFecha": "Date",
  "admin.facturacion.colCliente": "Customer",
  "admin.facturacion.colProveedor": "Provider",
  "admin.facturacion.colPlan": "Plan",
  "admin.facturacion.colMonto": "Amount",
  "admin.facturacion.colEstado": "Status",
  "admin.facturacion.empty": "No payments yet.",
  "admin.facturacion.markPaid": "Mark as paid",

  // AdminPagos
  "admin.pagos.title": "Payment settings",
  "admin.pagos.subtitle":
    "Paste each provider's keys here. It's enabled only once the provider is on and complete.",
  "admin.pagos.enabled": "Enabled",
  "admin.pagos.modeTest": "Test",
  "admin.pagos.modeLive": "Production",
  "admin.pagos.saved": "Saved: {nombre}",
  "admin.pagos.errSave": "Couldn't save",
  "admin.pagos.fieldSecretKey": "Secret Key (sk_…)",
  "admin.pagos.fieldWebhookSecret": "Webhook signing secret (whsec_…)",
  "admin.pagos.fieldClientId": "Client ID",
  "admin.pagos.fieldClientSecret": "Client Secret",
  "admin.pagos.fieldWebhookId": "Webhook ID",
  "admin.pagos.fieldToken": "Token",
  "admin.pagos.fieldStoreId": "Store ID",
  "admin.pagos.fieldPayId": "Binance Pay ID / USDT wallet",
  "admin.pagos.fieldInstructions": "Instructions for the customer",

  // AdminRevendedores
  "admin.revendedores.title": "Resellers",
  "admin.revendedores.subtitlePre":
    "Accounts flagged as resellers (agencies). Promote someone from ",
  "admin.revendedores.subtitleBold": "Customers",
  "admin.revendedores.subtitlePost":
    " (reseller role). Here you see their portfolio and can turn them back into customers.",
  "admin.revendedores.emptyPre": "There are no resellers yet. In ",
  "admin.revendedores.emptyBold": "Customers",
  "admin.revendedores.emptyPost":
    " change an account's role to «reseller».",
  "admin.revendedores.badge": "reseller",
  "admin.revendedores.botsOne": "{n} owned installation",
  "admin.revendedores.botsMany": "{n} owned installations",
  "admin.revendedores.toClient": "Revert to customer",

  // AdminSoporte
  "admin.soporte.title": "Support",
  "admin.soporte.subtitle":
    "Customer messages (questions/bugs) and the FAQ they see in their panel.",
  "admin.soporte.colFecha": "Date",
  "admin.soporte.colDe": "From",
  "admin.soporte.colAsunto": "Subject / message",
  "admin.soporte.colEstado": "Status",
  "admin.soporte.empty": "No support messages.",
  "admin.soporte.statusNuevo": "new",
  "admin.soporte.statusLeido": "read",
  "admin.soporte.statusRespondido": "replied",
  "admin.soporte.faqTitle": "FAQ",
  "admin.soporte.visible": "Visible",

  // AdminEstadisticas
  "admin.estadisticas.title": "Statistics",
  "admin.estadisticas.subtitle":
    "Your whole operation in a single view: totals, health and ranking by bot.",
  "admin.estadisticas.kpiMensajes": "Messages 30d",
  "admin.estadisticas.kpiLeads": "Leads 30d",
  "admin.estadisticas.kpiCosto": "AI cost 30d",
  "admin.estadisticas.kpiSalud": "Health (active 7d)",
  "admin.estadisticas.colBot": "Bot",
  "admin.estadisticas.colPlan": "Plan",
  "admin.estadisticas.colMensajes": "Messages 30d",
  "admin.estadisticas.colLeads": "Leads 30d",
  "admin.estadisticas.colIa": "AI 30d",
  "admin.estadisticas.colUltimoVisto": "Last seen",
  "admin.estadisticas.empty": "No installations yet.",
  "admin.estadisticas.footer":
    "{conDatos} of {total} installations report usage. The ranking is ordered by messages from the last 30 days.",

  // AdminAuditoria
  "admin.auditoria.title": "Audit log",
  "admin.auditoria.subtitle":
    "Every sensitive super admin action: who, what and when.",
  "admin.auditoria.colCuando": "When",
  "admin.auditoria.colQuien": "Who",
  "admin.auditoria.colAccion": "Action",
  "admin.auditoria.colDetalle": "Detail",
  "admin.auditoria.empty": "No actions recorded.",

  // AdminEquipo
  "admin.equipo.title": "Team (admins)",
  "admin.equipo.subtitle":
    "Who can access this super admin. Promote an already-registered account by typing its email.",
  "admin.equipo.emailLabel": "Account email",
  "admin.equipo.emailPlaceholder": "someone@example.com",
  "admin.equipo.makeAdmin": "Make admin",
  "admin.equipo.errNotFound":
    "I couldn't find that account. The person must sign up in the panel first.",
  "admin.equipo.promoted": "Now an admin: {email}",
  "admin.equipo.colEmail": "Email",
  "admin.equipo.colName": "Name",
  "admin.equipo.colRole": "Role",
  "admin.equipo.empty": "No admins (besides you).",
  "admin.equipo.badgeAdmin": "admin",
  "admin.equipo.removeAdmin": "Remove admin",

  // AdminConfig
  "admin.config.title": "Settings",
  "admin.config.subtitle":
    "General platform settings: site URL, support, brand and legal texts.",
  "admin.config.saved": "Saved ✓",
};
