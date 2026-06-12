import test from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage, prepareDraftOrder } from "../lib/orders.mjs";

const products = [
  {
    id: "10",
    name: "Frutillas",
    variants: [{ id: "20", price: 10000, stock: 5 }],
  },
];

const customer = {
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@example.com",
  phone: "1112345678",
  document: "30111222",
  address: "Avenida Siempre Viva",
  number: "742",
  floor: "2 B",
  locality: "Palermo",
  city: "CABA",
  province: "Buenos Aires",
  zipcode: "1425",
  note: "Llamar al llegar",
};

test("prepara un pedido con descuento y nota de origen", () => {
  const result = prepareDraftOrder(
    {
      reference: "web-123",
      customer,
      paymentAlias: "go.frutio",
      items: [{ variantId: "20", quantity: 2, directPrice: 8500 }],
    },
    products,
    { maxDiscount: 30 },
  );

  assert.equal(result.subtotal, 20000);
  assert.equal(result.total, 17000);
  assert.equal(result.payload.discount, "15.00");
  assert.equal(result.payload.discount_type, "percentage");
  assert.match(result.payload.note, /PEDIDO ORIGINADO EN APP WHATSAPP/);
  assert.match(result.payload.note, /Avenida Siempre Viva 742 2 B/);
  assert.match(result.payload.note, /Transferencia pendiente al alias: go.frutio/);
  assert.equal(result.payload.shipping.cost, "0.00");
  assert.deepEqual(result.payload.products, [{ variant_id: 20, quantity: 2 }]);
  assert.equal("cpf_cnpj" in result.payload, false);
});

test("rechaza precios con descuento superior al permitido", () => {
  assert.throws(
    () =>
      prepareDraftOrder(
        {
          customer,
          items: [{ variantId: "20", quantity: 1, directPrice: 5000 }],
        },
        products,
        { maxDiscount: 30 },
      ),
    /precio/i,
  );
});

test("rechaza cantidades superiores al stock", () => {
  assert.throws(
    () =>
      prepareDraftOrder(
        {
          customer,
          items: [{ variantId: "20", quantity: 6, directPrice: 8500 }],
        },
        products,
      ),
    /stock/i,
  );
});

test("permite un precio especial con hasta 40% de descuento", () => {
  const result = prepareDraftOrder(
    {
      customer,
      items: [{ variantId: "20", quantity: 1, directPrice: 6666.67 }],
    },
    products,
    { maxDiscount: 40 },
  );

  assert.equal(result.total, 6666.67);
});

test("muestra los errores estructurados de Tiendanube", () => {
  assert.equal(
    apiErrorMessage(
      { errors: { products: ["La variante no está disponible"] } },
      "Error",
    ),
    "Tiendanube: La variante no está disponible",
  );
});

test("conserva los datos de entrega en la nota interna", () => {
  const result = prepareDraftOrder(
    {
      customer: { ...customer, document: "", floor: "", locality: "" },
      items: [{ variantId: "20", quantity: 1, directPrice: 8500 }],
    },
    products,
  );

  assert.equal("cpf_cnpj" in result.payload, false);
  assert.equal(result.payload.shipping.cost, "0.00");
  assert.match(result.payload.note, /Entrega: Avenida Siempre Viva 742/);
  assert.match(result.payload.note, /Localidad: CABA, Buenos Aires, 1425/);
});
