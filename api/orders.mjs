import { createTiendanubeOrder } from "../lib/orders.mjs";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Método no permitido." });
  }

  try {
    const order = await createTiendanubeOrder(request.body);
    return response.status(201).json({ order });
  } catch (error) {
    console.error("No se pudo crear el pedido:", error);
    return response.status(error.status || 500).json({
      error: error.message || "No se pudo crear el pedido.",
      code: error.code || "internal_error",
    });
  }
}
