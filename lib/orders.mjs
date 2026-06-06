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
    throw orderError(
      draft.message || draft.description || "Tiendanube rechazó el pedido.",
      502,
      "draft_order_failed",
    );
  }

  const confirmResponse = await fetch(
    `https://api.tiendanube.com/v1/${storeId}/draft_orders/${draft.id}/confirm`,
    { method: "POST", headers },
  );
  const order = await parseApiResponse(confirmResponse);
  if (!confirmResponse.ok) {
    throw orderError(
      order.message || order.description || "No se pudo confirmar el pedido.",
      502,
      "order_confirmation_failed",
    );
  }

  return {
    id: order.id,
    number: order.number,
    total: Number(order.total || prepared.total),
    status: order.status,
    paymentStatus: order.payment_status,
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

  const address = {
    address: clean(customer.address),
    number: clean(customer.number),
    floor: clean(customer.floor),
    locality: clean(customer.locality),
    city: clean(customer.city),
    province: clean(customer.province),
    zipcode: clean(customer.zipcode),
  };
  const reference = clean(input.reference).slice(0, 80);
  const customerNote = clean(customer.note).slice(0, 500);
  const noteParts = [
    "PEDIDO ORIGINADO EN APP WHATSAPP",
    reference ? `Referencia: ${reference}` : "",
    customer.document ? `DNI/CUIT: ${clean(customer.document)}` : "",
    customerNote ? `Observaciones: ${customerNote}` : "",
  ].filter(Boolean);

  return {
    subtotal,
    total,
    payload: {
      contact_name: clean(customer.firstName),
      contact_lastname: clean(customer.lastName),
      contact_email: clean(customer.email).toLowerCase(),
      contact_phone: clean(customer.phone),
      cpf_cnpj: clean(customer.document),
      payment_status: "unpaid",
      sale_channel: "App WhatsApp",
      note: noteParts.join(" | "),
      products: orderProducts,
      discount: Math.max(0, subtotal - total).toFixed(2),
      discount_type: "absolute",
      shipping: {
        cost: "0.00",
        shipping_address: address,
      },
    },
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

function orderError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function parseApiResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}
