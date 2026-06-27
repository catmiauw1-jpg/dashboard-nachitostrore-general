import assert from "node:assert/strict";
import test from "node:test";
import { formatWhatsappMessage } from "./whatsappMessageFormatting.ts";

test("keeps intentional WhatsApp paragraphs and normalizes excess whitespace", () => {
  assert.equal(
    formatWhatsappMessage("Hola.\n\n\n  Tenemos poleras.  \n\nVisita la web."),
    "Hola.\n\nTenemos poleras.\n\nVisita la web."
  );
});

test("adds readable spacing to a single AI paragraph without breaking the URL", () => {
  assert.equal(
    formatWhatsappMessage(
      "¡Hola! 👋 Muy bien, gracias. Para ver el catálogo visita: 👉 https://nachitostore.vercel.app Ahí eliges catálogo o personalizada."
    ),
    "¡Hola!\n\n👋 Muy bien, gracias.\n\nPara ver el catálogo visita:\n\n👉 https://nachitostore.vercel.app\n\nAhí eliges catálogo o personalizada."
  );
});

test("preserves compact list lines", () => {
  assert.equal(
    formatWhatsappMessage("Tallas disponibles:\n• M: 56 cm\n• L: 58 cm\n• XL: 60 cm"),
    "Tallas disponibles:\n• M: 56 cm\n• L: 58 cm\n• XL: 60 cm"
  );
});
