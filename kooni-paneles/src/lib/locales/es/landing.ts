// Área landing pública: /giros y /giros/:id (marca, grilla, página del giro,
// demo simulado y cierre). El nombre y la descripción de cada giro NO van acá:
// se reusan `pla.giro.<id>.name` / `.desc` de client.ts. El guion del demo vive
// en src/lib/demos/*.ts (estructuras es/en equivalentes).
export const landingEs = {
  // ── Barra superior y pie ────────────────────────────────────────────────
  "lp.brand.tagline": "Tu negocio, atendido siempre.",
  "lp.nav.all": "Ver todos los giros",
  "lp.footer.note":
    "Kooni vive en tu propia nube de Cloudflare, con tu llave de IA. Esta página es pública y el chat de abajo es una demostración guionada.",

  // ── Grilla /giros ───────────────────────────────────────────────────────
  "lp.grid.title": "Elegí el giro de tu negocio",
  "lp.grid.subtitle":
    "Cada giro es un producto entero: tu bot sale con su panel a la medida, su playbook y su tono. Mirá el demo y copiá el comando.",
  "lp.grid.viewDemo": "Ver el demo",
  "lp.grid.installLabel": "Se instala con un comando",

  // ── Página del giro: hero ───────────────────────────────────────────────
  "lp.hero.eyebrow": "Kooni para {giro}",
  "lp.hero.installLabel": "Instalá este giro con un comando",
  "lp.hero.demo": "Agendá una demo real de 15 min",
  "lp.hero.trust": "Tu bot queda en tu Cloudflare, con tus datos y tu llave de IA.",

  // ── Copiar al portapapeles ──────────────────────────────────────────────
  "lp.copy.cmd": "Copiar comando",
  "lp.copy.done": "¡Copiado!",
  "lp.copy.error": "No se pudo copiar. Copiá el comando a mano.",

  // ── Secciones ───────────────────────────────────────────────────────────
  "lp.sec.queHace": "Qué hace, en concreto",
  "lp.sec.demoTitle": "Así contesta, por dentro",
  "lp.sec.demoSub":
    "El flujo real del playbook, con datos de ejemplo. Es una demostración: no hay backend ni WhatsApp conectado.",
  "lp.sec.installTitle": "Cómo se instala",
  "lp.sec.installSub": "Tres pasos, en la carpeta donde vive tu bot.",
  "lp.sec.otherTitle": "Otros giros",

  // ── Los 3 pasos ─────────────────────────────────────────────────────────
  "lp.step.1.title": "Conectá el CLI a tu cuenta",
  "lp.step.1.desc": "Corré el comando y entrá en el navegador: la máquina queda autorizada.",
  "lp.step.2.title": "Instalá el giro",
  "lp.step.2.desc":
    "En la carpeta de tu bot. Re-etiqueta el panel del bot y carga el playbook de {giro}.",
  "lp.step.3.title": "Revisá y abrí tu panel",
  "lp.step.3.desc":
    "Dejá el chequeo en verde y entrá a tu panel: ahí ves las conversaciones, los leads y lo que Kooni necesita que mires.",
  "lp.step.openPanel": "Abrir el panel",
  "lp.step.note": "Tus datos, tus conversaciones y tu configuración se quedan con vos.",

  // ── Demo simulado ───────────────────────────────────────────────────────
  "lp.demo.contact": "Kooni · {giro}",
  "lp.demo.online": "en línea",
  "lp.demo.typing": "escribiendo…",
  "lp.demo.replay": "Reiniciar demo",
  "lp.demo.disclaimer": "Demostración. En tu bot es WhatsApp real con tu información.",
  "lp.demo.aria.phone": "Celular de muestra con una conversación de ejemplo",
  "lp.demo.aria.log": "Conversación de ejemplo",
  "lp.demo.aria.replay": "Reiniciar la conversación de ejemplo",
  "lp.demo.from.client": "Cliente:",
  "lp.demo.from.bot": "Kooni:",

  // ── Cierre ──────────────────────────────────────────────────────────────
  "lp.close.title": "Tu bot vive en tu propia nube de Cloudflare",
  "lp.close.body":
    "No inventa datos: contesta con tu información (tus precios, tu catálogo, tus reglas) y te avisa cuando algo necesita a una persona.",
  "lp.close.contactTitle": "¿Te muestro el panel en 15 minutos?",
  "lp.close.contactBody":
    "Te enseño este mismo giro con tus datos, sin compromiso. Escribime y coordinamos.",
  "lp.close.mailLink": "Escribir a {email}",
  "lp.close.mailSubject": "Quiero la demo de 15 min de Kooni ({giro})",
  "lp.close.backGrid": "Ver todos los giros",

  // ── Por giro: el dolor en una frase y 4 bullets concretos ───────────────
  "lp.giro.generico.pain":
    "Cada mensaje sin contestar es un cliente que se va con otro. Kooni atiende al instante, 24/7, con la información de tu negocio.",
  "lp.giro.generico.b1":
    "Contesta lo de siempre —horario, precios, cómo llegar— sin que lo escribas vos.",
  "lp.giro.generico.b2":
    "Pide nombre y contacto de quien pregunta, y te lo deja listo para llamar.",
  "lp.giro.generico.b3":
    "Cuando la conversación se pone seria, te avisa y le pasa el chat a una persona.",
  "lp.giro.generico.b4":
    "Aprende de tus documentos: precios, catálogo, políticas, lo que le cargues.",

  "lp.giro.agencia-ia.pain":
    "Tu prospecto ya está en el chat: calificado, con presupuesto y con la llamada de diagnóstico agendada.",
  "lp.giro.agencia-ia.b1":
    "Califica de verdad: qué necesita, para cuándo y cuánto puede invertir.",
  "lp.giro.agencia-ia.b2":
    "Explica tus servicios y tus rangos de precio sin sonar a menú telefónico.",
  "lp.giro.agencia-ia.b3":
    "Deja el resumen del lead (dolor, alcance, presupuesto) en tu panel.",
  "lp.giro.agencia-ia.b4":
    "Agenda la llamada de diagnóstico y te avisa con el contexto ya escrito.",

  "lp.giro.restaurante.pain":
    "El teléfono suena en hora pico y no alcanza nadie: el bot toma pedidos y reservas mientras tu gente cocina.",
  "lp.giro.restaurante.b1": "Pasa el menú del día con precios y avisa qué se acabó.",
  "lp.giro.restaurante.b2":
    "Toma pedidos para recoger o a domicilio, con dirección y notas.",
  "lp.giro.restaurante.b3": "Reserva mesa: día, hora y cuántas personas.",
  "lp.giro.restaurante.b4":
    "Confirma y recuerda la reserva para que bajen los plantones.",

  "lp.giro.inmobiliaria.pain":
    "De 20 mensajes, 3 son reales. Kooni filtra, agenda la visita y te entrega al prospecto con zona y presupuesto claros.",
  "lp.giro.inmobiliaria.b1":
    "Pregunta una cosa a la vez: operación, zona, presupuesto y recámaras.",
  "lp.giro.inmobiliaria.b2":
    "Muestra solo las propiedades que encajan y responde por cada una.",
  "lp.giro.inmobiliaria.b3":
    "Agenda la visita y pasa el contacto al asesor con el resumen de la conversación.",
  "lp.giro.inmobiliaria.b4":
    "No suelta un precio ni una fecha que no esté en tu inventario.",

  "lp.giro.clinica.pain":
    "La cita queda agendada, el recordatorio sale solo y tu recepción se dedica al paciente que está enfrente.",
  "lp.giro.clinica.b1": "Toma la cita con día, hora y motivo, y confirma el espacio.",
  "lp.giro.clinica.b2": "Recuerda la cita y baja los pacientes que no llegan.",
  "lp.giro.clinica.b3":
    "Contesta horarios, ubicación, precio de la consulta y qué llevar a la primera visita.",
  "lp.giro.clinica.b4":
    "No diagnostica: si el síntoma suena grave, escala a una persona en el momento.",

  "lp.giro.barberia.pain":
    "Una silla vacía no se recupera. El bot llena tu agenda entre corte y corte, sin que sueltes la máquina.",
  "lp.giro.barberia.b1": "Muestra servicios, precios y cuánto dura cada uno.",
  "lp.giro.barberia.b2": "Agenda por barbero y por hora, y evita citas encimadas.",
  "lp.giro.barberia.b3": "Recuerda la cita un día antes: los no-shows bajan.",
  "lp.giro.barberia.b4":
    "Ofrece el siguiente espacio libre cuando te piden a última hora.",

  "lp.giro.eventos.pain":
    "En temporada alta no das abasto: el bot cotiza solo, te deja la fecha en el panel y no pierde al cliente que pregunta un domingo.",
  "lp.giro.eventos.b1": "Cotiza por WhatsApp: paquetes, precio por horas, qué incluye y traslado por zona.",
  "lp.giro.eventos.b2": "Pregunta lo que importa: qué se celebra, qué día, dónde, qué equipo y cuántos invitados.",
  "lp.giro.eventos.b3": "Deja cada cotización en el panel con evento, fecha, equipo y personas.",
  "lp.giro.eventos.b4":
    "Nunca promete una fecha por su cuenta: aparta la pre-reserva y una persona confirma el anticipo.",

  "lp.giro.cartera.pain":
    "Cobrar tarde cuesta caro. El bot le recuerda a cada cliente con voz firme y amable, y te trae promesas de pago.",
  "lp.giro.cartera.b1": "Recuerda el saldo vencido con el monto y los días exactos.",
  "lp.giro.cartera.b2":
    "Registra la promesa de pago (cuándo y cuánto) y te la deja en la lista.",
  "lp.giro.cartera.b3":
    "Manda los datos de pago y guarda el comprobante que le pasen.",
  "lp.giro.cartera.b4":
    "Lo que no se resuelve en el chat pasa a tu mesa con el historial completo.",

  "lp.giro.taxis.pain":
    "Mientras vos conducís, alguien más contesta: ubicación, tarifa y la unidad asignada.",
  "lp.giro.taxis.b1": "Pide origen y destino con referencias claras.",
  "lp.giro.taxis.b2": "Cotiza con tu tarifa y confirma el viaje antes de mover la unidad.",
  "lp.giro.taxis.b3": "Reparte el viaje al conductor más cercano según la zona.",
  "lp.giro.taxis.b4":
    "Le dice al cliente quién va, en qué unidad y en cuánto llega.",
} as const;
