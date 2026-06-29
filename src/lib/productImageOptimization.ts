import sharp from "sharp";

export const MAX_PRODUCT_IMAGE_DIMENSION = 2400;

const MAX_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 82;
const allowedDecodedFormats = new Set(["jpeg", "png", "webp", "gif"]);

export class ProductImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageError";
  }
}

export async function optimizeProductImage(input: Buffer): Promise<Buffer> {
  try {
    const image = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true
    });
    const metadata = await image.metadata();

    if (!metadata.format) {
      throw new ProductImageError("El archivo no contiene una imagen válida o está dañado.");
    }

    if (!allowedDecodedFormats.has(metadata.format)) {
      throw new ProductImageError(
        "El formato real de la imagen no está permitido. Usa JPG, PNG, WEBP o GIF."
      );
    }

    return await image
      .rotate()
      .resize({
        width: MAX_PRODUCT_IMAGE_DIMENSION,
        height: MAX_PRODUCT_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: WEBP_QUALITY, alphaQuality: 90, effort: 4, smartSubsample: true })
      .toBuffer();
  } catch (error) {
    if (error instanceof ProductImageError) {
      throw error;
    }

    throw new ProductImageError("El archivo no contiene una imagen válida o está dañado.");
  }
}
