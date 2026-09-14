import type { NichePack } from "./types";

// Niche pack: TAXIS / central de despacho. El bot atiende al cliente que pide un
// taxi: le pide la ubicación (pin de WhatsApp o zona/barrio), elige la BASE más
// cercana que tenga conductores en cola, asigna al SIGUIENTE de la fila y le
// avisa al cliente quién va y en qué auto. Si NO hay conductores, marca el chat
// como urgente (ticket + etiqueta atención_humana) para que el operador asigne a
// mano desde el hilo.
//
// Los conductores entran solos a la cola: cada uno está registrado con su número
// de WhatsApp; cuando ese número escribe al bot, entra al final de la cola de su
// base (no pasa por el modelo — lo intercepta src/taxi/driverInbound.ts).
//
// Los viajes NO viven en `leads`: tienen sus propias tablas (taxi_bases,
// taxi_drivers, taxi_queue, taxi_trips, taxi_trip_events). La pestaña "Solicitudes"
// (leads re-etiquetados) queda para lo que NO es un viaje: reclamos, cuentas,
// objetos perdidos → el bot escala a una persona.
//
// Alcance: NO es un sistema de gestión de flota (sin GPS en vivo del auto, sin
// liquidación de caja, sin facturación). Canales del nicho: solo WhatsApp oficial
// y WAHA (se ocultan los demás en el panel; el código los sigue teniendo).
export const taxis: NichePack = {
  id: "taxis",
  recordSingular: "Solicitud",
  recordPlural: "Solicitudes",
  navLabel: "Solicitudes",
  navIcon: "car-taxi-front",
  kpiLabel: "Solicitudes",
  statusLabels: {
    entrada: "Entrada",
    new: "Solicitada",
    contacted: "Asignada",
    sold: "Completada",
    lost: "Cancelada",
  },
  columns: [
    { key: "base", label: "Base" },
    { key: "zona", label: "Zona" },
    { key: "conductor", label: "Conductor" },
    { key: "destino", label: "Destino" },
  ],
  defaultTone: "directo y amable, como el despachador de una central de taxis",
  interviewQuestions: [
    "¿Cuáles son las bases (nombre y dirección) y qué zonas o barrios cubre cada una?",
    "¿Cuánto cuesta el viaje por zona (tarifa base + por zona)? ¿Hay mínimos?",
    "¿Cuántos minutos tarda en promedio un taxi en llegar a cada zona?",
    "¿Qué conductores hay, con qué número de WhatsApp y a qué base pertenecen?",
    "¿Qué debe hacer el bot si no hay ningún conductor disponible?",
    "¿Qué métodos de pago aceptan? (efectivo, transferencia, tarjeta en el auto…)",
    "¿Hay viajes que el bot NO deba tomar (interurbanos, carga, grupos grandes)?",
  ],
  kbDocs: ["taxis-faq", "taxis-tarifas", "taxis-casos-limite"],
  hooks: {
    taxiEngine: true,
    extraTools: ["solicitarTaxi"],
    navExtra: [
      { id: "viajes", label: "Viajes", icon: "car", href: "/admin/viajes", section: "Inbox" },
      { id: "cola", label: "Cola", icon: "list-ordered", href: "/admin/cola", section: "Inbox" },
      { id: "bases", label: "Bases", icon: "map-pin", href: "/admin/bases", section: "Mi Agente" },
      { id: "conductores", label: "Conductores", icon: "id-card", href: "/admin/conductores", section: "Mi Agente" },
      { id: "reportes", label: "Reportes", icon: "bar-chart-3", href: "/admin/reportes", section: "Análisis" },
    ],
  },
  playbook: `<playbook_taxis>
Sos el despachador de la central de taxis por chat. Objetivo: conseguirle un
taxi al cliente lo más rápido posible, o pasar el caso a una persona si no hay
conductores o hay un problema.

TONO: directo y amable, como el despachador de la central. Frases cortas. Nada de
formalidad de call center.

REGLA DE ORO: el bot NUNCA inventa que hay un taxi si no lo hay. La cola de
conductores y las bases son datos reales (los cargó el dueño). Si no hay nadie,
se lo decís al cliente y el caso queda marcado para la persona de la central.

CÓMO CONVERSAR
- Una cosa a la vez. Primero entendé qué necesita; después pedí lo que falte.
- Sé breve: el cliente quiere un taxi, no una charla.

FLUJO DEL VIAJE
1. PEDIR LA UBICACIÓN. Es lo primero. Ofrecé las dos formas: "¿me compartís tu
   ubicación o me decís en qué zona/barrio estás?". Si manda un pin de WhatsApp,
   el sistema lo lee solo; si escribe la zona, también sirve.
2. CONFIRMAR EL DESTINO (si el cliente lo dijo). No es obligatorio para asignar,
   pero si lo sabe, anotalo para el conductor.
3. REGISTRAR. Con la ubicación, llamá a la tool solicitarTaxi con la dirección y/o
   las coordenadas y la zona. La tool hace lo demás: elige la base más cercana con
   conductores, asigna al siguiente de la fila y arma el aviso. NO prometas un
   conductor antes de llamarla.
4. INFORMAR AL CLIENTE. Con el resultado de la tool, decí el nombre del conductor,
   el auto y la placa, y el tiempo estimado de llegada. Si la tool dice que NO hay
   conductor, avisá que estás buscando uno y que la central lo confirma en breve.
5. CIERRE. Quedate disponible por si el cliente necesita algo más del viaje.

CASOS LÍMITE
- No hay conductores en ninguna base: la tool deja el viaje como "sin conductor" y
  avisa a la central. Decile al cliente con naturalidad: "en este momento no tengo
  un auto libre, ya avisé a la central y te confirmo apenas se libere uno".
- Viaje que la central no toma (interurbano, carga, grupos grandes): no lo registres
  como viaje normal. Escalá con handoffHuman y pasá el contacto de la central.
- Reclamo o problema de un viaje EN CURSO o ya hecho (se fue, cobró mal, olvidó algo):
  escalá con handoffHuman. No prometas reembolsos ni compensaciones.
- El cliente pide algo que no es un taxi (paquetería, mudanza): si la central lo hace
  (searchKb), seguí el flujo; si no, escalá.
- Ubicación ambigua o fuera de toda zona conocida: pedí una referencia (calle,
  esquina, negocio cercano) antes de registrar.

CUÁNDO ESCALAR A UNA PERSONA (handoffHuman)
- No hay ningún conductor disponible.
- Reclamos o incidentes de viajes.
- El cliente lo pide explícitamente, o pregunta por tarifas que no están en searchKb.
En esos casos, dejalos registrados con captureLead (metadata: { base, zona, conductor,
destino }) y pasá el contacto de la central.
</playbook_taxis>`,
};
