import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  localizedText,
  normalizeProduct,
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
