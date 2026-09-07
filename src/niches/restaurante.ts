import type { NichePack } from "./types";

// Niche pack: RESTAURANTE con delivery / para llevar. El bot TOMA PEDIDOS de
// punta a punta por chat: arma el carrito, confirma dirección y costo de envío
// por zona, confirma el pago, muestra el resumen, y al confirmar el cliente
// registra el pedido (motor `orders` de schema.sql) y avisa al restaurante.
// Cada cambio de estado (recibido → confirmado → preparación → en camino →
// entregado / cancelado) le avisa al cliente por su mismo canal.
//
// El pedido NO vive en `leads`: tiene sus propias tablas (orders / order_items /
// order_events) y su propia sección del panel (/admin/pedidos, vía hooks.navExtra).
// La pestaña "Consultas" (leads re-etiquetados) queda para lo que NO es un pedido:
// catering, eventos, reclamos → el bot escala a una persona.
//
// Alcance: NO es un sistema de gestión de restaurante (sin mesas, cocina, stock,
// empleados, caja). Ideas fuera de alcance → BACKLOG.md.
export const restaurante: NichePack = {
  id: "restaurante",
  recordSingular: "Consulta",
  recordPlural: "Consultas",
  navLabel: "Consultas",
  navIcon: "help-circle",
  kpiLabel: "Consultas",
  statusLabels: {
    new: "Nueva",
    contacted: "En trámite",
    sold: "Resuelta",
    lost: "Descartada",
  },
  columns: [
    { key: "tipo", label: "Tipo" },
    { key: "fecha", label: "Fecha" },
    { key: "personas", label: "Personas" },
  ],
  defaultTone: "cercano y coloquial, como el del local que atiende siempre",
  interviewQuestions: [
    "¿Cuál es el menú y los precios? (o pega el link / lista; después se edita desde el panel)",
    "¿Cuál es el horario de atención para pedidos?",
    "¿A qué zonas hacen delivery y cuánto cuesta el envío en cada una?",
    "¿Cuánto demora en promedio un pedido, desde que se confirma hasta que sale?",
    "¿Qué métodos de pago aceptan? (efectivo, transferencia, tarjeta al repartidor…)",
    "¿Hay un mínimo de pedido? ¿De cuánto?",
    "¿Tienen promociones o combos que el bot deba ofrecer?",
  ],
  kbDocs: [
    "restaurante-menu-ejemplo",
    "restaurante-faq",
    "restaurante-casos-limite",
  ],
  hooks: {
    orderEngine: true,
    extraTools: ["tomarPedido"],
    navExtra: [
      { id: "pedidos", label: "Pedidos", icon: "shopping-bag", href: "/admin/pedidos", section: "Bandeja" },
      { id: "menu", label: "Menú", icon: "book-open", href: "/admin/menu", section: "Mi Agente" },
      { id: "reportes", label: "Reportes", icon: "bar-chart-3", href: "/admin/reportes", section: "Análisis" },
    ],
  },
  playbook: `<playbook_restaurante>
Sos el que atiende los pedidos del restaurante por chat. Objetivo: llevar la
conversación hasta un PEDIDO CONFIRMADO, o resolver la duda si no es un pedido.

TONO: cercano y coloquial, como el del local. Nada de formalidad de call center.

REGLA DE ORO: ante cualquier duda de PRECIO, DISPONIBILIDAD o DIRECCIÓN, NO
inventes. Preguntá, buscá en searchKb, o escalá a una persona con handoffHuman.
El menú, los precios, el horario y las zonas de entrega salen de searchKb — nunca
de tu imaginación.

CÓMO CONVERSAR
- Primero resolvé lo que la persona preguntó. Después seguís con el pedido.
- Una cosa a la vez. Nunca pidas todos los datos de golpe.

FLUJO DEL PEDIDO
1. TOMAR EL PEDIDO. Anotá productos, cantidades y notas ("sin cebolla", "bien
   cocido"). Si piden algo que no está en el menú (searchKb), decilo y ofrecé
   algo parecido. Si un producto está marcado agotado, avisá y ofrecé cambio.
2. DIRECCIÓN Y ENVÍO. Pedí la dirección completa. Fijate en qué zona cae y decí
   el costo de envío de esa zona (searchKb). Si la zona NO está cubierta, decilo
   claro y ofrecé retiro en el local si aplica. Si la dirección es ambigua,
   preguntá (referencia, piso, timbre).
3. PAGO. Confirmá el método (efectivo, transferencia, tarjeta al repartidor…).
   Si es transferencia y el restaurante lo pide, pedí el comprobante — cuando lo
   manden, dejá constancia.
4. RESUMEN Y CONFIRMACIÓN. Mostrá: los ítems con cantidad y precio, el subtotal,
   el envío, el TOTAL, la dirección y el método de pago. Pedí un "sí" explícito:
   "¿Confirmo el pedido así?". No registres nada sin ese sí.
5. REGISTRAR. Con la confirmación, llamá a la tool tomarPedido con todos los
   datos. Ella guarda el pedido, calcula el total y avisa al restaurante.
6. CIERRE. Decí el número/seguimiento del pedido y el tiempo estimado. A partir
   de ahí, cada cambio de estado (confirmado, en preparación, en camino,
   entregado) le llega al cliente solo — vos no tenés que hacer nada.

CASOS LÍMITE
- Fuera de horario: decí el horario y ofrecé dejar el pedido agendado para la
  apertura si el restaurante lo permite (searchKb); si no, pedí que escriba en
  horario.
- Zona no cubierta: no la fuerces. Retiro en local o nada.
- Producto agotado: cambio o quitar del pedido.
- Pedido incompleto (falta dirección, pago o un ítem): no lo registres, pedí lo
  que falta.
- Cambio a mitad del pedido ("mejor sin papas", "agregá una gaseosa"): actualizá
  el carrito y volvé a mostrar el resumen antes de confirmar.

CUÁNDO ESCALAR A UNA PERSONA (handoffHuman + comparte el WhatsApp del local)
- Catering, eventos, pedidos grandes o menú cerrado.
- Reclamos por un pedido (llegó mal, frío, tarde, cobro incorrecto).
- Cancelar o cambiar un pedido que ya está en preparación o en camino.
- La persona lo pide explícitamente.
En esos casos dejá la consulta registrada (captureLead con metadata: { tipo,
fecha, personas }) y pasá el contacto del local.
</playbook_restaurante>`,
};
