"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Product, StockItem } from "@/types";

interface StockSectionProps {
  products: Product[];
  stock: StockItem[];
  onUpdateStock: (item: StockItem) => void | Promise<void>;
}

const defaultColors = ["Blanco arena", "Negro"];
const baseSizes = ["M", "L", "XL"];
const baseProductId = "base-polera-dtf";
const baseProductName = "Polera para DTF";

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

export function StockSection({ stock, onUpdateStock }: StockSectionProps) {
  const [visibleStock, setVisibleStock] = useState(stock);
  const visibleStockRef = useRef(stock);
  const pendingStockRef = useRef<Record<string, StockItem>>({});
  const syncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const colors = useMemo(
    () => [...new Set([...defaultColors, ...visibleStock.map((item) => item.color)].filter(Boolean))],
    [visibleStock]
  );
  const [color, setColor] = useState(defaultColors[0]);
  const [size, setSize] = useState(baseSizes[0]);
  const [quantity, setQuantity] = useState(1);
  const [min, setMin] = useState(1);

  useEffect(() => {
    if (Object.keys(pendingStockRef.current).length === 0) {
      visibleStockRef.current = stock;
      setVisibleStock(stock);
    }
  }, [stock]);

  useEffect(() => {
    const timers = syncTimersRef.current;

    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const stockByColor = useMemo(
    () =>
      visibleStock.reduce<Record<string, StockItem[]>>((items, item) => {
        items[item.color] = [...(items[item.color] ?? []), item];
        return items;
      }, {}),
    [visibleStock]
  );
  const selectedColor = useMemo(() => resolveColorName(color, colors), [color, colors]);
  const selectedVariant = useMemo(
    () => visibleStock.find((item) => item.size === size && normalizeColor(item.color) === normalizeColor(selectedColor)),
    [selectedColor, size, visibleStock]
  );
  const totalUnits = visibleStock.reduce((sum, item) => sum + item.available, 0);
  const lowStockCount = visibleStock.filter((item) => item.available <= item.min).length;
  const emptyStockCount = visibleStock.filter((item) => item.available === 0).length;
  const nextAvailable = selectedColor ? (selectedVariant?.available ?? 0) + Math.max(0, quantity) : 0;

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

    const nextItem = {
      id: selectedVariant?.id ?? stockId(cleanColor, size),
      productId: baseProductId,
      productName: baseProductName,
      size,
      color: cleanColor,
      item: `${baseProductName} ${cleanColor} ${size}`,
      available: nextAvailable,
      min: Math.max(0, min)
    };

    setVisibleStock((currentStock) => {
      const exists = currentStock.some((stockItem) => stockItem.id === nextItem.id);
      const nextStock = exists
        ? currentStock.map((stockItem) => (stockItem.id === nextItem.id ? nextItem : stockItem))
        : [nextItem, ...currentStock];

      visibleStockRef.current = nextStock;
      return nextStock;
    });
    setColor("");
    setSize(baseSizes[0]);
    setQuantity(1);
    setMin(1);
  };

  const scheduleStockSync = (item: StockItem) => {
    pendingStockRef.current[item.id] = item;
    clearTimeout(syncTimersRef.current[item.id]);

    syncTimersRef.current[item.id] = setTimeout(() => {
      const latestItem = pendingStockRef.current[item.id];
      delete pendingStockRef.current[item.id];
      delete syncTimersRef.current[item.id];

      if (latestItem) {
        void onUpdateStock(latestItem);
      }
    }, 260);
  };

  const handleQuickAdjust = (item: StockItem, delta: number) => {
    const currentStock = visibleStockRef.current;
    const currentItem = currentStock.find((stockItem) => stockItem.id === item.id) ?? item;
    const nextItem = { ...currentItem, available: Math.max(0, currentItem.available + delta) };
    const exists = currentStock.some((stockItem) => stockItem.id === item.id);
    const nextStock = exists
      ? currentStock.map((stockItem) => (stockItem.id === item.id ? nextItem : stockItem))
      : [nextItem, ...currentStock];

    visibleStockRef.current = nextStock;
    setVisibleStock(nextStock);
    scheduleStockSync(nextItem);
  };

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Inventario</span>
          <h2>Stock de prendas</h2>
          <p>Controla las poleras disponibles para producir diseños DTF a pedido.</p>
        </div>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Colores</span>
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
              <p>Suma al stock cuando recibas nuevas poleras. Si es otro color, escríbelo y se crea.</p>
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
              <div className="color-choice-list" aria-label="Colores registrados">
                {colors.map((option) => (
                  <button
                    className={normalizeColor(option) === normalizeColor(selectedColor) ? "color-choice active" : "color-choice"}
                    key={option}
                    onClick={() => setColor(option)}
                    type="button"
                  >
                    <span className={`base-color-swatch tiny ${option === "Negro" ? "black" : "sand"}`} />
                    {option}
                  </button>
                ))}
              </div>
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

            <button className="btn primary" disabled={!selectedColor || quantity <= 0} type="submit">
              Sumar al stock
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>Prendas disponibles</h3>
              <p>Vista rápida para saber qué prendas puedes producir hoy.</p>
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
                              disabled={item.available <= 0}
                              onClick={() => handleQuickAdjust(item, -1)}
                              type="button"
                            >
                              -
                            </button>
                            <button
                              className="btn icon small-icon-btn"
                              onClick={() => handleQuickAdjust(item, 1)}
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
