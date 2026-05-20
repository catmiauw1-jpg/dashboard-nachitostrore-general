"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Product, StockItem } from "@/types";

interface StockSectionProps {
  products: Product[];
  stock: StockItem[];
  onUpdateStock: (item: StockItem) => void | Promise<void>;
  onAdjustStock: (itemId: string, delta: number) => void | Promise<void>;
}

const defaultColors = ["Blanco arena", "Negro"];
const baseSizes = ["M", "L", "XL"];
const baseProductId = "base-polera-dtf";
const baseProductName = "Polera base DTF";

function stockId(color: string, size: string) {
  return `${baseProductId}::${color}::${size}`;
}

function normalizeColor(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveColorName(value: string, colors: string[]) {
  const cleanColor = value.trim().replace(/\s+/g, " ");
  if (!cleanColor) return "";

  return colors.find((option) => normalizeColor(option) === normalizeColor(cleanColor)) ?? cleanColor;
}

export function StockSection({ stock, onUpdateStock, onAdjustStock }: StockSectionProps) {
  const colors = useMemo(
    () => [...new Set([...defaultColors, ...stock.map((item) => item.color)].filter(Boolean))],
    [stock]
  );
  const [color, setColor] = useState(defaultColors[0]);
  const [size, setSize] = useState(baseSizes[0]);
  const [quantity, setQuantity] = useState(1);
  const [min, setMin] = useState(1);

  const stockByColor = useMemo(
    () =>
      stock.reduce<Record<string, StockItem[]>>((items, item) => {
        items[item.color] = [...(items[item.color] ?? []), item];
        return items;
      }, {}),
    [stock]
  );
  const selectedColor = useMemo(() => resolveColorName(color, colors), [color, colors]);
  const selectedVariant = useMemo(
    () => stock.find((item) => item.size === size && normalizeColor(item.color) === normalizeColor(selectedColor)),
    [selectedColor, size, stock]
  );
  const totalUnits = stock.reduce((sum, item) => sum + item.available, 0);
  const lowStockCount = stock.filter((item) => item.available <= item.min).length;
  const emptyStockCount = stock.filter((item) => item.available === 0).length;
  const nextAvailable = (selectedVariant?.available ?? 0) + Math.max(0, quantity);

  useEffect(() => {
    setMin(selectedVariant?.min ?? 1);
  }, [selectedVariant]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanColor = selectedColor;
    if (!cleanColor) return;

    void onUpdateStock({
      id: selectedVariant?.id ?? stockId(cleanColor, size),
      productId: baseProductId,
      productName: baseProductName,
      size,
      color: cleanColor,
      item: `${baseProductName} ${cleanColor} ${size}`,
      available: nextAvailable,
      min: Math.max(0, min)
    });

    setQuantity(1);
    setColor(cleanColor);
  };

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Inventario base</span>
          <h2>Stock de prendas para DTF</h2>
          <p>Controla solo las poleras base disponibles. Los diseños se producen a pedido.</p>
        </div>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Colores base</span>
          <strong>{colors.length}</strong>
          <small>Colores disponibles</small>
        </article>
        <article className="section-summary-card">
          <span>Unidades</span>
          <strong>{totalUnits}</strong>
          <small>Prendas listas</small>
        </article>
        <article className="section-summary-card">
          <span>Stock bajo</span>
          <strong>{lowStockCount}</strong>
          <small>En mínimo o menos</small>
        </article>
        <article className="section-summary-card">
          <span>Sin unidades</span>
          <strong>{emptyStockCount}</strong>
          <small>Tallas en cero</small>
        </article>
      </div>

      <div className="workspace-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>Registrar llegada de prendas</h3>
              <p>Suma al stock cuando recibas poleras base. Si es otro color, escríbelo y se crea.</p>
            </div>
            <span className="badge accent">Entrada</span>
          </div>

          <form className="product-form" onSubmit={handleSubmit}>
            <label className="field wide-field">
              <span>Color de la prenda</span>
              <input
                list="base-color-options"
                placeholder="Ej: Azul marino, Rojo, Blanco arena"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
              <datalist id="base-color-options">
                {colors.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>

            <div className="form-grid two-columns">
              <label className="field">
                <span>Talla</span>
                <select value={size} onChange={(event) => setSize(event.target.value)}>
                  {baseSizes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Cantidad que llegó</span>
                <input
                  min={0}
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </label>

              <label className="field">
                <span>Mínimo</span>
                <input min={0} type="number" value={min} onChange={(event) => setMin(Number(event.target.value))} />
              </label>
            </div>

            <div className="incoming-stock-preview">
              <div>
                <span>Stock actual</span>
                <strong>{selectedVariant?.available ?? 0}</strong>
              </div>
              <div>
                <span>Después de guardar</span>
                <strong>{nextAvailable}</strong>
              </div>
            </div>

            <button className="btn primary" type="submit">
              Sumar al stock
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>Prendas disponibles</h3>
              <p>Vista rápida para saber qué bases puedes producir hoy.</p>
            </div>
          </div>

          <div className="base-stock-board">
            {colors.map((baseColor) => {
              const variants = baseSizes.map((baseSize) => {
                return stockByColor[baseColor]?.find((item) => item.size === baseSize) ?? {
                  id: stockId(baseColor, baseSize),
                  productId: baseProductId,
                  productName: baseProductName,
                  size: baseSize,
                  color: baseColor,
                  item: `${baseProductName} ${baseColor} ${baseSize}`,
                  available: 0,
                  min: 1
                };
              });
              const colorTotal = variants.reduce((sum, item) => sum + item.available, 0);

              return (
                <div className="base-stock-card" key={baseColor}>
                  <div className="base-stock-card-head">
                    <div>
                      <span className={`base-color-swatch ${baseColor === "Negro" ? "black" : "sand"}`} />
                      <h4>{baseColor}</h4>
                    </div>
                    <strong>{colorTotal} uds</strong>
                  </div>

                  <div className="base-size-grid">
                    {variants.map((item) => {
                      const low = item.available <= item.min;

                      return (
                        <div className={`base-size-card ${low ? "is-low" : ""}`} key={item.id}>
                          <div>
                            <span>{item.size}</span>
                            <strong>{item.available}</strong>
                          </div>
                          <small>{low ? "Bajo" : "OK"}</small>
                          <div className="stock-controls">
                            <button
                              className="btn icon small-icon-btn"
                              onClick={() => onAdjustStock(item.id, -1)}
                              type="button"
                            >
                              -
                            </button>
                            <button
                              className="btn icon small-icon-btn"
                              onClick={() => onAdjustStock(item.id, 1)}
                              type="button"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
