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
  ensureVehicleImage,
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
        })),
        marcasDisponibles: marcasTxt,
        nota: "Ofrecé hasta 3 opciones de los matches con nombre, precio y condición, SIN enlaces. Si pidieron más, decí cuántos hay en total.",
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
      "Envía la ficha de UN auto del inventario (foto real desde su página + link de la ficha). " +
      "Usala SOLO cuando el cliente pidió ese auto puntual o dio su VIN (ej. 'mandame info de este', " +
      "'¿tenés la foto?', un VIN). Si no encuentra el auto exacto, no inventes: pedí el VIN o que elija " +
      "una de las opciones. Para listar o preguntar disponibilidad usá inventarioQuery, no esta tool.",
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

      // Foto: guardada, o bajo demanda con timeout corto (se cachea en el store).
      const img = await ensureVehicleImage(env, db, found.key, { timeoutMs: 20_000 });

      const ficha = {
        vin: found.vin,
        titulo: found.title,
        condicion: found.condition,
        precio: found.price,
        millas: found.miles,
        url: found.listingUrl,
      };

      const ctx = getCtx();
      let fotoEnviada = false;
      let descartes: string[] = [];
      if (img && ctx) {
        const caption = `${found.title}${found.condition ? ` · ${found.condition}` : ""}${found.miles !== null ? ` · ${found.miles.toLocaleString("en-US")} millas` : ""}${found.price !== null ? ` · $${found.price.toLocaleString("en-US")}` : ""}${found.listingUrl ? `\n${found.listingUrl}` : ""}`;
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
          "Dale la ficha al cliente en texto: nombre exacto, condición, millas y precio. " +
          "Incluí el link de la ficha (url) solo si el cliente la pidió. No inventes datos.",
      };
    },
  });
}
