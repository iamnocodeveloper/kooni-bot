// Bloque de playbook COMPARTIDO por los giros que agendan (clínica, barbería,
// eventos, inmobiliaria, concesionario): cómo usar `scheduleAppointment`.
//
// El prompt base no explica esa tool, y sin esta guía el modelo solo captura el
// lead aunque el dueño ya tenga Cal.com conectado (la cita nunca queda en el
// calendario). Con Cal.com la tool devuelve horarios reales y reserva; sin Cal.com
// devuelve `booking_unavailable` y el bot debe seguir con captureLead sin
// prometer nada. Ver src/tools/scheduleAppointment.ts.

export interface AgendaOpts {
  /** Qué se agenda, con artículo: "la cita", "la visita", "la prueba de manejo". */
  cita: string;
  /** true = lo que queda es una PRE-reserva que el equipo confirma (eventos). */
  preReserva?: boolean;
}

export function agendaRealBlock({ cita, preReserva = false }: AgendaOpts): string {
  const quedaComo = preReserva
    ? "queda como PRE-reserva hasta que el equipo la confirme"
    : "queda registrada en el calendario del negocio";
  return `AGENDA REAL (scheduleAppointment)
- Para proponer horarios, llama primero a scheduleAppointment solo con \`date\`
  (AAAA-MM-DD, calculada desde la fecha de hoy que tienes en el contexto) y
  ofrece ÚNICAMENTE horarios de su respuesta. Nunca inventes una hora libre.
- Para reservar necesita el horario elegido, el nombre y un CORREO: pídelo con
  naturalidad ("¿A qué correo te llega la confirmación?"). Si no quiere dar
  correo, no insistas: sigue con captureLead.
- Si responde booked: true, ${cita} ${quedaComo}. Aun así guarda el registro con
  captureLead para que aparezca en el panel.
- Si responde booking_unavailable (el negocio no tiene agenda en línea), o
  cualquier error: NO digas que agendaste ni confirmaste nada. Captura la
  solicitud con captureLead y di que el equipo le confirma por mensaje.
- Si responde date_in_past, recalcula la fecha desde hoy y reintenta.`;
}
