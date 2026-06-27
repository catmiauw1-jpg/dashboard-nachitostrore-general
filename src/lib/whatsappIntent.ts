export type DeliveryIntent =
  | { area: "santa_cruz" }
  | { area: "otro_departamento"; department?: string };

export type PaymentIntent = "half" | "full";
export type ConfirmationIntent = "confirm" | "cancel";

const boliviaDepartments = [
  "Beni",
  "Chuquisaca",
  "Cochabamba",
  "La Paz",
  "Oruro",
  "Pando",
  "Potosi",
  "Tarija"
] as const;

function normalizeIntentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string) {
  return ` ${text} `.includes(` ${phrase} `);
}

export function parseDeliveryIntent(value: string): DeliveryIntent | null {
  const text = normalizeIntentText(value);
  if (!text) return null;

  if (
    containsPhrase(text, "fuera de santa cruz") ||
    containsPhrase(text, "no soy de santa cruz") ||
    containsPhrase(text, "no estoy en santa cruz")
  ) {
    return { area: "otro_departamento" };
  }

  if (
    text === "1" ||
    text === "santa" ||
    text === "scz" ||
    containsPhrase(text, "santa cruz") ||
    containsPhrase(text, "soy de scz") ||
    containsPhrase(text, "vivo en scz")
  ) {
    return { area: "santa_cruz" };
  }

  const department = boliviaDepartments.find((candidate) =>
    containsPhrase(text, normalizeIntentText(candidate))
  );
  if (department) {
    return { area: "otro_departamento", department };
  }

  if (
    text === "2" ||
    containsPhrase(text, "otro departamento") ||
    containsPhrase(text, "otro depto") ||
    containsPhrase(text, "por flota")
  ) {
    return { area: "otro_departamento" };
  }

  return null;
}

export function parsePaymentIntent(value: string): PaymentIntent | null {
  const text = normalizeIntentText(value);
  if (!text) return null;

  if (
    text === "1" ||
    /(^|\s)(50%?|mitad|medio|media|adelanto|anticipo)(\s|$)/.test(text)
  ) {
    return "half";
  }

  if (
    text === "2" ||
    /(^|\s)(100%?|completo|completa|total)(\s|$)/.test(text) ||
    ["pagar todo", "pago todo", "todo de una", "pago completo"].some((phrase) =>
      containsPhrase(text, phrase)
    )
  ) {
    return "full";
  }

  return null;
}

export function parseConfirmationIntent(value: string): ConfirmationIntent | null {
  const text = normalizeIntentText(value);
  if (!text) return null;

  const cancellationPhrases = [
    "no esta bien",
    "no esta perfecto",
    "no esta correcto",
    "no es correcto",
    "mejor no",
    "no quiero",
    "quiero cancelar",
    "cancela el pedido",
    "cancelalo"
  ];
  if (
    ["no", "nop", "cancelar", "cancela", "cancelalo", "anular"].includes(text) ||
    cancellationPhrases.some((phrase) => containsPhrase(text, phrase))
  ) {
    return "cancel";
  }

  const exactConfirmations = [
    "si",
    "sii",
    "siii",
    "sip",
    "ok",
    "okay",
    "dale",
    "listo",
    "correcto",
    "confirmo",
    "confirmar",
    "adelante",
    "perfecto",
    "bien",
    "sep"
  ];
  const confirmationPhrases = [
    "esta perfecto",
    "esta bien",
    "todo bien",
    "todo esta bien",
    "todo esta perfecto",
    "asi esta bien",
    "asi esta perfecto",
    "me parece bien",
    "de acuerdo",
    "dale nomas",
    "dale no mas",
    "si esta bien",
    "si todo",
    "si dale",
    "si confirmo",
    "confirmo el pedido",
    "es correcto",
    "esta correcto"
  ];

  if (
    exactConfirmations.includes(text) ||
    confirmationPhrases.some((phrase) => containsPhrase(text, phrase))
  ) {
    return "confirm";
  }

  return null;
}
