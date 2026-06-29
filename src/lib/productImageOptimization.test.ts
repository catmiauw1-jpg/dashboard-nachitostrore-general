import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  MAX_PRODUCT_IMAGE_DIMENSION,
  ProductImageError,
  optimizeProductImage
} from "./productImageOptimization.ts";

test("rejects bytes that cannot be decoded as an image", async () => {
  await assert.rejects(
    optimizeProductImage(Buffer.from("this is not an image")),
    (error: unknown) =>
      error instanceof ProductImageError &&
      error.message === "El archivo no contiene una imagen válida o está dañado."
  );
});

test("rejects a decodable image whose actual format is not allowed", async () => {
  const tiff = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#ffffff" }
  })
    .tiff()
    .toBuffer();

  await assert.rejects(
    optimizeProductImage(tiff),
    (error: unknown) =>
      error instanceof ProductImageError &&
      error.message === "El formato real de la imagen no está permitido. Usa JPG, PNG, WEBP o GIF."
  );
});

test("auto-rotates, limits dimensions, converts to WebP, and strips metadata", async () => {
  const source = await sharp({
    create: {
      width: 3000,
      height: 1000,
      channels: 3,
      background: "#e44d5f"
    }
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const optimized = await optimizeProductImage(source);
  const metadata = await sharp(optimized).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, MAX_PRODUCT_IMAGE_DIMENSION);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
});

test("does not enlarge images already within the dimension limit", async () => {
  const source = await sharp({
    create: {
      width: 320,
      height: 180,
      channels: 4,
      background: { r: 30, g: 80, b: 160, alpha: 0.5 }
    }
  })
    .png()
    .toBuffer();

  const optimized = await optimizeProductImage(source);
  const metadata = await sharp(optimized).metadata();

  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 180);
  assert.equal(metadata.hasAlpha, true);
});

test("uses a practical WebP quality that reduces a photographic payload", async () => {
  const pixels = randomBytes(900 * 600 * 3);
  const source = await sharp(pixels, { raw: { width: 900, height: 600, channels: 3 } })
    .jpeg({ quality: 100 })
    .toBuffer();

  const optimized = await optimizeProductImage(source);

  assert.ok(optimized.length < source.length);
});
