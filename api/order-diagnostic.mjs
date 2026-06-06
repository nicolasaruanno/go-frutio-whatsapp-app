export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (
    request.method !== "POST" ||
    !process.env.ORDER_DIAGNOSTIC_SECRET ||
    request.headers.authorization !==
      `Bearer ${process.env.ORDER_DIAGNOSTIC_SECRET}`
  ) {
    return response.status(404).json({ error: "No disponible." });
  }

  const storeId = process.env.TIENDANUBE_STORE_ID;
  const token = process.env.TIENDANUBE_ACCESS_TOKEN;
  const headers = {
    Authentication: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent":
      process.env.APP_USER_AGENT || "Catalogo WhatsApp (contacto@ejemplo.com)",
  };
  const variantId = 1513671832;
  const payload = {
    contact_name: "Prueba técnica",
    contact_lastname: "Go Frutio",
    contact_email: "frutio.ar@gmail.com",
    products: [{ variant_id: variantId, quantity: 1 }],
  };

  const draftResponse = await fetch(
    `https://api.tiendanube.com/v1/${storeId}/draft_orders`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  const raw = await draftResponse.text();
  let draft = {};
  try {
    draft = raw ? JSON.parse(raw) : {};
  } catch {
    draft = {};
  }

  let deleteStatus = null;
  if (draftResponse.ok && draft.id) {
    const deleteResponse = await fetch(
      `https://api.tiendanube.com/v1/${storeId}/draft_orders/${draft.id}`,
      { method: "DELETE", headers },
    );
    deleteStatus = deleteResponse.status;
  }

  return response.status(200).json({
    createStatus: draftResponse.status,
    response: raw.slice(0, 1000),
    draftId: draft.id || null,
    deleteStatus,
  });
}
