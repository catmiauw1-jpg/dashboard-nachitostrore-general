import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Product } from "@/types";

const catalogFile = path.join(process.cwd(), "data", "catalog-products.json");

export async function readCatalogProducts(): Promise<Product[]> {
  try {
    const content = await readFile(catalogFile, "utf-8");
    return JSON.parse(content) as Product[];
  } catch {
    return [];
  }
}

export async function writeCatalogProducts(products: Product[]) {
  await mkdir(path.dirname(catalogFile), { recursive: true });
  await writeFile(catalogFile, `${JSON.stringify(products, null, 2)}\n`, "utf-8");
}

export function jsonHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
