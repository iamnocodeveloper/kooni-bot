// Super admin — grupo B. Claves `admin.*` de las páginas asignadas.
export const adminBEs = {
  // AdminDashboard
  "admin.dashboard.title": "Resumen",
  "admin.dashboard.subtitle":
    "Estado global del sistema de licencias. Solo estadísticas agregadas.",
  "admin.dashboard.kpiClientes": "Clientes",
  "admin.dashboard.kpiPro": "Licencias Pro",
  "admin.dashboard.kpiFree": "Licencias Free",
  "admin.dashboard.kpiInstalaciones": "Instalaciones",
  "admin.dashboard.kpiActivas": "Activas (7d)",
  "admin.dashboard.kpiMensajes": "Mensajes 30d",
  "admin.dashboard.kpiCosto": "Costo IA 30d",

  // AdminClientes
  "admin.clientes.title": "Clientes",
  "admin.clientes.subtitle":
    "Cuentas registradas y su rol. Solo el super admin puede cambiarlo.",
  "admin.clientes.colEmail": "Correo",
  "admin.clientes.colName": "Nombre",
  "admin.clientes.colRole": "Rol",
  "admin.clientes.colAlta": "Alta",
  "admin.clientes.roleCliente": "cliente",
  "admin.clientes.roleRevendedor": "revendedor",
  "admin.clientes.roleAdmin": "admin",

  // AdminFacturacion
  "admin.facturacion.title": "Facturación",
  "admin.facturacion.subtitle":
    "Pagos de Kooni+ y estado de los proveedores. Cada proveedor se activa solo con poner sus secretos.",
  "admin.facturacion.provReady": "listo",
  "admin.facturacion.provMissing": "falta configurar",
  "admin.facturacion.webhook": "Webhook:",
  "admin.facturacion.noProviders": "Sin proveedores.",
  "admin.facturacion.colFecha": "Fecha",
  "admin.facturacion.colCliente": "Cliente",
  "admin.facturacion.colProveedor": "Proveedor",
  "admin.facturacion.colPlan": "Plan",
  "admin.facturacion.colMonto": "Monto",
  "admin.facturacion.colEstado": "Estado",
  "admin.facturacion.empty": "Sin pagos todavía.",
  "admin.facturacion.markPaid": "Marcar pagado",

  // AdminPagos
  "admin.pagos.title": "Configuración de pagos",
  "admin.pagos.subtitle":
    "Pegá las keys de cada proveedor acá. Se activa solo cuando el proveedor está encendido y completo.",
  "admin.pagos.enabled": "Encendido",
  "admin.pagos.modeTest": "Pruebas",
  "admin.pagos.modeLive": "Producción",
  "admin.pagos.saved": "Guardado: {nombre}",
  "admin.pagos.errSave": "No se pudo guardar",
  "admin.pagos.fieldSecretKey": "Secret Key (sk_…)",
  "admin.pagos.fieldWebhookSecret": "Webhook signing secret (whsec_…)",
  "admin.pagos.fieldClientId": "Client ID",
  "admin.pagos.fieldClientSecret": "Client Secret",
  "admin.pagos.fieldWebhookId": "Webhook ID",
  "admin.pagos.fieldToken": "Token",
  "admin.pagos.fieldStoreId": "Store ID",
  "admin.pagos.fieldPayId": "Binance Pay ID / USDT wallet",
  "admin.pagos.fieldInstructions": "Instrucciones para el cliente",

  // AdminRevendedores
  "admin.revendedores.title": "Revendedores",
  "admin.revendedores.subtitlePre":
    "Cuentas marcadas como revendedor (agencias). Promové a alguien desde ",
  "admin.revendedores.subtitleBold": "Clientes",
  "admin.revendedores.subtitlePost":
    " (rol revendedor). Acá ves su cartera y podés devolverlos a cliente.",
  "admin.revendedores.emptyPre": "Todavía no hay revendedores. En ",
  "admin.revendedores.emptyBold": "Clientes",
  "admin.revendedores.emptyPost":
    " cambiá el rol de una cuenta a «revendedor».",
  "admin.revendedores.badge": "revendedor",
  "admin.revendedores.botsOne": "{n} instalación propia",
  "admin.revendedores.botsMany": "{n} instalaciones propias",
  "admin.revendedores.toClient": "Devolver a cliente",

  // AdminSoporte
  "admin.soporte.title": "Soporte",
  "admin.soporte.subtitle":
    "Mensajes de los clientes (dudas/bugs) y la FAQ que ven en su panel.",
  "admin.soporte.colFecha": "Fecha",
  "admin.soporte.colDe": "De",
  "admin.soporte.colAsunto": "Asunto / mensaje",
  "admin.soporte.colEstado": "Estado",
  "admin.soporte.empty": "Sin mensajes de soporte.",
  "admin.soporte.statusNuevo": "nuevo",
  "admin.soporte.statusLeido": "leído",
  "admin.soporte.statusRespondido": "respondido",
  "admin.soporte.faqTitle": "FAQ",
  "admin.soporte.visible": "Visible",

  // AdminEstadisticas
  "admin.estadisticas.title": "Estadísticas",
  "admin.estadisticas.subtitle":
    "Tu operación completa en un solo número: totales, salud y ranking por bot.",
  "admin.estadisticas.kpiMensajes": "Mensajes 30d",
  "admin.estadisticas.kpiLeads": "Leads 30d",
  "admin.estadisticas.kpiCosto": "Costo IA 30d",
  "admin.estadisticas.kpiSalud": "Salud (activos 7d)",
  "admin.estadisticas.colBot": "Bot",
  "admin.estadisticas.colPlan": "Plan",
  "admin.estadisticas.colMensajes": "Mensajes 30d",
  "admin.estadisticas.colLeads": "Leads 30d",
  "admin.estadisticas.colIa": "IA 30d",
  "admin.estadisticas.colUltimoVisto": "Último visto",
  "admin.estadisticas.empty": "Sin instalaciones todavía.",
  "admin.estadisticas.footer":
    "{conDatos} de {total} instalaciones reportan uso. El ranking ordena por mensajes de los últimos 30 días.",

  // AdminAuditoria
  "admin.auditoria.title": "Auditoría",
  "admin.auditoria.subtitle":
    "Cada acción sensible del super admin: quién, qué y cuándo.",
  "admin.auditoria.colCuando": "Cuándo",
  "admin.auditoria.colQuien": "Quién",
  "admin.auditoria.colAccion": "Acción",
  "admin.auditoria.colDetalle": "Detalle",
  "admin.auditoria.empty": "Sin acciones registradas.",

  // AdminEquipo
  "admin.equipo.title": "Equipo (admins)",
  "admin.equipo.subtitle":
    "Quién puede entrar a este super admin. Promové a una cuenta ya registrada escribiendo su correo.",
  "admin.equipo.emailLabel": "Correo de la cuenta",
  "admin.equipo.emailPlaceholder": "alguien@ejemplo.com",
  "admin.equipo.makeAdmin": "Hacer admin",
  "admin.equipo.errNotFound":
    "No encontré esa cuenta. La persona debe registrarse primero en el panel.",
  "admin.equipo.promoted": "Ahora es admin: {email}",
  "admin.equipo.colEmail": "Correo",
  "admin.equipo.colName": "Nombre",
  "admin.equipo.colRole": "Rol",
  "admin.equipo.empty": "Sin admins (además de vos).",
  "admin.equipo.badgeAdmin": "admin",
  "admin.equipo.removeAdmin": "Quitar admin",

  // AdminConfig
  "admin.config.title": "Configuración",
  "admin.config.subtitle":
    "Ajustes generales de la plataforma: URL del sitio, soporte, marca y textos legales.",
  "admin.config.saved": "Guardado ✓",
} as const;
