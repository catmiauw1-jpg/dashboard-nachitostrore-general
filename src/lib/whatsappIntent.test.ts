import assert from "node:assert/strict";
import test from "node:test";

import {
  parseConfirmationIntent,
  parseDeliveryIntent,
  parsePaymentIntent
} from "./whatsappIntent.ts";

test("entiende Santa Cruz expresado de forma natural", () => {
  assert.deepEqual(parseDeliveryIntent("De Santa Cruz"), { area: "santa_cruz" });
  assert.deepEqual(parseDeliveryIntent("Santa"), { area: "santa_cruz" });
  assert.deepEqual(parseDeliveryIntent("soy de scz"), { area: "santa_cruz" });
  assert.deepEqual(parseDeliveryIntent("vivo aquí en Santa Cruz"), { area: "santa_cruz" });
});

test("entiende otro departamento y extrae su nombre", () => {
  assert.deepEqual(parseDeliveryIntent("2"), { area: "otro_departamento" });
  assert.deepEqual(parseDeliveryIntent("estoy fuera de Santa Cruz"), {
    area: "otro_departamento"
  });
  assert.deepEqual(parseDeliveryIntent("soy de Cochabamba"), {
    area: "otro_departamento",
    department: "Cochabamba"
  });
  assert.deepEqual(parseDeliveryIntent("necesito envío a La Paz"), {
    area: "otro_departamento",
    department: "La Paz"
  });
});

test("no inventa una ubicación cuando el mensaje es ambiguo", () => {
  assert.equal(parseDeliveryIntent("quiero saber el precio"), null);
});

test("entiende opciones de pago expresadas naturalmente", () => {
  assert.equal(parsePaymentIntent("1"), "half");
  assert.equal(parsePaymentIntent("quiero pagar la mitad"), "half");
  assert.equal(parsePaymentIntent("pago el 50% ahora"), "half");
  assert.equal(parsePaymentIntent("2"), "full");
  assert.equal(parsePaymentIntent("quiero pagar completo"), "full");
  assert.equal(parsePaymentIntent("pago todo de una"), "full");
});

test("entiende confirmación y cancelación sin exigir palabras exactas", () => {
  assert.equal(parseConfirmationIntent("sí, todo está perfecto"), "confirm");
  assert.equal(parseConfirmationIntent("dale nomás"), "confirm");
  assert.equal(parseConfirmationIntent("confirmar"), "confirm");
  assert.equal(parseConfirmationIntent("me parece bien"), "confirm");
  assert.equal(parseConfirmationIntent("no está bien, cancélalo"), "cancel");
  assert.equal(parseConfirmationIntent("no está perfecto"), "cancel");
  assert.equal(parseConfirmationIntent("tengo una duda"), null);
});
