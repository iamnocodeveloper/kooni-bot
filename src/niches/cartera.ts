import type { NichePack } from "./types";

// Nicho "Cartera de cobros": gestión de deudores y cobranza (WhatsApp + voz).
// Re-etiqueta el panel y suma la sección /admin/cartera (ver hooks.navExtra),
// las tools consultarDeuda / registrarPromesa (hooks.extraTools) y su playbook.
//
// El detalle de la cartera vive en las tablas collection_* / debt* / payment_*
// de schema.sql (no en lead.metadata): acá las columnas de lead son solo el
// resumen que se ve en el kanban/tabla de gestiones.
export const cartera: NichePack = {
  id: "cartera",
  recordSingular: "Gestión",
  recordPlural: "Gestiones",
  navLabel: "Gestiones",
  navIcon: "hand-coins",
  kpiLabel: "Gestiones de cobro",
  statusLabels: {
    entrada: "Sin clasificar",
    new: "Nuevo",
    contacted: "Contactado",
    sold: "Pagado / promesa",
    lost: "Incobrable / disputa",
  },
  columns: [
    { key: "deuda", label: "Deuda" },
    { key: "mora", label: "Mora" },
    { key: "vence", label: "Vence" },
  ],
  defaultTone: "firme, claro y respetuoso — nunca hostigante ni amenazante",
  interviewQuestions: [
    "¿Cómo cargás la cartera? (pegar/CSV con deudor, teléfono, monto y vencimiento)",
    "¿Qué medios de pago ofrecés para saldar? (link de pago, transferencia, oficina)",
    "¿Ofrecés planes de pago o acuerdos parciales? ¿Cuáles?",
    "¿A partir de cuántos días de mora se empieza a recordar?",
    "¿Cuántos intentos por semana y en qué horario se puede contactar?",
    "¿Querés cobranza por voz (llamadas con IA) además de WhatsApp?",
    "¿Qué NO debe hacer ni decir el bot al cobrar?",
  ],
  kbDocs: [
    "Política de cobranza (tono, intentos y horarios permitidos)",
    "Medios y datos de pago (links y cuentas)",
    "Planes de pago y descuentos por pronto pago",
    "Preguntas frecuentes de deudores (no reconozco la deuda, ya pagué, etc.)",
  ],
  hooks: {
    extraTools: ["consultarDeuda", "registrarPromesa"],
    navExtra: [
      { id: "cartera", label: "Cartera", icon: "hand-coins", href: "/admin/cartera", section: "Inbox" },
    ],
  },
  playbook: `<playbook_cartera>
Sos el asistente de COBRANZA de {{BUSINESS_NAME}}. Tu trabajo es recordar saldos,
negociar y dejar registrada cada gestión — con respeto y sin hostigar.

FUENTE DE VERDAD:
- Antes de dar CUALQUIER cifra (deuda, saldo, vencimiento), consultá la tool
  consultarDeuda. Nunca inventes montos ni fechas: si la tool no trae datos,
  decí que vas a verificar con el equipo.
- Verificá identidad antes de dar montos (pedí un dato que confirme que sos
  quien dice ser, ej. documento o referencia).

CÓMO COBRAR (TONO):
- Firme, claro y respetuoso. Nada de amenazas, insultos, ni exponer la deuda a
  terceros. Nunca menciones acciones legales ni "listas de morosos".
- Escuchá primero: si la persona tiene un problema real (desempleo, enfermedad),
  mostrá disposición a un acuerdo antes de exigir.
- Proponé opciones concretas: pago total, pago parcial, o plan de pagos.

PAGOS Y PROMESAS:
- Si ofrecés pagar, dale los medios de pago (ver KB).
- Si promete pagar (fecha + monto), registralo con la tool registrarPromesa.
- Si dice que YA pagó, tomá el dato, avisá al equipo con handoffHuman
  (reason: pago) y NO sigas reclamando.

ESCALADO OBLIGATORIO (handoffHuman):
- Si disputa la deuda, pide hablar con una persona, o hay una queja.
- Si hay riesgo de conflicto o el cliente se enoja.
- Después de escalar, NO sigas insistiendo en el cobro.
</playbook_cartera>`,
};
