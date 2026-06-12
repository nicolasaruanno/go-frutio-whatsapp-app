import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAppPrices,
  clamp,
  localizedText,
  normalizeProduct,
  parseCsv,
  parseSheetNumber,
  sanitizePhone,
  stripHtml,
} from "../server.mjs";

test("sanitizePhone deja sólo números", () => {
  assert.equal(sanitizePhone("+54 9 11 1234-5678"), "5491112345678");
});

test("clamp limita descuentos inválidos", () => {
  assert.equal(clamp(110, 0, 90), 90);
  assert.equal(clamp(-5, 0, 90), 0);
});

test("localizedText prioriza español", () => {
  assert.equal(localizedText({ en: "Cup", es: "Taza" }), "Taza");
});

test("stripHtml genera una descripción legible", () => {
  assert.equal(
    stripHtml("<p>Selecci&oacute;n &amp; env&iacute;o r&aacute;pido</p>"),
    "Selección & envío rápido",
  );
});

test("normalizeProduct adapta productos y variantes de Tiendanube", () => {
  const result = normalizeProduct({
    id: 10,
    name: { es: "Remera" },
    description: { es: "<p>Algodón</p>" },
    images: [{ src: "https://example.com/image.jpg" }],
    attributes: [{ es: "Talle" }],
    variants: [
      {
        id: 20,
        values: [{ es: "M" }],
        price: "12000.00",
        stock_management: true,
        stock: 3,
        sku: "REM-M",
      },
    ],
  });

  assert.deepEqual(result, {
    id: "10",
    name: "Remera",
    description: "Algodón",
    image: "https://example.com/image.jpg",
    variants: [
      {
        id: "20",
        name: "Talle: M",
        price: 12000,
        stock: 3,
        sku: "REM-M",
      },
    ],
  });
});

test("lee CSV de Google Sheets con comas y comillas", () => {
  assert.deepEqual(parseCsv('Variant ID,Producto,Precio app\n20,"Peras, premium","50.000"\n'), [
    ["Variant ID", "Producto", "Precio app"],
    ["20", "Peras, premium", "50.000"],
  ]);
});

test("convierte precios formateados por Google Sheets", () => {
  assert.equal(parseSheetNumber("$ 50.000"), 50000);
  assert.equal(parseSheetNumber("50,000.50"), 50000.5);
});

test("aplica el precio de la app por variante", () => {
  const products = [
    { id: "10", variants: [{ id: "20", price: 60000 }] },
  ];
  applyAppPrices(products, new Map([["20", 50000]]));
  assert.equal(products[0].variants[0].appPrice, 50000);
});
