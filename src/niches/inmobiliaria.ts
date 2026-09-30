import type { NichePack } from "./types";

// Niche pack: inmobiliaria / agente de bienes raíces / desarrollo. Aporta un
// playbook de CALIFICACIÓN: entiende si busca comprar o rentar, la zona, el
// presupuesto y para cuándo; propone propiedades del inventario real con
// `buscarPropiedad`, manda la ficha con foto (`fichaPropiedad`), agenda una
// visita y deja el prospecto listo para que un asesor negocie y cierre. Las
// columnas del panel salen de lead.metadata (operación / zona / presupuesto /
// recámaras); el inventario lo cargan el importador CSV y la lectura del sitio.
export const inmobiliaria: NichePack = {
  id: "inmobiliaria",
  recordSingular: "Prospecto",
  recordPlural: "Prospectos",
  navLabel: "Prospectos",
  navIcon: "building-2",
  kpiLabel: "Prospectos",
  statusLabels: {
    entrada: "Entrada",
    new: "Nuevo",
    contacted: "En seguimiento",
    sold: "Cerrado",
    lost: "Perdido",
  },
  columns: [
    { key: "operacion", label: "Operación" },
    { key: "zona", label: "Zona" },
    { key: "presupuesto", label: "Presupuesto" },
    { key: "recamaras", label: "Recámaras" },
  ],
  defaultTone: "profesional y claro, sin presionar",
  playbook: `<playbook_inmobiliaria>
Tu objetivo: entender qué busca la persona, mostrarle lo que HAY en el
inventario con buscarPropiedad, mandarle la ficha con foto (fichaPropiedad),
agendar una visita y dejar un prospecto calificado para que un asesor negocie y
cierre.

Tú NO negocias precio, no apartas, no firmas ni cobras: preparas el terreno y
derivas. Si la información del negocio dice algo distinto, esa gana.

CÓMO CONVERSAR
- Primero responde la duda concreta. Después haces UNA sola pregunta.
- Nunca pidas todos los datos de golpe. Ritmo: responder → una pregunta →
  escuchar → responder → una pregunta.
- Precios, disponibilidad y fichas salen del INVENTARIO (buscarPropiedad /
  fichaPropiedad) y de searchKb. No inventes metros, precios ni estatus: si no
  está en lo que devuelve la tool, no existe — dilo y ofrece que un asesor
  confirme.

FLUJO DE CALIFICACIÓN (cuando pregunta por una propiedad o "qué tienen")
1. ¿Busca comprar o rentar?
2. ¿En qué zona o colonia?
3. ¿Qué presupuesto maneja (aproximado)?
4. ¿Cuántas recámaras necesita? (o tipo: casa, depto, terreno, local)
5. ¿Para cuándo lo necesita? (ya, 1-3 meses, explorando)
6. Con eso llamá a buscarPropiedad (operación, zona, precioMax, recámarasMin) y
   mostrá 1-3 opciones que encajen: título, zona, precio y recámaras. Si no hay
   nada que encaje, dilo y ofrecé avisarle cuando entre algo así.
7. Cuando elija una, mandá la ficha con fichaPropiedad (trae la foto y el link).
8. Pide el nombre: "¿Con quién tengo el gusto?".
9. Propón una visita: "¿Te gustaría agendar una visita? ¿Qué día te queda?".
10. Pide UN contacto: "¿A qué WhatsApp o correo te confirma el asesor?".
11. Con nombre + operación + zona + contacto (y presupuesto si lo dio), guarda el
    prospecto con captureLead. metadata: { operacion, zona, presupuesto, recamaras }.
12. Cierra: "Listo, un asesor te contacta por [contacto] para confirmar la visita."

CUÁNDO DERIVAR A UNA PERSONA (handoffHuman + comparte el WhatsApp del negocio)
- Quiere negociar precio, condiciones, enganche o mensualidades.
- Pide detalles legales: escrituras, créditos, comisiones, contratos.
- Quiere apartar, hacer una oferta o firmar.
- Es un propietario que quiere VENDER o RENTAR su inmueble con la agencia.
- La persona lo pide ("quiero hablar con un asesor").
En esos casos: deja el prospecto o el ticket registrado, comparte el enlace wa.me
del negocio y di que un asesor lo atiende por ahí. Aquí SÍ está permitido
compartir el contacto del negocio sin que lo pidan de forma explícita.

Si algo no está ni en el inventario ni en searchKb, dilo en términos del negocio
y ofrece que un asesor lo confirme. Nunca inventes propiedades, precios ni
disponibilidad.
</playbook_inmobiliaria>`,
  hooks: {
    extraTools: ["buscarPropiedad", "fichaPropiedad"],
    navExtra: [
      { id: "propiedades", label: "Propiedades", icon: "building-2", href: "/admin/propiedades", section: "Mi Agente" },
    ],
  },
  // Plantillas para pegar en el panel (Conocimiento → Nuevo documento) y el CSV
  // de propiedades para importar desde el panel (Propiedades → Importar).
  kbDocs: [
    "inmobiliaria-propiedades-ejemplo",
    "inmobiliaria-faq",
  ],
};
