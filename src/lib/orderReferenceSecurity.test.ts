import assert from "node:assert/strict";
import test from "node:test";
import {
  OrderReferenceValidationError,
  displayOrderReference,
  extractOrderReferencePath,
  sanitizeSubmittedOrderReferences,
  storageOrderReference
} from "./orderReferenceSecurity.ts";

const supabaseUrl = "https://project.supabase.co";

test("stores uploaded references as private storage markers", () => {
  assert.equal(storageOrderReference("WEB-1/design.png"), "storage:WEB-1/design.png");
});

test("extracts private markers and legacy Supabase public URLs", () => {
  assert.equal(extractOrderReferencePath("storage:WEB-1/design.png", supabaseUrl), "WEB-1/design.png");
  assert.equal(
    extractOrderReferencePath(
      `${supabaseUrl}/storage/v1/object/public/order-references/WEB-1/design.png`,
      supabaseUrl
    ),
    "WEB-1/design.png"
  );
});

test("rejects traversal and references hosted outside the project", () => {
  assert.equal(extractOrderReferencePath("storage:../secret.png", supabaseUrl), null);
  assert.throws(
    () => sanitizeSubmittedOrderReferences(["https://attacker.example/tracker.png"], supabaseUrl),
    /referencia no permitida/i
  );
});

test("keeps safe filenames when storage is unavailable", () => {
  assert.deepEqual(sanitizeSubmittedOrderReferences(["frente.png", "espalda.webp"], supabaseUrl), [
    "frente.png",
    "espalda.webp"
  ]);
});

test("uses a validation error for unsafe submitted references", () => {
  assert.throws(
    () => sanitizeSubmittedOrderReferences(["https://attacker.example/tracker.png"], supabaseUrl),
    OrderReferenceValidationError
  );
});

test("preserves trusted historical HTTP references for the authenticated dashboard", () => {
  assert.equal(
    displayOrderReference("https://cdn.example.com/orders/reference.png"),
    "https://cdn.example.com/orders/reference.png"
  );
  assert.equal(displayOrderReference("javascript:alert(1)"), "Referencia no disponible");
});
