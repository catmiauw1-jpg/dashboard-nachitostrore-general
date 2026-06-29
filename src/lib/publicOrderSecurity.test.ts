import assert from "node:assert/strict";
import test from "node:test";
import type { Order, Product } from "../types/index.ts";
import { PublicOrderValidationError, securePublicOrder } from "./publicOrderSecurity.ts";

const catalogProduct: Product = {
  id: "prod-1",
  name: "Tokyo Ghoul - Kaneki",
  category: "Oversize",
  basePrice: 175,
  colors: ["Blanco arena"],
  sizes: ["M", "L", "XL"]
};

function publicOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "#WEB-123",
    customer: "Mateo",
    type: "Catálogo",
    product: catalogProduct.name,
    color: "Blanco arena",
    size: "L",
    payment: "Pago completo",
    status: "Entregado",
    total: 1,
    channel: "Manual",
    prendas: 2,
    source: "Manual",
    items: [
      {
        productName: catalogProduct.name,
        color: "Blanco arena",
        size: "L",
        quantity: 2,
        unitPrice: 1,
        lineTotal: 2
      }
    ],
    ...overrides
  };
}

test("forces protected fields and catalog prices from the server", () => {
  const original = publicOrder();
  const secured = securePublicOrder(original, [catalogProduct]);

  assert.notStrictEqual(secured, original);
  assert.equal(original.total, 1);
  assert.equal(secured.payment, "Pendiente");
  assert.equal(secured.status, "Esperando pago");
  assert.equal(secured.channel, "Web");
  assert.equal(secured.source, "Web catálogo");
  assert.equal(secured.botStatus, "Esperando comprobante");
  assert.equal(secured.total, 350);
  assert.equal(secured.items?.[0]?.unitPrice, 175);
  assert.equal(secured.items?.[0]?.lineTotal, 350);
});

test("rejects catalog products that are hidden, sold out or unknown", () => {
  assert.throws(() => securePublicOrder(publicOrder(), [{ ...catalogProduct, isHidden: true }]), /no est[aá] disponible/i);
  assert.throws(() => securePublicOrder(publicOrder(), [{ ...catalogProduct, isSoldOut: true }]), /agotad/i);
  assert.throws(
    () => securePublicOrder(publicOrder({ product: "Producto inventado", items: [] }), [catalogProduct]),
    /no existe/i
  );
});

test("keeps custom totals but still removes client-controlled workflow state", () => {
  const secured = securePublicOrder(
    publicOrder({
      type: "Personalizada",
      product: "Polera personalizada",
      total: 155,
      prendas: 1,
      items: []
    }),
    [catalogProduct]
  );

  assert.equal(secured.total, 155);
  assert.equal(secured.source, "Web personaliza");
  assert.equal(secured.payment, "Pendiente");
  assert.equal(secured.status, "Esperando pago");
});

test("rejects a custom order whose total does not cover every garment", () => {
  assert.throws(
    () =>
      securePublicOrder(
        publicOrder({
          type: "Personalizada",
          product: "Polera personalizada",
          total: 145,
          prendas: 20,
          items: []
        }),
        [catalogProduct]
      ),
    /precio.*no es v[a\u00e1]lido/i
  );
});

test("accepts the authoritative custom tier for every garment and replaces a client id", () => {
  const secured = securePublicOrder(
    publicOrder({
      id: "PEDIDO-ELEGIDO-POR-CLIENTE",
      type: "Personalizada",
      product: "Polera personalizada",
      total: 290,
      prendas: 2,
      items: []
    }),
    [catalogProduct]
  );

  assert.match(secured.id, /^#WEB-[A-F0-9-]+$/);
  assert.notEqual(secured.id, "PEDIDO-ELEGIDO-POR-CLIENTE");
  assert.equal(secured.total, 290);
  assert.equal(secured.prendas, 2);
});

test("uses a validation error for rejected public order input", () => {
  assert.throws(
    () => securePublicOrder(publicOrder({ product: "Producto inventado", items: [] }), [catalogProduct]),
    PublicOrderValidationError
  );
});
