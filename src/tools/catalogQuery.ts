import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";
import { Db } from "../db/client";
import { ProductsRepo } from "../db/products";
import { catalog } from "../../member/config.local";

// Busca en el catálogo del negocio. FUENTE: si el panel tiene productos cargados
// (tabla `products`, editable en /admin/menu) se consulta ESA — así el menú del
// panel y el bot nunca divergen. Si no hay productos, cae al catálogo estático
// de member/config.local.ts (nichos sin menú en el panel). Fail-open: ante
// cualquier error, usa el estático.
export function catalogQueryTool(env: Env) {
  return tool({
    description:
      "Busca productos en el menú/catálogo del negocio por nombre o keyword. Devuelve hasta 5 matches con precio.",
    inputSchema: z.object({
      query: z.string().min(1),
    }),
    execute: async ({ query }) => {
      const q = query.toLowerCase().trim();

      // 1) Menú del panel (D1). Es la fuente real cuando existe.
      try {
        const products = await new ProductsRepo(new Db(env.DB)).available();
        if (products.length > 0) {
          const matches = products
            .filter(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                (p.description?.toLowerCase().includes(q) ?? false) ||
                (p.category?.toLowerCase().includes(q) ?? false),
            )
            .slice(0, 5)
            .map((p) => ({
              name: p.name,
              price: p.price,
              ...(p.description ? { description: p.description } : {}),
              ...(p.category ? { category: p.category } : {}),
              ...(p.image_url ? { imageUrl: p.image_url } : {}),
            }));
          return { matches };
        }
      } catch {
        // sin D1/tabla products → cae al catálogo estático
      }

      // 2) Catálogo estático (member/config.local.ts).
      const matches = catalog
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description?.toLowerCase().includes(q) ?? false) ||
            (p.sku?.toLowerCase() === q),
        )
        .slice(0, 5);
      return { matches };
    },
  });
}
