"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { displayStockName } from "@/lib/format";
import {
  initialChats,
  navigationItems,
  products,
  stockData
} from "@/data/mockData";
import { sectionDefinitions } from "@/data/sectionDefinitions";
import type { ChartData, ChartPoint, Conversation, Metric, MonthKey, Order, Product, SectionKey, StockItem } from "@/types";

const monthKeys: MonthKey[] = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

const weekdayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
}

function orderDate(order: Order) {
  const date = order.createdAt ? new Date(order.createdAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function ordersSummary(ordersToSummarize: Order[]): ChartPoint {
  return ordersToSummarize.reduce(
    (summary, order) => ({
      label: summary.label,
      ventas: summary.ventas + order.total,
      prendas: summary.prendas + order.prendas,
      pedidos: summary.pedidos + 1
    }),
    { label: "", ventas: 0, prendas: 0, pedidos: 0 }
  );
}

function buildLiveChartData(ordersToChart: Order[]): ChartData {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const weekly = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    const summary = ordersSummary(ordersToChart.filter((order) => {
      const date = orderDate(order);
      return date ? sameDay(date, day) : false;
    }));

    return { ...summary, label: weekdayLabels[day.getDay()] };
  });

  const monthly = monthKeys.reduce<Record<MonthKey, ChartPoint[]>>((months, month, monthIndex) => {
    months[month] = [0, 1, 2, 3, 4].map((weekIndex) => {
      const summary = ordersSummary(ordersToChart.filter((order) => {
        const date = orderDate(order);
        if (!date || date.getFullYear() !== today.getFullYear() || date.getMonth() !== monthIndex) return false;
        return Math.min(4, Math.floor((date.getDate() - 1) / 7)) === weekIndex;
      }));

      return { ...summary, label: `Sem ${weekIndex + 1}` };
    });

    return months;
  }, {} as Record<MonthKey, ChartPoint[]>);

  const yearly = monthKeys.map((month, monthIndex) => {
    const summary = ordersSummary(ordersToChart.filter((order) => {
      const date = orderDate(order);
      return date ? date.getFullYear() === today.getFullYear() && date.getMonth() === monthIndex : false;
    }));

    return { ...summary, label: month.slice(0, 3).toUpperCase() };
  });

  return { weekly, monthly, yearly };
}

function buildLiveMetrics(ordersToSummarize: Order[]): Metric[] {
  const today = new Date();
  const todayOrders = ordersToSummarize.filter((order) => {
    const date = orderDate(order);
    return date ? sameDay(date, today) : false;
  });
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekOrders = ordersToSummarize.filter((order) => {
    const date = orderDate(order);
    return date ? date >= weekStart && date <= today : false;
  });
  const pendingPayments = ordersToSummarize.filter((order) => order.payment !== "Pago completo").length;
  const pendingProduction = ordersToSummarize.filter(
    (order) => order.status !== "Entregado" && order.status !== "Cancelado"
  ).length;
  const todaySummary = ordersSummary(todayOrders);
  const weekSummary = ordersSummary(weekOrders);

  return [
    {
      label: "Ventas de hoy",
      value: `${todaySummary.ventas.toLocaleString("es-BO")} Bs`,
      icon: "Bs",
      details: [`${todaySummary.prendas} prendas`, `${todaySummary.pedidos} pedidos`]
    },
    {
      label: "Ventas 7 días",
      value: `${weekSummary.ventas.toLocaleString("es-BO")} Bs`,
      icon: "7D",
      details: [`${weekSummary.prendas} prendas`, `${weekSummary.pedidos} pedidos`]
    },
    {
      label: "Ganancia estimada",
      value: `${Math.round(weekSummary.ventas * 0.35).toLocaleString("es-BO")} Bs`,
      icon: "%",
      details: ["Estimado sobre ventas recientes"]
    },
    {
      label: "Pendientes",
      value: String(pendingPayments + pendingProduction),
      icon: "!",
      details: [`${pendingPayments} pago`, `${pendingProduction} producción`]
    }
  ];
}

export function Dashboard() {
  const [activeSection, setActiveSection] = useState<SectionKey>("inicio");
  const [isDark, setIsDark] = useState(true);
  const [chats, setChats] = useState<Conversation[]>(initialChats);
  const [orderList, setOrderList] = useState<Order[]>([]);
  const [productList, setProductList] = useState<Product[]>(products);
  const [stockList, setStockList] = useState<StockItem[]>(stockData);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [toast, setToast] = useState("");
  const stockSaveVersionRef = useRef<Record<string, number>>({});
  const orderIdsRef = useRef(new Set<string>());
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
          setOrderList(nextOrders);
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

    void (async () => {
      await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, updates })
      });
      await refreshBusinessData({ notifyNewOrders: false });
    })();

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
      showToast(`Stock actualizado: ${displayStockName(item.item)}.`);
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

  const liveMetrics = useMemo(() => {
    return buildLiveMetrics(orderList);
  }, [orderList]);
  const liveChartData = useMemo(() => {
    return buildLiveChartData(orderList);
  }, [orderList]);

  const renderActiveSection = () => {
    if (activeSection === "inicio") {
      return (
        <HomeSection
          chartData={liveChartData}
          chats={chats}
          metrics={liveMetrics}
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
        customers={[]}
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
