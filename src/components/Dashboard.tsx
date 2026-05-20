"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MobileNav } from "@/components/MobileNav";
import { OrderFormModal } from "@/components/OrderFormModal";
import { HomeSection } from "@/components/sections/HomeSection";
import { OrdersSection } from "@/components/sections/OrdersSection";
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
  const stockSaveVersionRef = useRef<Record<string, number>>({});
  const orderIdsRef = useRef(new Set(orders.map((order) => order.id)));
  const hasLoadedOrdersRef = useRef(false);

  const showToast = (message: string) => {
    setToast(message);
  };

  const refreshBusinessData = useCallback(async (options?: { showError?: boolean; notifyNewOrders?: boolean }) => {
    try {
      const [productsResponse, stockResponse, ordersResponse] = await Promise.all([
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/stock", { cache: "no-store" }),
        fetch(`/api/orders?ts=${Date.now()}`, { cache: "no-store" })
      ]);

      if (productsResponse.ok) {
        const nextProducts = (await productsResponse.json()) as Product[];
        if (nextProducts.length) setProductList(nextProducts);
      }

      if (stockResponse.ok) {
        const data = (await stockResponse.json()) as { stock: StockItem[]; products: Product[] };
        setStockList(data.stock);
        if (data.products.length) setProductList(data.products);
      }

      if (ordersResponse.ok) {
        const nextOrders = (await ordersResponse.json()) as Order[];
        const previousIds = orderIdsRef.current;
        const newOrders = nextOrders.filter((order) => !previousIds.has(order.id));

        setOrderList(nextOrders);
        orderIdsRef.current = new Set(nextOrders.map((order) => order.id));

        if (options?.notifyNewOrders && hasLoadedOrdersRef.current && newOrders.length) {
          const label = newOrders.length === 1 ? newOrders[0].id : `${newOrders.length} pedidos`;
          showToast(`Nuevo pedido registrado: ${label}.`);
        }

        hasLoadedOrdersRef.current = true;
      }
    } catch {
      if (options?.showError) {
        showToast("No se pudo cargar el catálogo persistente. Se usarán datos locales.");
      }
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    async function loadProducts() {
      try {
        const [productsResponse, stockResponse, ordersResponse] = await Promise.all([
          fetch("/api/products", { cache: "no-store" }),
          fetch("/api/stock", { cache: "no-store" }),
          fetch(`/api/orders?ts=${Date.now()}`, { cache: "no-store" })
        ]);

        if (productsResponse.ok) {
          const nextProducts = (await productsResponse.json()) as Product[];
          if (nextProducts.length) setProductList(nextProducts);
        }

        if (stockResponse.ok) {
          const data = (await stockResponse.json()) as { stock: StockItem[]; products: Product[] };
          setStockList(data.stock);
          if (data.products.length) setProductList(data.products);
        }

        if (ordersResponse.ok) {
          const nextOrders = (await ordersResponse.json()) as Order[];
          if (nextOrders.length) setOrderList(nextOrders);
          orderIdsRef.current = new Set(nextOrders.map((order) => order.id));
          hasLoadedOrdersRef.current = true;
        }
      } catch {
        showToast("No se pudo cargar el catálogo persistente. Se usarán datos locales.");
      }
    }

    void loadProducts();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshBusinessData({ notifyNewOrders: true });
      }
    }, 2000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshBusinessData({ notifyNewOrders: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshBusinessData]);

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
    setActiveSection("pedidos");
    showToast(`Pedido ${order.id} registrado correctamente.`);
  };

  const handleUpdateOrder = (orderId: string, updates: Partial<Order>) => {
    setOrderList((currentOrders) =>
      currentOrders.map((order) => (order.id === orderId ? { ...order, ...updates } : order))
    );

    void fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, updates })
    });

    showToast(`Pedido ${orderId} actualizado.`);
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

  const handleDeleteProduct = async (productId: string) => {
    const product = productList.find((item) => item.id === productId);
    setProductList((currentProducts) => currentProducts.filter((item) => item.id !== productId));

    try {
      const response = await fetch("/api/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId })
      });

      if (!response.ok) throw new Error("No se pudo eliminar");
      showToast(product ? `Producto "${product.name}" eliminado de la web.` : "Producto eliminado de la web.");
    } catch {
      showToast("El producto se quitó localmente, pero no se pudo eliminar en la API.");
    }
  };

  const applyStockResponse = async (response: Response, shouldApply = () => true) => {
    if (!response.ok) throw new Error("No se pudo guardar el stock");

    const data = (await response.json()) as { stock: StockItem[]; products: Product[] };
    if (shouldApply()) {
      setStockList(data.stock);
      if (data.products.length) setProductList(data.products);
    }
  };

  const handleUpdateStock = async (item: StockItem) => {
    const nextVersion = (stockSaveVersionRef.current[item.id] ?? 0) + 1;
    stockSaveVersionRef.current[item.id] = nextVersion;
    setStockList((currentStock) => {
      const exists = currentStock.some((stockItem) => stockItem.id === item.id);

      if (!exists) return [item, ...currentStock];

      return currentStock.map((stockItem) => (stockItem.id === item.id ? item : stockItem));
    });

    try {
      await applyStockResponse(
        await fetch("/api/stock", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item)
        }),
        () => stockSaveVersionRef.current[item.id] === nextVersion
      );
      showToast(`Stock actualizado: ${item.item}.`);
    } catch {
      showToast("El stock quedÃ³ local, pero no se pudo guardar en la API.");
    }
  };

  const handleAdjustStock = async (item: StockItem, delta: number) => {
    const stockExists = stockList.some((stockItem) => stockItem.id === item.id);
    const nextItem = { ...item, available: Math.max(0, item.available + delta) };

    setStockList((currentStock) => {
      const exists = currentStock.some((stockItem) => stockItem.id === item.id);

      if (!exists) return [nextItem, ...currentStock];

      return currentStock.map((stockItem) => (stockItem.id === item.id ? nextItem : stockItem));
    });

    try {
      await applyStockResponse(
        await fetch("/api/stock", {
          method: stockExists ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stockExists ? { id: item.id, delta } : nextItem)
        })
      );
    } catch {
      showToast("El ajuste quedÃ³ local, pero no se pudo guardar en la API.");
    }
  };

  const handleSectionPrimaryAction = () => {
    if (activeSection === "pedidos") {
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
          onDeleteProduct={handleDeleteProduct}
          onToggleHidden={handleToggleProductHidden}
          onToggleSoldOut={handleToggleProductSoldOut}
          onUpdateProduct={handleUpdateProduct}
        />
      );
    }

    if (activeSection === "pedidos") {
      return (
        <OrdersSection
          orders={orderList}
          onRegisterOrder={() => setIsOrderModalOpen(true)}
          onUpdateOrder={handleUpdateOrder}
        />
      );
    }

    if (activeSection === "stock") {
      return (
        <StockSection
          products={productList}
          stock={stockList}
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
