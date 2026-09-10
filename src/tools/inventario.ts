// Tools del INVENTARIO estructurado (Web Sync modo inventario).
//
// Cierran el círculo anti-alucinación del bot de autos:
//   - inventarioQuery responde SOLO con lo que hay sincronizado (marcas,
//     modelos, precios, VINs). Si la marca pedida no está, devuelve 0 matches y
//     las marcas disponibles — el bot NO contesta de memoria.
//   - fichaAuto entrega la ficha de UN auto (link real + foto de su página)
//     únicamente cuando el cliente pide ese auto puntual o da su VIN. La URL
//     sale del store parseado, nunca la inventa el modelo.
//
// Se registran SIEMPRE (patrón catalogQuery): si no hay store cargado, ambas
// devuelven una guía para que el modelo use searchKb / sus documentos.
import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { chunkReply } from "../replies/chunker";
import { sendReplyCapped } from "../replies/sender";
import type { ChannelId } from "../channels/shared";
import {
  loadVehicleStore,
  listStoredVehicles,
  queryInventory,
  findVehicleByVin,
  ensureVehicleDetails,
  type StoredVehicle,
} from "../kb/inventory";

/** Contexto con el canal real (lo inyecta el agente — ver enviarRecurso). */
export interface InventarioCtx {
  channel: ChannelId;
  channelUserId: string;
}

function vehicleLine(v: StoredVehicle): string {
  const parts = [v.title];
  if (v.condition) parts.push(v.condition);
  if (v.miles !== null) parts.push(`${v.miles.toLocaleString("en-US")} millas`);
  if (v.price !== null) parts.push(`$${v.price.toLocaleString("en-US")}`);
  if (v.vin) parts.push(`VIN ${v.vin}`);
  return parts.join(" · ");
}

function noInventoryGuide(): {
  sinInventario: true;
  guia: string;
} {
  return {
    sinInventario: true,
    guia:
      "Esta instalación no tiene inventario web sincronizado. Respondé con lo que " +
      "devuelva searchKb o con los documentos del negocio; no inventes autos ni catálogos.",
  };
}

export function inventarioQueryTool(env: Env) {
  return tool({
    description:
      "Consulta EXACTA del inventario de autos sincronizado desde el sitio del negocio. " +
      "Usala SIEMPRE que el cliente pregunte por autos, disponibilidad, marcas, modelos, precios, " +
      "rango de precio, condición (nuevo/usado) o un VIN — nunca contestes inventario de memoria ni con la KB. " +
      "Devuelve SOLO lo que hay en " +
      "el listado: si una marca o modelo no aparece en los resultados, NO existe en el " +
      "inventario — decilo y ofrecé las marcas disponibles que devuelve la tool. " +
      "Nunca menciones autos, precios ni marcas que no devuelva esta tool.",
    inputSchema: z.object({
      marca: z.string().optional().describe("Marca exacta, ej. Kia, Toyota, Chevrolet"),
      modelo: z.string().optional().describe("Modelo o parte del modelo, ej. Sorento, Telluride"),
      condicion: z
        .enum(["nuevo", "usado", "certificado"])
        .optional()
        .describe("Nuevo, usado o certificado"),
      precioMin: z.number().optional().describe("Precio mínimo en USD"),
      precioMax: z.number().optional().describe("Precio máximo en USD"),
      vin: z.string().optional().describe("VIN exacto (17 caracteres)"),
      consulta: z
        .string()
        .optional()
        .describe("Términos libres que deben aparecer (ej. 'sorento 2022 usado')"),
    }),
    execute: async ({ marca, modelo, condicion, precioMin, precioMax, vin, consulta }) => {
      const db = new Db(env.DB);
      const store = await loadVehicleStore(db);
      if (listStoredVehicles(store).length === 0) return noInventoryGuide();

      const res = queryInventory(store, { marca, modelo, condicion, precioMin, precioMax, vin, consulta }, 8);
      const marcasTxt = res.marcas.length
        ? res.marcas.map((m) => `${m.marca} (${m.total})`).join(", ")
        : "";
      if (res.total === 0) {
        return {
          encontrados: 0,
          filtro: { marca, modelo, condicion, precioMin, precioMax, vin },
          marcasDisponibles: marcasTxt,
          mensaje:
            "No hay autos que cumplan ese filtro en el inventario. No digas que sí hay: " +
            "informá que no está disponible y ofrecé las marcas disponibles.",
        };
      }
      return {
        encontrados: res.total,
        matches: res.matches.map((m) => ({
          vin: m.vin,
          titulo: m.title,
          condicion: m.condition,
          precio: m.price,
          millas: m.miles,
          url: m.listingUrl,
        })),
        marcasDisponibles: marcasTxt,
        nota:
          "Ofrecé hasta 3 opciones con nombre, condición, precio, millas y el link (url) de la ficha. " +
          "Si un precio viene null, decí que se consulta — no lo inventes. " +
          "Si el cliente elige un auto puntual o da un VIN, llamá a fichaAuto para mandarle la ficha completa con foto y link.",
      };
    },
  });
}

export function fichaAutoTool(
  env: Env,
  getCtx: () => InventarioCtx | null,
) {
  return tool({
    description:
      "Envía la ficha COMPLETA de UN auto del inventario (foto real desde su página + link de la ficha + precio, millas, condición y VIN). " +
      "Usala SIEMPRE que el cliente pida ver/consultar/mandar UN auto concreto — por nombre, modelo, año o VIN (ej. 'muestrame la RAV4', 'info del Telluride', 'cuánto cuesta la Sorento', 'mandame la foto', un VIN). " +
      "Para listar disponibilidad general o preguntar por una marca usá inventarioQuery, no esta tool. Si no encuentra el auto exacto, no inventes: pedí el VIN o que elija una de las opciones.",
    inputSchema: z.object({
      vin: z.string().optional().describe("VIN del auto (17 caracteres)"),
      auto: z.string().optional().describe("Título exacto del auto tal como apareció en la lista (si no hay VIN)"),
    }),
    execute: async ({ vin, auto }) => {
      if (!vin && !auto) {
        return { error: "sin_datos", mensaje: "Necesito el VIN o el nombre exacto del auto." };
      }
      const db = new Db(env.DB);
      const store = await loadVehicleStore(db);
      const all = listStoredVehicles(store);
      if (all.length === 0) return noInventoryGuide();

      let found: StoredVehicle | null = null;
      if (vin) {
        found = findVehicleByVin(store, vin);
        if (!found) {
          return {
            error: "no_encontrado",
            mensaje: `No hay ningún auto con VIN ${vin} en el inventario. Decíselo al cliente sin inventar.`,
          };
        }
      } else {
        const needle = String(auto ?? "").trim().toLowerCase();
        const exact = all.filter((v) => v.title.toLowerCase() === needle);
        const sub = exact.length === 0 ? all.filter((v) => v.title.toLowerCase().includes(needle)) : [];
        if (exact.length === 1) found = exact[0];
        else if (sub.length === 1) found = sub[0];
        else if (sub.length > 1) {
          return {
            error: "ambiguo",
            mensaje: "Ese nombre coincide con varios autos. Pedí que elija uno:",
            candidatos: sub.slice(0, 3).map((v) => vehicleLine(v)),
          };
        } else {
          return {
            error: "no_encontrado",
            mensaje: "No encontré ese auto en el inventario. Pedí el VIN o una de las opciones listadas.",
          };
        }
      }

      // Ficha completa: si falta foto o precio, scrapea la ficha ahora (timeout
      // corto) y cachea foto + precio + millas en el store.
      const enriched = (await ensureVehicleDetails(env, db, found.key, { timeoutMs: 25_000 })) ?? found;
      const img = enriched.imageUrl && enriched.imgStatus === "ok" ? enriched.imageUrl : null;

      const ficha = {
        vin: enriched.vin,
        titulo: enriched.title,
        condicion: enriched.condition,
        precio: enriched.price,
        millas: enriched.miles,
        url: enriched.listingUrl,
      };

      const ctx = getCtx();
      let fotoEnviada = false;
      let descartes: string[] = [];
      if (img && ctx) {
        const caption = `${enriched.title}${enriched.condition ? ` · ${enriched.condition}` : ""}${enriched.miles !== null ? ` · ${enriched.miles.toLocaleString("en-US")} millas` : ""}${enriched.price !== null ? ` · $${enriched.price.toLocaleString("en-US")}` : ""}${enriched.listingUrl ? `\n${enriched.listingUrl}` : ""}`;
        const { dropped } = await sendReplyCapped(
          ctx.channel,
          ctx.channelUserId,
          chunkReply(caption),
          env,
          { imageUrl: img },
        ).catch((e) => {
          console.error("[fichaAuto] fallo al enviar foto:", e);
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
          : { enviada: false, nota: "Sin foto disponible todavía (se intenta de noche)." },
        instruccion:
          "Pasale al cliente la ficha COMPLETA en texto: nombre exacto, condición, millas, precio y VIN. " +
          "Incluí SIEMPRE el link de la ficha (url). Si algún dato viene null, decí que se consulta — no lo inventes.",
      };
    },
  });
}
