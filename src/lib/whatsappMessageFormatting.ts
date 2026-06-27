const sentenceBoundary = /([.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¡¿\p{Extended_Pictographic}])/gu;
const linkedCallToAction = /\s+(👉\s*https?:\/\/\S+)/giu;
const trailingUrlText = /(https?:\/\/\S+)\s+(?=[A-ZÁÉÍÓÚÜÑ¡¿])/gu;

export function formatWhatsappMessage(value: unknown, maxLength = 1800) {
  if (typeof value !== "string") return "";

  let formatted = value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!formatted.includes("\n")) {
    formatted = formatted
      .replace(linkedCallToAction, "\n\n$1")
      .replace(trailingUrlText, "$1\n\n")
      .replace(sentenceBoundary, "$1\n\n");
  }

  return formatted.replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength);
}
