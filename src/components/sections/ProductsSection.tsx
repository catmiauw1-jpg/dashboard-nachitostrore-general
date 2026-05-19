"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import type { Product } from "@/types";

interface ProductsSectionProps {
  products: Product[];
  onAddProduct: (product: Product) => void | Promise<void>;
  onToggleHidden: (productId: string) => void;
  onToggleSoldOut: (productId: string) => void;
  onUpdateProduct: (productId: string, updates: Partial<Product>) => void | Promise<void>;
}

const defaultSizes = "S, M, L, XL";
const defaultColors = "Blanco, Negro";

export function ProductsSection({
  products,
  onAddProduct,
  onToggleHidden,
  onToggleSoldOut,
  onUpdateProduct
}: ProductsSectionProps) {
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Product["category"]>("Oversize");
  const [basePrice, setBasePrice] = useState(150);
  const [colors, setColors] = useState(defaultColors);
  const [sizes, setSizes] = useState(defaultSizes);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setEditingProductId(null);
    setName("");
    setCategory("Oversize");
    setBasePrice(150);
    setColors(defaultColors);
    setSizes(defaultSizes);
    setImageFile(null);
    setImagePreview("");
    setCurrentImageUrl("");
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);

    if (!file) {
      setImagePreview("");
      return;
    }

    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async () => {
    if (!imageFile) return currentImageUrl || undefined;

    const formData = new FormData();
    formData.append("image", imageFile);

    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error("No se pudo subir la imagen");

    const data = (await response.json()) as { imageUrl: string };
    return data.imageUrl;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) return;

    setIsSaving(true);

    try {
      const imageUrl = await uploadImage();
      const payload: Product = {
        id: editingProductId ?? `prod-${Date.now()}`,
        name: cleanName,
        category,
        basePrice: Math.max(0, basePrice),
        colors: colors
          .split(",")
          .map((color) => color.trim())
          .filter(Boolean),
        sizes: sizes
          .split(",")
          .map((size) => size.trim())
          .filter(Boolean),
        imageUrl
      };

      if (editingProductId) {
        await onUpdateProduct(editingProductId, payload);
      } else {
        await onAddProduct(payload);
      }

      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (product: Product) => {
    setEditingProductId(product.id);
    setName(product.name);
    setCategory(product.category);
    setBasePrice(product.basePrice);
    setColors(product.colors.join(", "));
    setSizes(product.sizes.join(", "));
    setCurrentImageUrl(product.imageUrl ?? "");
    setImagePreview(product.imageUrl ?? "");
    setImageFile(null);
  };

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Catálogo</span>
          <h2>Productos</h2>
          <p>Agrega, edita y prepara productos para publicarlos después en la web principal.</p>
        </div>
      </header>

      <div className="workspace-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>{editingProductId ? "Editar producto" : "Agregar producto"}</h3>
              <p>Adjunta imagen, define precio, tallas, colores y visibilidad.</p>
            </div>
            <span className="badge accent">{editingProductId ? "Edición" : "Formulario"}</span>
          </div>

          <form className="product-form" onSubmit={handleSubmit}>
            <label className="field wide-field">
              <span>Nombre</span>
              <input
                placeholder="Ej: Oversize negro premium"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <div className="form-grid three-columns">
              <label className="field">
                <span>Categoría</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as Product["category"])}
                >
                  <option value="Oversize">Oversize</option>
                  <option value="Regular">Regular</option>
                  <option value="Personalizada">Personalizada</option>
                </select>
              </label>

              <label className="field">
                <span>Precio</span>
                <input
                  min={0}
                  type="number"
                  value={basePrice}
                  onChange={(event) => setBasePrice(Number(event.target.value))}
                />
              </label>

              <label className="field">
                <span>Tallas</span>
                <input value={sizes} onChange={(event) => setSizes(event.target.value)} />
              </label>
            </div>

            <label className="field wide-field">
              <span>Colores</span>
              <input value={colors} onChange={(event) => setColors(event.target.value)} />
            </label>

            <label className="field wide-field">
              <span>Imagen del producto</span>
              <input accept="image/*" type="file" onChange={handleImageChange} />
            </label>

            {imagePreview ? (
              <div className="image-preview">
                <img src={imagePreview} alt="Vista previa del producto" />
              </div>
            ) : null}

            <div className="form-actions-row">
              {editingProductId ? (
                <button className="btn" onClick={resetForm} type="button">
                  Cancelar edición
                </button>
              ) : null}
              <button className="btn primary" disabled={isSaving} type="submit">
                {isSaving ? "Guardando..." : editingProductId ? "Guardar cambios" : "Agregar producto"}
              </button>
            </div>
          </form>
        </article>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h3>Resumen</h3>
              <p>Estado rápido del catálogo actual.</p>
            </div>
          </div>
          <div className="section-summary-grid compact-summary-grid">
            <article className="section-summary-card">
              <span>Productos</span>
              <strong>{products.length}</strong>
              <small>Total local</small>
            </article>
            <article className="section-summary-card">
              <span>Ocultos</span>
              <strong>{products.filter((product) => product.isHidden).length}</strong>
              <small>No visibles</small>
            </article>
          </div>
        </aside>
      </div>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h3>Catálogo actual</h3>
            <p>Productos importados, agregados o editados desde el dashboard.</p>
          </div>
        </div>

        <div className="product-grid">
          {products.map((product) => (
            <article className="product-card" key={product.id}>
              {product.imageUrl ? (
                <div className="dashboard-product-image">
                  <img src={product.imageUrl} alt={product.name} />
                </div>
              ) : (
                <div className="dashboard-product-placeholder">PF</div>
              )}
              <div>
                <span className="product-category">{product.category}</span>
                <h3>{product.name}</h3>
                <p>{product.colors.join(", ")}</p>
                <p>{product.sizes.join(" · ")}</p>
              </div>
              <div className="product-card-footer">
                <strong>{product.basePrice} Bs</strong>
                <div className="product-actions">
                  <button className="btn" onClick={() => startEditing(product)} type="button">
                    Editar
                  </button>
                  <button className="btn" onClick={() => onToggleSoldOut(product.id)} type="button">
                    {product.isSoldOut ? "Disponible" : "Agotado"}
                  </button>
                  <button className="btn" onClick={() => onToggleHidden(product.id)} type="button">
                    {product.isHidden ? "Mostrar" : "Ocultar"}
                  </button>
                </div>
              </div>
              <div className="product-badges">
                {product.isSoldOut ? <span className="badge danger">Agotado</span> : null}
                {product.isHidden ? <span className="badge warning">Oculto</span> : null}
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
