import { clamp, getCatalog } from "./catalog.mjs";

export async function createTiendanubeOrder(input) {
  const storeId = process.env.TIENDANUBE_STORE_ID;
  const token = process.env.TIENDANUBE_ACCESS_TOKEN;
  if (!storeId || !token) {
    throw orderError("Tiendanube no está conectada.", 503, "not_connected");
  }

  const catalog = await getCatalog();
  const prepared = prepareDraftOrder(input, catalog.products, {
    maxDiscount: Number(process.env.MAX_DIRECT_DISCOUNT || 30),
  });
  const headers = {
    Authentication: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent":
      process.env.APP_USER_AGENT || "Catalogo WhatsApp (contacto@ejemplo.com)",
  };

  const draftResponse = await fetch(
    `https://api.tiendanube.com/v1/${storeId}/draft_orders`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(prepared.payload),
    },
  );
  const draft = await parseApiResponse(draftResponse);

  if (!draftResponse.ok) {
    if (draftResponse.status === 401 || draftResponse.status === 403) {
      throw orderError(
        "La app de Tiendanube necesita el permiso write_draft_orders.",
        503,
        "orders_permission_required",
      );
    }
    const requestId =
      draftResponse.headers.get("x-request-id") ||
      draftResponse.headers.get("x-nuvemshop-request-id") ||
      draftResponse.headers.get("x-tiendanube-request-id");
    throw orderError(
      apiErrorMessage(
        draft.data,
        `Tiendanube rechazó el pedido (HTTP ${draftResponse.status}${
          requestId ? `, referencia ${requestId}` : ""
        }).`,
      ),
      502,
      "draft_order_failed",
      {
        providerStatus: draftResponse.status,
        providerResponse: safeProviderResponse(draft),
        requestId,
      },
    );
  }

  const confirmResponse = await fetch(
    `https://api.tiendanube.com/v1/${storeId}/draft_orders/${draft.data.id}/confirm`,
    { method: "POST", headers },
  );
  const order = await parseApiResponse(confirmResponse);
  if (!confirmResponse.ok) {
    throw orderError(
      apiErrorMessage(
        order.data,
        `No se pudo confirmar el pedido (HTTP ${confirmResponse.status}).`,
      ),
      502,
      "order_confirmation_failed",
      {
        providerStatus: confirmResponse.status,
        providerResponse: safeProviderResponse(order),
      },
    );
  }

  return {
    id: order.data.id,
    number: order.data.number,
    total: Number(order.data.total || prepared.total),
    status: order.data.status,
    paymentStatus: order.data.payment_status,
  };
}

export function prepareDraftOrder(input, products, options = {}) {
  const customer = input?.customer || {};
  const required = [
    ["firstName", "nombre"],
    ["lastName", "apellido"],
    ["email", "email"],
    ["phone", "teléfono"],
    ["address", "calle"],
    ["number", "número"],
    ["city", "ciudad"],
    ["province", "provincia"],
    ["zipcode", "código postal"],
  ];
  for (const [field, label] of required) {
    if (!clean(customer[field])) {
      throw orderError(`Falta completar ${label}.`, 400, "invalid_customer");
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(customer.email))) {
    throw orderError("El email no es válido.", 400, "invalid_customer");
  }

  const requestedItems = Array.isArray(input?.items) ? input.items : [];
  if (!requestedItems.length || requestedItems.length > 50) {
    throw orderError("El pedido no tiene productos válidos.", 400, "invalid_items");
  }

  const variantIndex = new Map();
  for (const product of products) {
    for (const variant of product.variants || []) {
      variantIndex.set(String(variant.id), { product, variant });
    }
  }

  const maxDiscount = clamp(Number(options.maxDiscount || 30), 0, 90);
  let subtotal = 0;
  let total = 0;
  const orderProducts = requestedItems.map((item) => {
    const match = variantIndex.get(String(item.variantId));
    const quantity = Number(item.quantity);
    if (!match || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw orderError("Hay un producto inválido en el pedido.", 400, "invalid_items");
    }
    if (match.variant.stock !== null && quantity > match.variant.stock) {
      throw orderError(
        `${match.product.name} no tiene stock suficiente.`,
        409,
        "insufficient_stock",
      );
    }

    const originalPrice = Number(match.variant.price);
    const requestedPrice = Number(item.directPrice);
    const minimumPrice = originalPrice * (1 - maxDiscount / 100);
    if (
      !Number.isFinite(requestedPrice) ||
      requestedPrice < minimumPrice - 0.01 ||
      requestedPrice > originalPrice
    ) {
      throw orderError(
        `El precio de ${match.product.name} debe actualizarse.`,
        409,
        "price_changed",
      );
    }

    subtotal += originalPrice * quantity;
    total += requestedPrice * quantity;
    return { variant_id: Number(match.variant.id), quantity };
  });

  const phone = clean(customer.phone).replace(/[^\d+]/g, "");
  const shippingCost = Math.max(0, Number(input.shippingCost) || 0);
  if (shippingCost > 100000) {
    throw orderError("El costo de envío no es válido.", 400, "invalid_shipping");
  }
  const paymentAlias = clean(input.paymentAlias).slice(0, 80);
  const reference = clean(input.reference).slice(0, 80);
  const customerNote = clean(customer.note).slice(0, 500);
  const addressLine = [
    clean(customer.address),
    clean(customer.number),
    clean(customer.floor),
  ]
    .filter(Boolean)
    .join(" ");
  const locationLine = [
    clean(customer.locality),
    clean(customer.city),
    clean(customer.province),
    clean(customer.zipcode),
  ]
    .filter(Boolean)
    .join(", ");
  const noteParts = [
    "PEDIDO ORIGINADO EN APP WHATSAPP",
    reference ? `Referencia: ${reference}` : "",
    customer.document ? `DNI/CUIT: ${clean(customer.document)}` : "",
    `Entrega: ${addressLine}`,
    `Localidad: ${locationLine}`,
    `Envío: ${shippingCost.toFixed(2)}`,
    paymentAlias ? `Transferencia pendiente al alias: ${paymentAlias}` : "",
    customerNote ? `Observaciones: ${customerNote}` : "",
  ].filter(Boolean);

  const result = {
    subtotal,
    total,
    payload: {
      contact_name: clean(customer.firstName),
      contact_lastname: clean(customer.lastName),
      contact_email: clean(customer.email).toLowerCase(),
      contact_phone: phone,
      payment_status: "unpaid",
      note: noteParts.join(" | "),
      products: orderProducts,
      discount:
        subtotal > 0
          ? (((subtotal - total) / subtotal) * 100).toFixed(2)
          : "0.00",
      discount_type: "percentage",
      shipping: {
        cost: shippingCost.toFixed(2),
      },
    },
  };
  return result;
}

function clean(value) {
  return String(value ?? "").trim();
}

export function apiErrorMessage(value, fallback) {
  const messages = collectErrorMessages(value);
  return messages.length ? `Tiendanube: ${messages.join("; ")}` : fallback;
}

function collectErrorMessages(value, path = "") {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectErrorMessages(item, path));
  }
  if (!value || typeof value !== "object") return [];

  const preferred = ["message", "description", "error", "errors"];
  const preferredMessages = preferred.flatMap((key) =>
    key in value ? collectErrorMessages(value[key], "") : [],
  );
  if (preferredMessages.length) return preferredMessages;

  return Object.entries(value).flatMap(([key, item]) => {
    const label = path ? `${path}.${key}` : key;
    const nested = collectErrorMessages(item, label);
    return nested.map((message) =>
      typeof item === "string" ? `${label}: ${message}` : message,
    );
  });
}

function orderError(message, status, code, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  Object.assign(error, details);
  return error;
}

async function parseApiResponse(response) {
  const text = await response.text();
  try {
    return { data: text ? JSON.parse(text) : {}, raw: text };
  } catch {
    return { data: {}, raw: text };
  }
}

function safeProviderResponse(response) {
  const message = apiErrorMessage(response.data, "");
  if (message) return message.slice(0, 800);
  return clean(response.raw).slice(0, 800) || "Respuesta vacía";
}
