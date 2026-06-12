import { fetchTiendanubeProducts } from "../lib/catalog.mjs";

export default async function handler(request, response) {
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    const products = await fetchTiendanubeProducts();
    const rows = [
      [
        "Variant ID",
        "Product ID",
        "Producto",
        "Variante",
        "SKU",
        "Stock",
        "Precio Tiendanube",
        "Transferencia 10% OFF",
      ],
    ];

    for (const product of products) {
      for (const variant of product.variants || []) {
        rows.push([
          variant.id,
          product.id,
          product.name,
          variant.name,
          variant.sku,
          variant.stock ?? "",
          variant.price,
          Math.round(variant.price * 0.9),
        ]);
      }
    }

    response.status(200).send(rows.map(csvRow).join("\n"));
  } catch (error) {
    console.error("No se pudo generar el feed de precios:", error);
    response.status(502).send(
      csvRow([
        "Error",
        "No se pudo sincronizar Tiendanube. Revisá las credenciales.",
      ]),
    );
  }
}

function csvRow(values) {
  return values
    .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
    .join(",");
}
