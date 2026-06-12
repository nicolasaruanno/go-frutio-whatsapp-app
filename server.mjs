import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applyAppPrices,
  clamp,
  fetchTiendanubeProducts,
  getCatalog,
  getPublicConfig,
  localizedText,
  normalizeProduct,
  parseCsv,
  parseSheetNumber,
  sanitizePhone,
  stripHtml,
} from "./lib/catalog.mjs";
import { createTiendanubeOrder } from "./lib/orders.mjs";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(rootDir, "public");

await loadEnv(join(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/config") {
      return sendJson(response, 200, getPublicConfig());
    }

    if (request.method === "GET" && url.pathname === "/api/products") {
      try {
        return sendJson(response, 200, await getCatalog());
      } catch (error) {
        console.error("No se pudieron obtener productos de Tiendanube:", error);
        return sendJson(response, 502, {
          error:
            "No pudimos sincronizar Tiendanube. Revisá el ID de tienda, el token y el permiso read_products.",
        });
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/tiendanube-prices.csv"
    ) {
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
        return sendCsv(response, 200, rows);
      } catch (error) {
        console.error("No se pudo generar el feed de precios:", error);
        return sendCsv(response, 502, [
          ["Error", "No se pudo sincronizar Tiendanube."],
        ]);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      try {
        const body = await readJsonBody(request);
        return sendJson(response, 201, {
          order: await createTiendanubeOrder(body),
        });
      } catch (error) {
        return sendJson(response, error.status || 500, {
          error: error.message || "No se pudo crear el pedido.",
          code: error.code || "internal_error",
        });
      }
    }

    if (request.method !== "GET") {
      return sendJson(response, 405, { error: "Método no permitido" });
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Error interno" });
  }
});

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Catálogo disponible en http://localhost:${port}`);
  });
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw new Error("Pedido demasiado grande.");
  }
  return JSON.parse(body || "{}");
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    return sendJson(response, 403, { error: "Acceso denegado" });
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeType(filePath),
      "Cache-Control": filePath.endsWith(".html")
        ? "no-cache"
        : "public, max-age=3600",
    });
    response.end(data);
  } catch {
    const index = await readFile(join(publicDir, "index.html"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(index);
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sendCsv(response, status, rows) {
  response.writeHead(status, {
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n"),
  );
}

function mimeType(filePath) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    }[extname(filePath)] || "application/octet-stream"
  );
}

async function loadEnv(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      value = value.replace(/^(['"])(.*)\1$/, "$2");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export {
  applyAppPrices,
  clamp,
  localizedText,
  normalizeProduct,
  parseCsv,
  parseSheetNumber,
  sanitizePhone,
  stripHtml,
};
