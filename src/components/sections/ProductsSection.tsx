"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import type { Product } from "@/types";

interface ProductsSectionProps {
  products: Product[];
  onAddProduct: (product: Product) => void | Promise<void>;
  onDeleteProduct: (productId: string) => void | Promise<void>;
  onToggleHidden: (productId: string) => void;
  onToggleSoldOut: (productId: string) => void;
  onUpdateProduct: (productId: string, updates: Partial<Product>) => void | Promise<void>;
}

const defaultSizes = "S, M, L, XL";
const defaultColors = "Blanco, Negro";
const customCategoryValue = "__custom__";
const baseWebCategories = [
  { value: "anime", label: "Anime" },
  { value: "basket", label: "Basket" },
  { value: "streetwear", label: "Streetwear" },
  { value: "gatos", label: "Gatos" },
  { value: "perros", label: "Perros" },
  { value: "meme", label: "Meme" },
  { value: "futbol", label: "Fútbol" },
  { value: "catalogo", label: "Catálogo" }
];

function normalizeWebCategory(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatWebCategory(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function ProductsSection({
  products,
  onAddProduct,
  onDeleteProduct,
  onToggleHidden,
  onToggleSoldOut,
  onUpdateProduct
}: ProductsSectionProps) {
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Product["category"]>("Oversize");
  const [webCategory, setWebCategory] = useState("catalogo");
  const [customWebCategory, setCustomWebCategory] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState(150);
  const [colors, setColors] = useState(defaultColors);
  const [sizes, setSizes] = useState(defaultSizes);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const imagePreviews = [...currentImageUrls, ...newImagePreviews];
  const webCategoryOptions = [
    ...new Map(
      [
        ...baseWebCategories,
        ...products
          .map((product) => normalizeWebCategory(product.webCategory ?? ""))
          .filter(Boolean)
          .map((value) => ({ value, label: formatWebCategory(value) }))
      ].map((item) => [item.value, item])
    ).values()
  ];

  const resetForm = () => {
    setEditingProductId(null);
    setName("");
    setCategory("Oversize");
    setWebCategory("catalogo");
    setCustomWebCategory("");
    setDescription("");
    setBasePrice(150);
    setColors(defaultColors);
    setSizes(defaultSizes);
    setImageFiles([]);
    setNewImagePreviews([]);
    setCurrentImageUrls([]);
    setFormError("");
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setImageFiles((currentFiles) => [...currentFiles, ...files]);
    setNewImagePreviews((currentPreviews) => [
      ...currentPreviews,
      ...files.map((file) => URL.createObjectURL(file))
    ]);
    event.target.value = "";
  };

  const removeImagePreview = (index: number) => {
    if (index < currentImageUrls.length) {
      setCurrentImageUrls((urls) => urls.filter((_, urlIndex) => urlIndex !== index));
      return;
    }

    const newIndex = index - currentImageUrls.length;
    setImageFiles((files) => files.filter((_, fileIndex) => fileIndex !== newIndex));
    setNewImagePreviews((previews) => previews.filter((_, previewIndex) => previewIndex !== newIndex));
  };

  const uploadImages = async () => {
    if (!imageFiles.length) return currentImageUrls;

    const uploadedImages = await Promise.all(
      imageFiles.map(async (file) => {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || "No se pudo subir una imagen");
        }

        const data = (await response.json()) as { imageUrl: string };
        return data.imageUrl;
      })
    );

    return [...currentImageUrls, ...uploadedImages];
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) return;
    setFormError("");

    const cleanWebCategory =
      webCategory === customCategoryValue ? normalizeWebCategory(customWebCategory) : normalizeWebCategory(webCategory);

    if (!cleanWebCategory) {
      setFormError("Escoge una categorÃ­a web o escribe una nueva.");
      return;
    }

    setIsSaving(true);

    try {
      const imageUrls = await uploadImages();
      const payload: Product = {
        id: editingProductId ?? `prod-${Date.now()}`,
        name: cleanName,
        category,
        webCategory: cleanWebCategory,
        description: description.trim(),
        basePrice: Math.max(0, basePrice),
        colors: colors
          .split(",")
          .map((color) => color.trim())
          .filter(Boolean),
        sizes: sizes
          .split(",")
          .map((size) => size.trim())
          .filter(Boolean),
        imageUrl: imageUrls[0] ?? "",
        imageUrls
      };

      if (editingProductId) {
        await onUpdateProduct(editingProductId, payload);
      } else {
        await onAddProduct(payload);
      }

      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (product: Product) => {
    setEditingProductId(product.id);
    setName(product.name);
    setCategory(product.category);
    setWebCategory(product.webCategory ?? "catalogo");
    setCustomWebCategory("");
    setDescription(product.description ?? "");
    setBasePrice(product.basePrice);
    setColors(product.colors.join(", "));
    setSizes(product.sizes.join(", "));
    setCurrentImageUrls(product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []);
    setNewImagePreviews([]);
    setImageFiles([]);
  };

  const handleDelete = async (product: Product) => {
    const shouldDelete = window.confirm(`Eliminar "${product.name}" del catálogo?`);
    if (!shouldDelete) return;

    if (editingProductId === product.id) resetForm();
    await onDeleteProduct(product.id);
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
              <p>Adjunta imagen, descripción, precio, tallas, colores y visibilidad.</p>
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

            <label className="field wide-field">
              <span>Descripción</span>
              <textarea
                placeholder="Ej: Polera oversize de algodón premium con estampado DTF."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className="form-grid four-columns">
              <label className="field">
                <span>Tipo</span>
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
                <span>Categoría web</span>
                <select value={webCategory} onChange={(event) => setWebCategory(event.target.value)}>
                  {webCategoryOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                  <option value={customCategoryValue}>Nueva categorÃ­a...</option>
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

            {webCategory === customCategoryValue ? (
              <label className="field wide-field">
                <span>Nueva categorÃ­a web</span>
                <input
                  placeholder="Ej: Videojuegos, mÃºsica, autos..."
                  value={customWebCategory}
                  onChange={(event) => setCustomWebCategory(event.target.value)}
                />
              </label>
            ) : null}

            <label className="field wide-field">
              <span>Colores</span>
              <input value={colors} onChange={(event) => setColors(event.target.value)} />
            </label>

            <label className="field wide-field">
              <span>Imágenes del producto</span>
              <input accept="image/*" multiple type="file" onChange={handleImageChange} />
            </label>

            {imagePreviews.length ? (
              <div className="image-preview-grid">
                {imagePreviews.map((preview, index) => (
                  <div className="image-preview" key={`${preview}-${index}`}>
                    <img src={preview} alt={`Vista previa ${index + 1} del producto`} />
                    <button className="remove-image-btn" onClick={() => removeImagePreview(index)} type="button">
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {formError ? <p className="form-error">{formError}</p> : null}

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
            <article className="product-card web-style-product-card" key={product.id}>
              <div className="dashboard-product-visual">
                {(product.imageUrls?.[0] || product.imageUrl) ? (
                  <>
                    <img src={product.imageUrls?.[0] || product.imageUrl} alt={product.name} />
                    {(product.imageUrls?.length ?? 0) > 1 ? (
                      <span className="image-count-badge">{product.imageUrls?.length} fotos</span>
                    ) : null}
                  </>
                ) : (
                  <span>PF</span>
                )}
              </div>

              <div className="dashboard-product-info">
                <span className="product-category">{product.webCategory ?? product.category}</span>
                <h3>{product.name}</h3>
                <p>{product.colors.length ? product.colors.join(", ") : "Color por confirmar"}</p>
                <p>{product.sizes.length ? product.sizes.join(" · ") : "Tallas por confirmar"}</p>
                {product.description ? <p className="product-description-line">{product.description}</p> : null}
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
                  <button className="btn danger-btn" onClick={() => handleDelete(product)} type="button">
                    Eliminar
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
