"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Product, StockItem } from "@/types";

interface StockSectionProps {
  products: Product[];
  stock: StockItem[];
  onUpdateStock: (item: StockItem) => void;
  onAdjustStock: (itemName: string, delta: number) => void;
}

export function StockSection({ products, stock, onUpdateStock, onAdjustStock }: StockSectionProps) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products]
  );
  const [size, setSize] = useState(selectedProduct?.sizes[0] ?? "M");
  const [color, setColor] = useState(selectedProduct?.colors[0] ?? "Negro");
  const [available, setAvailable] = useState(5);
  const [min, setMin] = useState(3);

  const handleProductChange = (nextProductId: string) => {
    const nextProduct = products.find((product) => product.id === nextProductId);

    setProductId(nextProductId);
    setSize(nextProduct?.sizes[0] ?? "M");
    setColor(nextProduct?.colors[0] ?? "Negro");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProduct) return;

    onUpdateStock({
      item: `${selectedProduct.name} ${color} ${size}`,
      available: Math.max(0, available),
      min: Math.max(0, min)
    });
  };

  const lowStockCount = stock.filter((item) => item.available <= item.min).length;

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Inventario</span>
          <h2>Stock</h2>
          <p>Actualiza unidades disponibles por producto, talla y color.</p>
        </div>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Items</span>
          <strong>{stock.length}</strong>
          <small>Variantes controladas</small>
        </article>
        <article className="section-summary-card">
          <span>Stock bajo</span>
          <strong>{lowStockCount}</strong>
          <small>Reponer pronto</small>
        </article>
        <article className="section-summary-card">
          <span>Unidades</span>
          <strong>{stock.reduce((sum, item) => sum + item.available, 0)}</strong>
          <small>Disponibles</small>
        </article>
      </div>

      <div className="workspace-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>Actualizar stock</h3>
              <p>Si la variante ya existe, se actualiza. Si no existe, se crea.</p>
            </div>
            <span className="badge accent">Inventario</span>
          </div>

          <form className="product-form" onSubmit={handleSubmit}>
            <label className="field wide-field">
              <span>Producto</span>
              <select value={productId} onChange={(event) => handleProductChange(event.target.value)}>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-grid two-columns">
              <label className="field">
                <span>Talla</span>
                <select value={size} onChange={(event) => setSize(event.target.value)}>
                  {(selectedProduct?.sizes ?? ["S", "M", "L", "XL"]).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Color</span>
                <select value={color} onChange={(event) => setColor(event.target.value)}>
                  {(selectedProduct?.colors ?? ["Blanco", "Negro"]).map((option) => (
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
              Guardar stock
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>Stock actual</h3>
              <p>Ajustes rápidos para sumar o restar unidades.</p>
            </div>
          </div>

          <div className="stock-list">
            {stock.map((item) => {
              const low = item.available <= item.min;

              return (
                <div className="stock-item" key={item.item}>
                  <div>
                    <h4>{item.item}</h4>
                    <p>
                      Mínimo: {item.min} · Disponible: {item.available}
                    </p>
                  </div>
                  <div className="stock-controls">
                    <button className="btn icon small-icon-btn" onClick={() => onAdjustStock(item.item, -1)} type="button">
                      -
                    </button>
                    <span className={`badge ${low ? "danger" : "success"}`}>{low ? "Bajo" : "OK"}</span>
                    <button className="btn icon small-icon-btn" onClick={() => onAdjustStock(item.item, 1)} type="button">
                      +
                    </button>
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
