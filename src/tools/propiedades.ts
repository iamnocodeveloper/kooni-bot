// Tools del INVENTARIO de propiedades (giro inmobiliaria).
//
// Cierran el círculo anti-alucinación del bot de bienes raíces:
//   - buscarPropiedad responde SOLO con lo que hay cargado (importado por CSV o
//     leído del sitio): operación, tipo, zona, precio y recámaras. Si no hay
//     nada que cumpla el filtro, devuelve 0 y las zonas disponibles — el bot NO
//     contesta de memoria ni con la KB.
//   - fichaPropiedad entrega la ficha de UNA propiedad (link real + foto) sólo
//     cuando el cliente pide esa puntual o da su referencia.
//
// Se registran cuando el pack del giro los declara (`hooks.extraTools`); el
// resto de las instalaciones no cargan este módulo.
import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { chunkReply } from "../replies/chunker";
import { sendReplyCapped } from "../replies/sender";
import type { ChannelId } from "../channels/shared";
import {
  findPropiedadByCodigo,
  findPropiedadByTitle,
  listStoredPropiedades,
  loadPropiedadStoreFromDb,
  queryPropiedades,
  type StoredPropiedad,
} from "../kb/properties";
import { enrichPropiedad } from "../kb/propertiesScrape";

/** Contexto con el canal real (lo inyecta el agente — ver enviarRecurso). */
export interface PropiedadesCtx {
  channel: ChannelId;
  channelUserId: string;
}

function money(n: number | null, moneda: string | null): string {
  if (n === null) return "precio a consultar";
  return `${moneda === "USD" ? "US$" : "$"}${n.toLocaleString("es-MX")}`;
}

function propiedadLine(p: StoredPropiedad): string {
  const parts = [p.title];
  if (p.operacion) parts.push(p.operacion === "renta" ? "en renta" : "en venta");
  if (p.zona) parts.push(p.zona);
  if (p.recamaras !== null) parts.push(`${p.recamaras} rec`);
  parts.push(money(p.precio, p.moneda) + (p.operacion === "renta" ? "/mes" : ""));
  if (p.codigo) parts.push(`ref ${p.codigo}`);
  return parts.join(" · ");
}

function noPropiedadesGuide(): { sinPropiedades: true; guia: string } {
  return {
    sinPropiedades: true,
    guia:
      "Esta instalación todavía no tiene propiedades cargadas. Respondé con lo que devuelva " +
      "searchKb o con los documentos del negocio, ofrecé que un asesor confirme los detalles " +
      "y NO inventes propiedades, precios ni disponibilidad.",
  };
}

export function buscarPropiedadTool(env: Env) {
  return tool({
    description:
      "Consulta EXACTA del inventario de propiedades (casas, departamentos, terrenos, locales) de la inmobiliaria. " +
      "Usala SIEMPRE que el cliente pregunte por propiedades, disponibilidad, zonas, precios, presupuesto, " +
      "recámaras o si busca comprar/rentar — nunca contestes de memoria ni sólo con la KB. " +
      "Devuelve SOLO lo que hay en el inventario: si no aparece, NO existe; decilo y ofrecé las zonas disponibles. " +
      "Si hay muchos resultados, pagina: cuando devuelve `hayMas`, ofrecé ver la siguiente tanda.",
    inputSchema: z.object({
      operacion: z.enum(["venta", "renta"]).optional().describe("Si busca comprar (venta) o rentar (renta)"),
      tipo: z
        .string()
        .optional()
        .describe("Tipo de inmueble: casa, departamento, terreno, local, oficina, bodega, proyecto"),
      zona: z.string().optional().describe("Zona, colonia o fraccionamiento (ej. 'Las Lomas', 'Centro')"),
      precioMin: z.number().optional().describe("Presupuesto mínimo"),
      precioMax: z.number().optional().describe("Presupuesto máximo (en pesos, salvo que la propiedad sea en USD)"),
      moneda: z.enum(["MXN", "USD"]).optional().describe("Moneda del presupuesto, si el cliente la dijo"),
      recamarasMin: z.number().int().min(1).optional().describe("Mínimo de recámaras"),
      consulta: z.string().optional().describe("Términos libres que deben aparecer (ej. 'jardín alberca')"),
      pagina: z.number().int().min(1).optional().describe("Página de resultados (1 = primera). Usala cuando pidan 'ver más'."),
    }),
    execute: async ({ operacion, tipo, zona, precioMin, precioMax, moneda, recamarasMin, consulta, pagina }) => {
      const db = new Db(env.DB);
      const store = await loadPropiedadStoreFromDb(db);
      if (listStoredPropiedades(store).length === 0) return noPropiedadesGuide();

      const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
      const rawSize = await new SettingsRepo(db).get(SETTING_KEYS.propertiesPageSize).catch(() => null);
      const size = Math.min(Math.max(Number.parseInt(rawSize ?? "", 10) || 12, 1), 25);
      const page = Math.max(1, pagina ?? 1);

      const res = queryPropiedades(
        store,
        { operacion, tipo, zona, precioMin, precioMax, moneda, recamarasMin, consulta },
        size,
        (page - 1) * size,
      );
      const zonasTxt = res.zonas.length ? res.zonas.map((z) => `${z.zona} (${z.total})`).join(", ") : "";

      if (res.total === 0) {
        return {
          encontrados: 0,
          filtro: { operacion, tipo, zona, precioMin, precioMax, recamarasMin },
          zonasDisponibles: zonasTxt,
          mensaje:
            "No hay propiedades que cumplan ese filtro. No digas que sí hay: informá que no está " +
            "disponible con esas condiciones, ofrecé las zonas que sí hay y proponé avisarle cuando entre algo así.",
        };
      }

      return {
        encontrados: res.total,
        mostrados: res.matches.length,
        pagina: page,
        ...(res.hasMore
          ? {
              hayMas: true,
              paginaSiguiente: page + 1,
              panorama: res.resumen,
              notaTruncado:
                `Hay ${res.total} propiedades que cumplen el filtro; esta página muestra ${res.matches.length} ` +
                `(página ${page}). Mostrá 2 o 3 que encajen y, si quiere más, decile que podés pasarle ` +
                `la siguiente tanda y volvé a llamar a esta tool con pagina=${page + 1}.`,
            }
          : {}),
        matches: res.matches.map((m) => ({
          referencia: m.codigo,
          titulo: m.titulo,
          operacion: m.operacion,
          tipo: m.tipo,
          zona: m.zona,
          precio: m.precio,
          moneda: m.moneda,
          recamaras: m.recamaras,
          banos: m.banos,
          m2: m.m2,
          estatus: m.estatus,
          url: m.url,
          tieneFoto: m.hasImage,
        })),
        zonasDisponibles: zonasTxt,
        nota:
          "Mostrá hasta 3 opciones con título, operación, zona, precio (si es null, decí que se consulta) " +
          "y recámaras; para renta aclará que es por mes. No pegués la URL de la ficha todavía. " +
          "Si hay `hayMas`, ofrecé la siguiente tanda (pagina = paginaSiguiente). " +
          "Cuando el cliente elija una, llamá a fichaPropiedad para mandarle la ficha con la foto y el link. " +
          "Nunca inventes propiedades, precios ni estatus que no vengan en los resultados.",
      };
    },
  });
}

export function fichaPropiedadTool(env: Env, getCtx: () => PropiedadesCtx | null) {
  return tool({
    description:
      "Envía la ficha COMPLETA de UNA propiedad (foto real + link + precio, zona, recámaras, baños, m² y estatus). " +
      "Usala SIEMPRE que el cliente pida ver/consultar/mandar UNA propiedad concreta — por nombre o referencia (ej. 'mandame la de Las Lomas', 'info de la casa del Centro', 'la LN-1024', 'mandame la foto'). " +
      "Para listar disponibilidad o preguntar por zona/presupuesto usá buscarPropiedad. Si no la encuentra, no inventes: pedí la referencia o que elija una de las opciones.",
    inputSchema: z.object({
      referencia: z.string().optional().describe("Referencia/código de la propiedad (ej. LN-1024)"),
      propiedad: z.string().optional().describe("Título exacto de la propiedad tal como apareció en la lista (si no hay referencia)"),
    }),
    execute: async ({ referencia, propiedad }) => {
      if (!referencia && !propiedad) {
        return { error: "sin_datos", mensaje: "Necesito la referencia o el nombre de la propiedad." };
      }
      const db = new Db(env.DB);
      const store = await loadPropiedadStoreFromDb(db);
      const all = listStoredPropiedades(store);
      if (all.length === 0) return noPropiedadesGuide();

      let found: StoredPropiedad | null = null;
      if (referencia) {
        found = findPropiedadByCodigo(store, referencia);
        if (!found) {
          return {
            error: "no_encontrado",
            mensaje: `No hay ninguna propiedad con la referencia ${referencia}. Decíselo sin inventar y ofrecé las disponibles.`,
          };
        }
      } else {
        const r = findPropiedadByTitle(store, String(propiedad ?? "").trim());
        if (!r) {
          return {
            error: "no_encontrado",
            mensaje: "No encontré esa propiedad en el inventario. Pedí la referencia o una de las opciones listadas.",
          };
        }
        if ("ambiguo" in r) {
          return {
            error: "ambiguo",
            mensaje: "Ese nombre coincide con varias propiedades. Pedí que elija una:",
            candidatos: r.candidatos,
          };
        }
        found = r;
      }

      // Si falta la foto, se scrapa la ficha ahora (timeout corto) y se cachea.
      const enriched = (await enrichPropiedad(env, db, found.key, { timeoutMs: 25_000 })) ?? found;
      const img = enriched.imageUrl ?? null;

      const ficha = {
        referencia: enriched.codigo,
        titulo: enriched.title,
        operacion: enriched.operacion,
        tipo: enriched.tipo,
        zona: enriched.zona,
        precio: enriched.precio,
        moneda: enriched.moneda,
        recamaras: enriched.recamaras,
        banos: enriched.banos,
        estacionamiento: enriched.estacionamiento,
        m2: enriched.m2,
        m2Terreno: enriched.m2Terreno,
        estatus: enriched.estatus,
        extras: enriched.extras,
        requisitos: enriched.requisitos,
        url: enriched.listingUrl,
      };

      const ctx = getCtx();
      let fotoEnviada = false;
      let descartes: string[] = [];
      if (img && ctx) {
        const caption =
          `${enriched.title}` +
          `${enriched.operacion ? ` · ${enriched.operacion === "renta" ? "en renta" : "en venta"}` : ""}` +
          `${enriched.zona ? ` · ${enriched.zona}` : ""}` +
          `${enriched.recamaras !== null ? ` · ${enriched.recamaras} rec` : ""}` +
          ` · ${money(enriched.precio, enriched.moneda)}${enriched.operacion === "renta" ? "/mes" : ""}` +
          `${enriched.listingUrl ? `\n${enriched.listingUrl}` : ""}`;
        const { dropped } = await sendReplyCapped(ctx.channel, ctx.channelUserId, chunkReply(caption), env, {
          imageUrl: img,
        }).catch((e) => {
          console.error("[fichaPropiedad] fallo al enviar foto:", e);
          return { dropped: ["image"] };
        });
        descartes = dropped;
        fotoEnviada = dropped.length === 0;
      }

      return {
        ok: true,
        ficha,
        foto: img
          ? { enviada: fotoEnviada, descartes }
          : { enviada: false, nota: "Sin foto disponible todavía." },
        instruccion:
          "Pasale al cliente la ficha completa en texto (título, operación, zona, recámaras, baños, m², precio y estatus). " +
          "Incluí SIEMPRE el link de la ficha (url). Si un dato viene null, decí que se consulta — no lo inventes. " +
          "Cerrá proponiendo una visita y pidiendo un contacto para que un asesor lo confirme.",
      };
    },
  });
}
