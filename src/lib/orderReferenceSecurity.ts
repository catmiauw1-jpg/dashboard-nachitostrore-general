const storagePrefix = "storage:";
const referenceBucket = "order-references";

export class OrderReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderReferenceValidationError";
  }
}

function validStoragePath(value: string) {
  const path = value.trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\") || path.length > 500) return null;
  return path;
}

export function storageOrderReference(path: string) {
  const safePath = validStoragePath(path);
  if (!safePath) throw new OrderReferenceValidationError("Ruta de referencia no permitida.");
  return `${storagePrefix}${safePath}`;
}

export function extractOrderReferencePath(value: string, supabaseUrl?: string) {
  const reference = value.trim();
  if (reference.startsWith(storagePrefix)) return validStoragePath(reference.slice(storagePrefix.length));
  if (!supabaseUrl || !reference.startsWith(`${supabaseUrl}/storage/v1/object/`)) return null;

  try {
    const url = new URL(reference);
    const marker = `/${referenceBucket}/`;
    const markerIndex = url.pathname.indexOf(marker);
    return markerIndex >= 0 ? validStoragePath(decodeURIComponent(url.pathname.slice(markerIndex + marker.length))) : null;
  } catch {
    return null;
  }
}

export function sanitizeSubmittedOrderReferences(values: unknown[], supabaseUrl?: string) {
  return values.map((value) => {
    if (typeof value !== "string") throw new OrderReferenceValidationError("Referencia no permitida.");
    const reference = value.trim();
    const storagePath = extractOrderReferencePath(reference, supabaseUrl);
    if (storagePath) return storageOrderReference(storagePath);
    if (/^https?:\/\//i.test(reference)) throw new OrderReferenceValidationError("Referencia no permitida.");
    if (!/^[^\\/<>:"|?*]{1,180}\.(?:jpe?g|png|webp|gif)$/i.test(reference)) {
      throw new OrderReferenceValidationError("Referencia no permitida.");
    }
    return reference;
  });
}

export function displayOrderReference(value: string) {
  const reference = value.trim();
  try {
    const url = new URL(reference);
    return url.protocol === "http:" || url.protocol === "https:" ? reference : "Referencia no disponible";
  } catch {
    return reference;
  }
}
