"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Product, StockItem } from "@/types";

interface StockSectionProps {
  products: Product[];
  stock: StockItem[];
  onUpdateStock: (item: StockItem) => void | Promise<void>;
  onAdjustStock: (itemId: string, delta: number) => void | Promise<void>;
}

function stockId(productId: string, color: string, size: string) {
  return `${productId}::${color}::${size}`;
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

  const stockByProduct = useMemo(
    () =>
      stock.reduce<Record<string, StockItem[]>>((items, item) => {
        items[item.productId] = [...(items[item.productId] ?? []), item];
        return items;
      }, {}),
    [stock]
  );
  const selectedVariant = useMemo(
    () => stock.find((item) => item.productId === productId && item.size === size && item.color === color),
    [color, productId, size, stock]
  );

  useEffect(() => {
    if (!products.length) return;
    if (products.some((product) => product.id === productId)) return;

    const nextProduct = products[0];
    setProductId(nextProduct.id);
    setSize(nextProduct.sizes[0] ?? "M");
    setColor(nextProduct.colors[0] ?? "Negro");
  }, [productId, products]);

  useEffect(() => {
    if (!selectedVariant) return;
    setAvailable(selectedVariant.available);
    setMin(selectedVariant.min);
  }, [selectedVariant]);

  const handleProductChange = (nextProductId: string) => {
    const nextProduct = products.find((product) => product.id === nextProductId);

    setProductId(nextProductId);
    setSize(nextProduct?.sizes[0] ?? "M");
    setColor(nextProduct?.colors[0] ?? "Negro");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProduct) return;

    void onUpdateStock({
      id: selectedVariant?.id ?? stockId(selectedProduct.id, color, size),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      size,
      color,
      item: `${selectedProduct.name} ${color} ${size}`,
      available: Math.max(0, available),
      min: Math.max(0, min)
    });
  };

  const lowStockCount = stock.filter((item) => item.available <= item.min).length;
  const emptyStockCount = stock.filter((item) => item.available === 0).length;

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Inventario</span>
          <h2>Stock</h2>
          <p>Controla unidades disponibles por producto, talla y color.</p>
        </div>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Variantes</span>
          <strong>{stock.length}</strong>
          <small>Tallas y colores</small>
        </article>
        <article className="section-summary-card">
          <span>Stock bajo</span>
          <strong>{lowStockCount}</strong>
          <small>Reponer pronto</small>
        </article>
        <article className="section-summary-card">
          <span>Sin unidades</span>
          <strong>{emptyStockCount}</strong>
          <small>En cero</small>
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
              <h3>Actualizar variante</h3>
              <p>Elige una prenda, talla y color para definir su stock real.</p>
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
              Guardar variante
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>Stock actual</h3>
              <p>Ajustes rápidos por prenda, talla y color.</p>
            </div>
          </div>

          <div className="stock-product-list">
            {products.map((product) => {
              const variants = stockByProduct[product.id] ?? [];

              return (
                <div className="stock-product-block" key={product.id}>
                  <div className="stock-product-head">
                    <div>
                      <h4>{product.name}</h4>
                      <p>{variants.length ? `${variants.length} variantes controladas` : "Sin variantes de stock"}</p>
                    </div>
                    <span className={`badge ${product.isSoldOut ? "danger" : "success"}`}>
                      {product.isSoldOut ? "Agotado" : "Disponible"}
                    </span>
                  </div>

                  {variants.length ? (
                    <div className="variant-grid">
                      {variants.map((item) => {
                        const low = item.available <= item.min;

                        return (
                          <div className="variant-row" key={item.id}>
                            <div>
                              <strong>{item.color}</strong>
                              <span>{item.size}</span>
                            </div>
                            <div className="variant-stock-meta">
                              <span>{item.available} uds</span>
                              <small>Min {item.min}</small>
                            </div>
                            <div className="stock-controls">
                              <button
                                className="btn icon small-icon-btn"
                                onClick={() => onAdjustStock(item.id, -1)}
                                type="button"
                              >
                                -
                              </button>
                              <span className={`badge ${low ? "danger" : "success"}`}>{low ? "Bajo" : "OK"}</span>
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
                  ) : (
                    <p className="empty-stock-note">Crea la primera variante usando el formulario.</p>
                  )}
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
