// Personas del Laboratorio: clientes SIMULADOS (multi-turno) que conversan
// contra el agente real para probarlo antes de que hable con clientes de verdad.
// Cada persona define un objetivo, un tono y un mensaje de apertura; un modelo
// barato genera los turnos siguientes (ver src/lab/simulator.ts) hasta que
// cumple su objetivo o se cansa. Aterrizadas en los giros de Kooni.
import type { LabScenario } from "./scenarios";

export function personaScenarios(): LabScenario[] {
  return [
    {
      id: "persona-decidido",
      label: "El decidido",
      lang: "es",
      tier: "pro",
      category: "persona",
      kind: "persona",
      expectedToolCall: "captureLead",
      rubric:
        "El cliente quiere cerrar YA. El bot toma los datos que da, confirma y avanza a cerrar (capturar lead/agendar); " +
        "no lo hace dar vueltas ni le repite preguntas ya respondidas. Tono ágil y claro.",
      maxTurns: 6,
      persona: {
        goal: "Comprar/contratar ahora mismo, sin vueltas. Das tus datos cuando te los piden.",
        opening: "Hola, quiero contratar el servicio ya. ¿Cómo hacemos?",
        style: "Directo y breve. Respondes lo que te preguntan y empujas para cerrar.",
        maxTurns: 6,
      },
    },
    {
      id: "persona-precios",
      label: "El preguntón de precios",
      lang: "es",
      tier: "free",
      category: "persona",
      kind: "persona",
      expectedToolCall: "searchKb",
      rubric:
        "El cliente insiste con precios y compara opciones. El bot responde con precios REALES (de la KB/catálogo) " +
        "y nunca inventa un precio. Si no lo tiene, lo dice. No evade todas las preguntas.",
      maxTurns: 6,
      persona: {
        goal: "Saber cuánto cuesta todo, comparar y regatear un poco.",
        opening: "¿Cuánto cuesta? ¿Y hay algo más barato?",
        style: "Curioso e insistente con los precios. Pides comparaciones y descuentos.",
        maxTurns: 6,
      },
    },
    {
      id: "persona-molesto",
      label: "El cliente enojado",
      lang: "es",
      tier: "free",
      category: "persona",
      kind: "persona",
      expectedToolCall: "handoffHuman",
      rubric:
        "El cliente está enojado por un problema. El bot muestra empatía, no se defiende ni repite la respuesta " +
        "que falló, y ESCALA a un humano (handoffHuman). Tono calmado y breve.",
      maxTurns: 5,
      persona: {
        goal: "Quejarte fuerte por un cobro/problema y exigir una solución humana.",
        opening: "Esto es un desastre, me cobraron mal y nadie me responde. Quiero una solución YA.",
        style: "Enojado, en mayúsculas y con urgencia. Te frustra que te den respuestas genéricas.",
        maxTurns: 5,
      },
    },
    {
      id: "persona-hueco-kb",
      label: "El que pregunta lo que no sabés",
      lang: "es",
      tier: "free",
      category: "persona",
      kind: "persona",
      expectedToolCall: null,
      rubric:
        "El cliente pregunta algo que probablemente NO está en la KB. El bot admite que no lo tiene, NO inventa, " +
        "y ofrece confirmarlo o pasar con una persona. Esta es la prueba de alucinación.",
      maxTurns: 4,
      persona: {
        goal: "Obtener un dato muy específico y poco común (política rarísima, detalle técnico, fecha futura).",
        opening: "¿Hacen envíos los domingos feriados a otro país y con factura a nombre de una empresa?",
        style: "Preguntas rebuscadas y específicas. Repreguntas si la respuesta es vaga.",
        maxTurns: 4,
      },
    },
    {
      id: "persona-exige-humano",
      label: "El que exige un humano",
      lang: "es",
      tier: "free",
      category: "persona",
      kind: "persona",
      expectedToolCall: "handoffHuman",
      rubric:
        "El cliente pide explícitamente una persona. El bot NO insiste con el bot ni da más vueltas: " +
        "escala de inmediato (handoffHuman) y confirma el seguimiento.",
      maxTurns: 4,
      persona: {
        goal: "Hablar con una persona real cuanto antes.",
        opening: "No quiero hablar con un bot. Pásame con una persona.",
        style: "Firme y corto. Repites que quieres un humano si intentan seguir con el bot.",
        maxTurns: 4,
      },
    },
    {
      id: "persona-informal",
      label: "El informal",
      lang: "es",
      tier: "free",
      category: "persona",
      kind: "persona",
      expectedToolCall: "searchKb",
      rubric:
        "El cliente escribe muy informal, con abreviaturas y errores. El bot entiende de todos modos, responde " +
        "en el mismo idioma, con tono natural, y no regaña ni corrige la escritura del cliente.",
      maxTurns: 5,
      persona: {
        goal: "Entender qué ofrecen y cuánto sale, escribiendo como te sale (informal).",
        opening: "ke onda pa, io keria saber si benden pintura y a como",
        style: "Muy informal: abreviaturas, sin tildes, emojis, errores. Simpático, no agresivo.",
        maxTurns: 5,
      },
    },
    {
      id: "persona-comida-fuera-zona",
      label: "Comida · pide fuera de zona",
      lang: "es",
      tier: "free",
      category: "persona",
      kind: "persona",
      expectedToolCall: "tomarPedido",
      rubric:
        "Es un restaurante. El cliente quiere delivery a una dirección que NO está en las zonas cubiertas. El bot " +
        "NO inventa una zona ni un envío: lo dice claro y ofrece retiro en el local (o pasa a una persona). Solo " +
        "registra el pedido con un envío válido.",
      maxTurns: 6,
      persona: {
        goal: "Pedir delivery a tu casa, que está lejos / fuera de las zonas del local.",
        opening: "Hola, quiero pedir 2 pizzas para enviar a mi casa.",
        style: "Amable; das la dirección y, si te dicen que no llegan, insistís un poco o aceptás retiro.",
        maxTurns: 6,
      },
    },
    {
      id: "persona-comida-para-despues",
      label: "Comida · pedido para más tarde",
      lang: "es",
      tier: "free",
      category: "persona",
      kind: "persona",
      expectedToolCall: "tomarPedido",
      rubric:
        "Es un restaurante. El cliente quiere el pedido PROGRAMADO para más tarde (hoy a cierta hora). El bot toma " +
        "el pedido y guarda la hora pedida (no lo trata como 'para ya' ni inventa disponibilidad). Confirma el resumen.",
      maxTurns: 6,
      persona: {
        goal: "Pedir comida para que llegue más tarde, a una hora concreta.",
        opening: "Buenas, ¿me pueden llevar una orden de tacos para hoy a las 8 de la noche?",
        style: "Claro y paciente. Confirma la hora y el resumen cuando te los repiten.",
        maxTurns: 6,
      },
    },
  ];
}
