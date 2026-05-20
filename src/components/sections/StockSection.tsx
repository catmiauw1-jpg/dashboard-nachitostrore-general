"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Product, StockItem } from "@/types";

interface StockSectionProps {
  products: Product[];
  stock: StockItem[];
  onUpdateStock: (item: StockItem) => void | Promise<void>;
  onAdjustStock: (itemId: string, delta: number) => void | Promise<void>;
}

const baseColors = ["Blanco arena", "Negro"];
const baseSizes = ["M", "L", "XL"];
const baseProductId = "base-polera-dtf";
const baseProductName = "Polera base DTF";

function stockId(color: string, size: string) {
  return `${baseProductId}::${color}::${size}`;
}

export function StockSection({ stock, onUpdateStock, onAdjustStock }: StockSectionProps) {
  const [color, setColor] = useState(baseColors[0]);
  const [size, setSize] = useState(baseSizes[0]);
  const [available, setAvailable] = useState(0);
  const [min, setMin] = useState(1);

  const stockByColor = useMemo(
    () =>
      stock.reduce<Record<string, StockItem[]>>((items, item) => {
        items[item.color] = [...(items[item.color] ?? []), item];
        return items;
      }, {}),
    [stock]
  );
  const selectedVariant = useMemo(
    () => stock.find((item) => item.size === size && item.color === color),
    [color, size, stock]
  );
  const totalUnits = stock.reduce((sum, item) => sum + item.available, 0);
  const lowStockCount = stock.filter((item) => item.available <= item.min).length;
  const emptyStockCount = stock.filter((item) => item.available === 0).length;

  useEffect(() => {
    if (!selectedVariant) {
      setAvailable(0);
      setMin(1);
      return;
    }

    setAvailable(selectedVariant.available);
    setMin(selectedVariant.min);
  }, [selectedVariant]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    void onUpdateStock({
      id: selectedVariant?.id ?? stockId(color, size),
      productId: baseProductId,
      productName: baseProductName,
      size,
      color,
      item: `${baseProductName} ${color} ${size}`,
      available: Math.max(0, available),
      min: Math.max(0, min)
    });
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
          <strong>{baseColors.length}</strong>
          <small>Blanco arena y negro</small>
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
              <h3>Ajustar prenda base</h3>
              <p>Elige color y talla. Este stock se usa para todos los diseños DTF.</p>
            </div>
            <span className="badge accent">Base</span>
          </div>

          <form className="product-form" onSubmit={handleSubmit}>
            <div className="form-grid two-columns">
              <label className="field">
                <span>Color base</span>
                <select value={color} onChange={(event) => setColor(event.target.value)}>
                  {baseColors.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

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
                <span>Disponible</span>
                <input
                  min={0}
                  type="number"
                  value={available}
                  onChange={(event) => setAvailable(Number(event.target.value))}
                />
              </label>

              <label className="field">
                <span>Mínimo</span>
                <input min={0} type="number" value={min} onChange={(event) => setMin(Number(event.target.value))} />
              </label>
            </div>

            <button className="btn primary" type="submit">
              Guardar stock base
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
            {baseColors.map((baseColor) => {
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
