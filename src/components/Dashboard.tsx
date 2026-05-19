"use client";

import { useEffect, useState } from "react";
import { MobileNav } from "@/components/MobileNav";
import { OrderFormModal } from "@/components/OrderFormModal";
import { HomeSection } from "@/components/sections/HomeSection";
import { ProductsSection } from "@/components/sections/ProductsSection";
import { SectionWorkspace } from "@/components/sections/SectionWorkspace";
import { StockSection } from "@/components/sections/StockSection";
import { Sidebar } from "@/components/Sidebar";
import { Toast } from "@/components/Toast";
import { Topbar } from "@/components/Topbar";
import {
  chartData,
  customers,
  initialChats,
  metrics,
  navigationItems,
  orders,
  products,
  stockData
} from "@/data/mockData";
import { sectionDefinitions } from "@/data/sectionDefinitions";
import type { Conversation, Order, Product, SectionKey, StockItem } from "@/types";

export function Dashboard() {
  const [activeSection, setActiveSection] = useState<SectionKey>("inicio");
  const [isDark, setIsDark] = useState(true);
  const [chats, setChats] = useState<Conversation[]>(initialChats);
  const [orderList, setOrderList] = useState<Order[]>(orders);
  const [productList, setProductList] = useState<Product[]>(products);
  const [stockList, setStockList] = useState<StockItem[]>(stockData);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    document.body.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    async function loadProducts() {
      try {
        const response = await fetch("/api/products");
        if (!response.ok) return;

        const nextProducts = (await response.json()) as Product[];
        if (nextProducts.length) setProductList(nextProducts);
      } catch {
        showToast("No se pudo cargar el catálogo persistente. Se usarán datos locales.");
      }
    }

    void loadProducts();
  }, []);

  const showToast = (message: string) => {
    setToast(message);
  };

  const toggleBot = (index: number) => {
    setChats((currentChats) =>
      currentChats.map((chat, chatIndex) => {
        if (chatIndex !== index) return chat;

        const nextBotState = !chat.bot;

        showToast(
          nextBotState
            ? "Bot activado para este chat."
            : "Bot apagado para este chat. Ahora requiere atención manual."
        );

        return {
          ...chat,
          bot: nextBotState,
          status: nextBotState ? "Bot activo" : "Atención manual"
        };
      })
    );
  };

  const getNextOrderNumber = () => {
    const numbers = orderList
      .map((order) => Number(order.id.replace("#", "")))
      .filter((value) => Number.isFinite(value));

    return Math.max(1028, ...numbers) + 1;
  };

  const handleCreateOrder = (order: Order) => {
    setOrderList((currentOrders) => [order, ...currentOrders]);
    setActiveSection("inicio");
    showToast(`Pedido ${order.id} registrado correctamente.`);
  };

  const handleAddProduct = async (product: Product) => {
    setProductList((currentProducts) => [product, ...currentProducts]);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product)
      });

      if (!response.ok) throw new Error("No se pudo guardar");
      showToast(`Producto "${product.name}" agregado y publicado en el catálogo.`);
    } catch {
      showToast(`Producto "${product.name}" agregado solo en esta sesión.`);
    }
  };

  const patchProduct = async (productId: string, updates: Partial<Product>) => {
    try {
      await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, updates })
      });
    } catch {
      showToast("El cambio quedó local, pero no se pudo guardar en la API.");
    }
  };

  const handleToggleProductHidden = (productId: string) => {
    const product = productList.find((item) => item.id === productId);
    const nextHidden = !product?.isHidden;

    setProductList((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId ? { ...product, isHidden: nextHidden } : product
      )
    );

    void patchProduct(productId, { isHidden: nextHidden });
  };

  const handleToggleProductSoldOut = (productId: string) => {
    const product = productList.find((item) => item.id === productId);
    const nextSoldOut = !product?.isSoldOut;

    setProductList((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId ? { ...product, isSoldOut: nextSoldOut } : product
      )
    );

    void patchProduct(productId, { isSoldOut: nextSoldOut });
  };

  const handleUpdateProduct = async (productId: string, updates: Partial<Product>) => {
    setProductList((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId ? { ...product, ...updates, id: productId } : product
      )
    );

    await patchProduct(productId, updates);
    showToast("Producto actualizado.");
  };

  const handleUpdateStock = (item: StockItem) => {
    setStockList((currentStock) => {
      const exists = currentStock.some((stockItem) => stockItem.item === item.item);

      if (!exists) return [item, ...currentStock];

      return currentStock.map((stockItem) => (stockItem.item === item.item ? item : stockItem));
    });

    showToast(`Stock actualizado: ${item.item}.`);
  };

  const handleAdjustStock = (itemName: string, delta: number) => {
    setStockList((currentStock) =>
      currentStock.map((item) =>
        item.item === itemName ? { ...item, available: Math.max(0, item.available + delta) } : item
      )
    );
  };

  const handleSectionPrimaryAction = () => {
    if (activeSection === "pedidos" || activeSection === "personalizados") {
      setIsOrderModalOpen(true);
      return;
    }

    if (activeSection === "productos" || activeSection === "stock") {
      showToast("Usa el formulario principal de esta sección.");
      return;
    }

    showToast("Esta acción se implementará en el siguiente módulo.");
  };

  const renderActiveSection = () => {
    if (activeSection === "inicio") {
      return (
        <HomeSection
          chartData={chartData}
          chats={chats}
          metrics={metrics}
          orders={orderList}
          stock={stockList}
          onOpenConversations={() =>
            showToast(
              "Aquí luego se abrirá el centro de conversaciones con historial, estado del pedido y control del bot."
            )
          }
          onToggleBot={toggleBot}
        />
      );
    }

    if (activeSection === "productos") {
      return (
        <ProductsSection
          products={productList}
          onAddProduct={handleAddProduct}
          onToggleHidden={handleToggleProductHidden}
          onToggleSoldOut={handleToggleProductSoldOut}
          onUpdateProduct={handleUpdateProduct}
        />
      );
    }

    if (activeSection === "stock") {
      return (
        <StockSection
          products={productList}
          stock={stockList}
          onAdjustStock={handleAdjustStock}
          onUpdateStock={handleUpdateStock}
        />
      );
    }

    return (
      <SectionWorkspace
        definition={sectionDefinitions[activeSection]}
        onPrimaryAction={handleSectionPrimaryAction}
      />
    );
  };

  return (
    <>
      <div className="app">
        <Sidebar
          activeSection={activeSection}
          items={navigationItems}
          onSelect={setActiveSection}
        />

        <main className="main">
          <MobileNav
            activeSection={activeSection}
            items={navigationItems}
            onSelect={setActiveSection}
          />

          <Topbar
            isDark={isDark}
            onRegisterOrder={() => setIsOrderModalOpen(true)}
            onToggleTheme={() => setIsDark((value) => !value)}
          />

          {renderActiveSection()}
        </main>
      </div>

      <OrderFormModal
        customers={customers}
        isOpen={isOrderModalOpen}
        nextOrderNumber={getNextOrderNumber()}
        products={productList}
        onClose={() => setIsOrderModalOpen(false)}
        onSubmit={handleCreateOrder}
      />
      <Toast message={toast} onDone={() => setToast("")} />
    </>
  );
}
