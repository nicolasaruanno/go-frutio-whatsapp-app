import { getCatalog } from "../lib/catalog.mjs";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  try {
    response.status(200).json(await getCatalog());
  } catch (error) {
    console.error("No se pudieron obtener productos de Tiendanube:", error);
    response.status(502).json({
      error:
        "No pudimos sincronizar Tiendanube. Revisá el ID de tienda, el token y el permiso read_products.",
    });
  }
}
