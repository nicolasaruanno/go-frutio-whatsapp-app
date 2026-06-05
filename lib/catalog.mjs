export const demoProducts = [
  {
    id: "demo-1",
    name: "Vela Ámbar",
    description: "Vela aromática de soja, hecha a mano.",
    image:
      "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=80",
    variants: [
      { id: "demo-1-1", name: "Mediana", price: 18500, stock: 8, sku: "VEL-AM-M" },
      { id: "demo-1-2", name: "Grande", price: 24000, stock: 4, sku: "VEL-AM-G" },
    ],
  },
];

export function getPublicConfig() {
  return {
    storeName: process.env.STORE_NAME || "Go Frutio",
    whatsappNumber: sanitizePhone(process.env.WHATSAPP_NUMBER || "5491112345678"),
    defaultDiscount: clamp(Number(process.env.DEFAULT_DISCOUNT || 10), 0, 90),
    connected: Boolean(
      process.env.TIENDANUBE_STORE_ID && process.env.TIENDANUBE_ACCESS_TOKEN,
    ),
  };
}

export async function getCatalog() {
  const config = getPublicConfig();
  const products = config.connected ? await fetchTiendanubeProducts() : demoProducts;

  return {
    products,
    source: config.connected ? "tiendanube" : "demo",
    syncedAt: new Date().toISOString(),
  };
}

export async function fetchTiendanubeProducts() {
  const storeId = process.env.TIENDANUBE_STORE_ID;
  const token = process.env.TIENDANUBE_ACCESS_TOKEN;
  const userAgent =
    process.env.APP_USER_AGENT || "Catalogo WhatsApp (contacto@ejemplo.com)";
  const products = [];
  let page = 1;

  while (true) {
    const apiUrl = new URL(
      `https://api.tiendanube.com/v1/${storeId}/products`,
    );
    apiUrl.searchParams.set("published", "true");
    apiUrl.searchParams.set("per_page", "200");
    apiUrl.searchParams.set("page", String(page));

    const apiResponse = await fetch(apiUrl, {
      headers: {
        Authentication: `bearer ${token}`,
        "User-Agent": userAgent,
      },
    });

    if (!apiResponse.ok) {
      const detail = await apiResponse.text();
      throw new Error(`Tiendanube respondió ${apiResponse.status}: ${detail}`);
    }

    const batch = await apiResponse.json();
    products.push(...batch.map(normalizeProduct));

    if (batch.length < 200) break;
    page += 1;
  }

  return products;
}

export function normalizeProduct(product) {
  const attributes = (product.attributes || []).map(localizedText);
  return {
    id: String(product.id),
    name: localizedText(product.name) || "Producto sin nombre",
    description: stripHtml(localizedText(product.description)),
    image: product.images?.[0]?.src || "",
    variants: (product.variants || []).map((variant) => ({
      id: String(variant.id),
      name:
        (variant.values || [])
          .map((value, index) => {
            const label = attributes[index];
            const text = localizedText(value);
            return label ? `${label}: ${text}` : text;
          })
          .filter(Boolean)
          .join(" · ") || "Única opción",
      price: Number(variant.price || 0),
      stock:
        variant.stock_management === false || variant.stock === null
          ? null
          : Number(variant.stock || 0),
      sku: variant.sku || "",
    })),
  };
}

export function localizedText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.es || value["es-AR"] || value.pt || value.en || Object.values(value)[0] || "";
}

export function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(
      /&(aacute|eacute|iacute|oacute|uacute|ntilde|uuml|Aacute|Eacute|Iacute|Oacute|Uacute|Ntilde|Uuml);/g,
      (entity) =>
        ({
          "&aacute;": "á",
          "&eacute;": "é",
          "&iacute;": "í",
          "&oacute;": "ó",
          "&uacute;": "ú",
          "&ntilde;": "ñ",
          "&uuml;": "ü",
          "&Aacute;": "Á",
          "&Eacute;": "É",
          "&Iacute;": "Í",
          "&Oacute;": "Ó",
          "&Uacute;": "Ú",
          "&Ntilde;": "Ñ",
          "&Uuml;": "Ü",
        })[entity] || entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizePhone(value) {
  return String(value).replace(/\D/g, "");
}

export function clamp(value, min, max) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}
