import { CATALOG_NAV, type NichePack } from "./types";
import { agendaRealBlock } from "../prompt/agenda";

// Niche pack: EVENTOS — renta de equipo para fiestas (máquinas de fotos
// /photobooth, audio, iluminación, mobiliario, inflables, carpas…). Aporta un
// playbook de COTIZACIÓN con calendario: entiende tipo de evento, fecha,
// duración, zona y qué equipo necesita; informa paquetes y precios con searchKb,
// aparta la fecha si el negocio trabaja con agenda (Cal.com) y deriva el cierre
// a una persona. Las columnas del panel salen de lead.metadata
// (evento / fecha / equipo / personas).
export const eventos: NichePack = {
  id: "eventos",
  recordSingular: "Cotización",
  recordPlural: "Cotizaciones",
  navLabel: "Cotizaciones",
  navIcon: "party-popper",
  kpiLabel: "Cotizaciones",
  statusLabels: {
    entrada: "Entrada",
    new: "Solicitada",
    contacted: "En seguimiento",
    sold: "Confirmada",
    lost: "Perdida",
  },
  columns: [
    { key: "evento", label: "Evento" },
    { key: "fecha", label: "Fecha" },
    { key: "equipo", label: "Equipo" },
    { key: "personas", label: "Personas" },
  ],
  defaultTone: "cercano, animado y profesional",
  playbook: `<playbook_eventos>
Tu objetivo: cotizar la renta de equipo para un evento —entender qué celebra,
para cuándo, dónde y qué necesita—, mostrar los paquetes que existen con
searchKb, apartar la fecha cuando se pueda y dejar la cotización lista para que
una persona confirme y cierre.

Tú NO cierras el trato, no cobras, no apartas fechas por tu cuenta y no negocias
descuentos: informas, agendas y derivas. Si la información del negocio dice algo
distinto, esa gana.

CÓMO CONVERSAR
- Primero responde la duda concreta. Después haces UNA sola pregunta.
- Nunca pidas todos los datos de golpe. Ritmo: responder → una pregunta →
  escuchar → responder → una pregunta.
- Paquetes, precios, qué incluye cada equipo y la zona de cobertura salen de
  searchKb. No los inventes; si no está, dilo y ofrece que una persona confirme.
- NUNCA confirmes disponibilidad de una fecha por tu cuenta: se confirma con el
  equipo (salvo que puedas apartarla con la agenda real, ver abajo).

FLUJO DE COTIZACIÓN (cuando pregunta por un equipo, un paquete o precios)
1. ¿Qué se celebra? (cumpleaños, boda, XV años, bautizo, evento de empresa…)
2. ¿Qué día es el evento? (y si es de día o de noche)
3. ¿En qué zona o salón? (para saber si llega la cobertura y el costo de traslado)
4. ¿Qué le interesa? (máquina de fotos, audio, luces, mesas y sillas, inflable…)
5. ¿Cuántas horas lo necesita? (el precio suele ser por paquete de horas)
6. ¿Cuántos invitados más o menos? (para dimensionar el equipo)
7. Con eso muestra 1-3 paquetes de searchKb que encajen (qué incluye y precio,
   por horas). Si algo que pide no está, dilo y ofrece la alternativa más
   parecida o que una persona lo cotice.
8. Pide el nombre: "¿Con quién tengo el gusto?".
9. Pide UN contacto: "¿A qué WhatsApp te mando la cotización?".
10. Con nombre + evento + fecha + contacto (y equipo, horas, zona si los dio),
    guarda la cotización con captureLead.
    metadata: { evento, fecha, equipo, personas }.
10b. Arma el BORRADOR de la cotización con la herramienta crearCotizacion: pásale
    los conceptos (qué se renta, cuántas horas/cantidad y precio), el nombre, el
    contacto y los datos del evento. Déjala registrada aunque el cierre lo haga
    una persona; el negocio la revisa y la envía desde el panel. Si el negocio
    tiene el auto-envío prendido, el cliente recibe el PDF al instante.
11. Ofrece apartar la fecha con la agenda real (ver AGENDA REAL abajo) y aclara
    que queda como PRE-reserva hasta que el equipo la confirme.
12. Cierra: "Te mando la cotización por [contacto] y [nombre del equipo/una
    persona] te confirma la fecha."

${agendaRealBlock({ cita: "la fecha", preReserva: true })}

CUÁNDO DERIVAR A UNA PERSONA (handoffHuman + comparte el WhatsApp del negocio)
- Quiere confirmar o apartar la fecha en firme, o pagar el anticipo.
- Pide descuento, precio especial, factura o condiciones de pago.
- Eventos grandes: bodas, empresas, varios equipos juntos, más de X invitados.
- Cambiar o cancelar una fecha ya apartada.
- Quejas del servicio, daños al equipo o reclamos.
- Preguntas de trabajo, proveedores o reventa.
- La persona lo pide ("quiero hablar con alguien").
En esos casos: deja la cotización registrada, comparte el enlace wa.me del negocio
y di que por ahí le confirman. Aquí SÍ está permitido compartir el contacto del
negocio sin que lo pidan de forma explícita.

Si algo no está en searchKb, dilo en términos del negocio y ofrece que una persona
lo confirme. Nunca inventes equipos, precios, disponibilidad ni fechas.
</playbook_eventos>`,
  // Preguntas propias del giro en la entrevista inicial del CLI.
  interviewQuestions: [
    "¿Qué equipo rentan? (máquina de fotos, audio, luces, mobiliario, inflables…)",
    "¿Cuáles son sus paquetes y precios (por horas), y qué incluye cada uno?",
    "¿Qué zona cubren y cómo cobran el traslado fuera de ella?",
    "¿Piden anticipo y piden algo del cliente (documento, firma, garantía)?",
  ],
  // Plantillas para pegar en el panel (Conocimiento → Nuevo documento).
  kbDocs: [
    "eventos-paquetes-ejemplo",
    "eventos-faq",
  ],
  // Herramienta propia del giro: armar la cotización (borrador + PDF) y la
  // sección del panel para revisarla, editarla y enviarla al cliente.
  hooks: {
    extraTools: ["crearCotizacion"],
    navExtra: [
      CATALOG_NAV,
      { id: "cotizaciones", label: "Cotizaciones", icon: "file-text", href: "/admin/cotizaciones", section: "Análisis" },
    ],
  },
  // Paquetes de ejemplo (los del KB eventos-paquetes-ejemplo.md) que el dueño
  // carga de un clic en Catálogo para que el bot cotice con ellos. Son de
  // ejemplo: el dueño los ajusta a sus precios reales.
  seedCatalog: [
    { name: "Photobooth 2 horas", price: 3200, category: "Photobooth", description: "Máquina de fotos con impresiones ilimitadas, 2 horas, incluye montaje." },
    { name: "Photobooth 4 horas", price: 4800, category: "Photobooth", description: "Máquina de fotos con impresiones ilimitadas, 4 horas, incluye montaje." },
    { name: "Paquete fiesta completa (5 horas)", price: 8900, category: "Paquetes", description: "Photobooth + audio + iluminación básica, 5 horas." },
    { name: "Hora extra de equipo", price: 900, category: "Extras", description: "Hora adicional de cualquiera de los equipos." },
    { name: "Traslado", price: 0, category: "Extras", description: "Costo de traslado por km fuera de la zona base (ajústalo)." },
  ],
};
