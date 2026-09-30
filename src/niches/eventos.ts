import type { NichePack } from "./types";

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
  equipo (salvo que puedas apartarla con el calendario, ver abajo).

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
11. Si el negocio trabaja con agenda, ofrece apartar la fecha (scheduleAppointment)
    y aclara que queda como PRE-reserva hasta que el equipo la confirme.
12. Cierra: "Te mando la cotización por [contacto] y [nombre del equipo/una
    persona] te confirma la fecha."

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
};
