"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileNav } from "@/components/MobileNav";
import { OrderFormModal } from "@/components/OrderFormModal";
import { ConfigurationSection } from "@/components/sections/ConfigurationSection";
import { CustomersSection } from "@/components/sections/CustomersSection";
import { ExpensesSection } from "@/components/sections/ExpensesSection";
import { HomeSection } from "@/components/sections/HomeSection";
import { OrderHistorySection } from "@/components/sections/OrderHistorySection";
import { OrdersSection } from "@/components/sections/OrdersSection";
import { ProductsSection } from "@/components/sections/ProductsSection";
import { SectionWorkspace } from "@/components/sections/SectionWorkspace";
import { StockSection } from "@/components/sections/StockSection";
import { WhatsAppSalesSection } from "@/components/sections/WhatsAppSalesSection";
import { Sidebar } from "@/components/Sidebar";
import { Toast } from "@/components/Toast";
import { Topbar } from "@/components/Topbar";
import { displayStockName } from "@/lib/format";
import {
  navigationItems,
  products,
  stockData
} from "@/data/mockData";
import { sectionDefinitions } from "@/data/sectionDefinitions";
import type { ChartData, ChartPoint, Conversation, Customer, Expense, Metric, MonthKey, Order, Product, SectionKey, StockItem } from "@/types";

interface DashboardProps {
  accessToken: string;
  adminEmail: string;
  onSignOut: () => void | Promise<void>;
}

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

function buildLiveMetrics(ordersToSummarize: Order[], expensesToSummarize: Expense[] = []): Metric[] {
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
  const weekBusinessExpenses = expensesToSummarize
    .filter((expense) => {
      const date = new Date(`${expense.expenseDate}T12:00:00`);
      return expense.scope === "Tienda" && !Number.isNaN(date.getTime()) && date >= weekStart && date <= today;
    })
    .reduce((sum, expense) => sum + expense.amount, 0);
  const estimatedProfit = Math.max(0, Math.round(weekSummary.ventas * 0.35) - weekBusinessExpenses);

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
      value: `${estimatedProfit.toLocaleString("es-BO")} Bs`,
      icon: "%",
      details: ["Ventas menos gastos tienda"]
    },
    {
      label: "Pendientes",
      value: String(pendingPayments + pendingProduction),
      icon: "!",
      details: [`${pendingPayments} pago`, `${pendingProduction} producción`]
    }
  ];
}

function customersFromOrders(orders: Order[], persistedCustomers: Customer[] = []) {
  const customersByKey = new Map<string, Customer>();

  persistedCustomers.forEach((customer) => {
    const key = customer.phone?.trim() || customer.id;
    if (!key) return;
    customersByKey.set(key, customer);
  });

  orders.forEach((order) => {
    const key = order.customerPhone?.trim() || order.customer.trim().toLowerCase();
    if (!key || customersByKey.has(key)) return;

    customersByKey.set(key, {
      id: key,
      name: order.customer || "Cliente sin nombre",
      phone: order.customerPhone || "Sin WhatsApp",
      channel: order.channel
    });
  });

  return [...customersByKey.values()];
}

export function Dashboard({ accessToken, adminEmail, onSignOut }: DashboardProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("inicio");
  const [isDark, setIsDark] = useState(true);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [orderList, setOrderList] = useState<Order[]>([]);
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [expenseList, setExpenseList] = useState<Expense[]>([]);
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

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${accessToken}` }), [accessToken]);
  const jsonAuthHeaders = useMemo(
    () => ({ ...authHeaders, "Content-Type": "application/json" }),
    [authHeaders]
  );
  const apiFetch = useCallback(
    (input: RequestInfo | URL, init: RequestInit = {}) =>
      fetch(input, {
        ...init,
        headers: {
          ...authHeaders,
          ...(init.headers ?? {})
        }
      }),
    [authHeaders]
  );

  const refreshBusinessData = useCallback(async (options?: { showError?: boolean; notifyNewOrders?: boolean }) => {
    try {
      const [productsResponse, stockResponse, ordersResponse, customersResponse, expensesResponse, conversationsResponse] = await Promise.all([
        apiFetch("/api/products", { cache: "no-store" }),
        apiFetch("/api/stock", { cache: "no-store" }),
        apiFetch(`/api/orders?ts=${Date.now()}`, { cache: "no-store" }),
        apiFetch(`/api/customers?ts=${Date.now()}`, { cache: "no-store" }),
        apiFetch(`/api/expenses?ts=${Date.now()}`, { cache: "no-store" }),
        apiFetch(`/api/conversations?ts=${Date.now()}`, { cache: "no-store" })
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

      if (customersResponse.ok) {
        setCustomerList((await customersResponse.json()) as Customer[]);
      }

      if (expensesResponse.ok) {
        setExpenseList((await expensesResponse.json()) as Expense[]);
      }

      if (conversationsResponse.ok) {
        setChats((await conversationsResponse.json()) as Conversation[]);
      }
    } catch {
      if (options?.showError) {
        showToast("No se pudo cargar el catálogo persistente. Se usarán datos locales.");
      }
    }
  }, [apiFetch]);

  useEffect(() => {
    document.body.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    async function loadProducts() {
      try {
        const [productsResponse, stockResponse, ordersResponse, customersResponse, expensesResponse, conversationsResponse] = await Promise.all([
          apiFetch("/api/products", { cache: "no-store" }),
          apiFetch("/api/stock", { cache: "no-store" }),
          apiFetch(`/api/orders?ts=${Date.now()}`, { cache: "no-store" }),
          apiFetch(`/api/customers?ts=${Date.now()}`, { cache: "no-store" }),
          apiFetch(`/api/expenses?ts=${Date.now()}`, { cache: "no-store" }),
          apiFetch(`/api/conversations?ts=${Date.now()}`, { cache: "no-store" })
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

        if (customersResponse.ok) {
          setCustomerList((await customersResponse.json()) as Customer[]);
        }

        if (expensesResponse.ok) {
          setExpenseList((await expensesResponse.json()) as Expense[]);
        }

        if (conversationsResponse.ok) {
          setChats((await conversationsResponse.json()) as Conversation[]);
        }
      } catch {
        showToast("No se pudo cargar el catálogo persistente. Se usarán datos locales.");
      }
    }

    void loadProducts();
  }, [apiFetch]);

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
    const chat = chats[index];
    if (!chat) return;

    const nextBotState = !chat.bot;

    setChats((currentChats) =>
      currentChats.map((currentChat, chatIndex) =>
        chatIndex === index
          ? {
              ...currentChat,
              bot: nextBotState,
              alert: nextBotState ? currentChat.alert : true,
              status: nextBotState ? "Bot activo" : "Atencion manual"
            }
          : currentChat
      )
    );

    void (async () => {
      try {
        const response = await apiFetch("/api/conversations", {
          method: "PATCH",
          headers: jsonAuthHeaders,
          body: JSON.stringify({ id: chat.id, phone: chat.phone, bot: nextBotState })
        });

        if (!response.ok) throw new Error("No se pudo actualizar el chat.");

        setChats((await response.json()) as Conversation[]);
        showToast(
          nextBotState
            ? "Bot activado para este chat."
            : "Bot apagado para este chat. Ahora requiere atencion manual."
        );
      } catch {
        setChats((currentChats) =>
          currentChats.map((currentChat, chatIndex) =>
            chatIndex === index ? { ...currentChat, bot: chat.bot, alert: chat.alert, status: chat.status } : currentChat
          )
        );
        showToast("No se pudo actualizar el bot de este chat.");
      }
    })();
  };

  const handleSendManualMessage = async (chat: Conversation, message: string) => {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    const response = await apiFetch("/api/conversations", {
      method: "POST",
      headers: jsonAuthHeaders,
      body: JSON.stringify({ id: chat.id, phone: chat.phone, message: cleanMessage })
    });

    if (!response.ok) {
      showToast("No se pudo guardar el mensaje manual.");
      throw new Error("No se pudo guardar el mensaje manual.");
    }

    const payload = (await response.json()) as
      | Conversation[]
      | {
          conversations?: Conversation[];
          sendStatus?: { sent?: boolean; reason?: string };
        };
    const nextChats = Array.isArray(payload) ? payload : payload.conversations ?? [];

    setChats(nextChats);

    if (!Array.isArray(payload) && payload.sendStatus?.sent) {
      showToast("Mensaje enviado por WhatsApp.");
    } else if (!Array.isArray(payload) && payload.sendStatus?.reason === "missing_ycloud_config") {
      showToast("Mensaje guardado. Falta configurar YCloud para enviarlo.");
    } else if (!Array.isArray(payload) && payload.sendStatus?.reason) {
      showToast("Mensaje guardado, pero YCloud no lo pudo enviar.");
    } else {
      showToast("Mensaje manual guardado en el chat.");
    }
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
    void (async () => {
      try {
        await apiFetch("/api/orders", {
          method: "POST",
          headers: jsonAuthHeaders,
          body: JSON.stringify(order)
        });
        await refreshBusinessData({ notifyNewOrders: false });
        showToast(`Pedido ${order.id} registrado correctamente.`);
      } catch {
        showToast(`Pedido ${order.id} quedó local, pero no se pudo guardar en la API.`);
      }
    })();
  };

  const handleUpdateOrder = (orderId: string, updates: Partial<Order>) => {
    setOrderList((currentOrders) =>
      currentOrders.map((order) => (order.id === orderId ? { ...order, ...updates } : order))
    );

    void (async () => {
      await apiFetch("/api/orders", {
        method: "PATCH",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ id: orderId, updates })
      });
      await refreshBusinessData({ notifyNewOrders: false });
    })();

    showToast(`Pedido ${orderId} actualizado.`);
  };

  const handleAddProduct = async (product: Product) => {
    try {
      const response = await apiFetch("/api/products", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify(product)
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "No se pudo guardar");
      }

      const savedProduct = (await response.json()) as Product;
      setProductList((currentProducts) => [savedProduct, ...currentProducts.filter((item) => item.id !== savedProduct.id)]);
      showToast(`Producto "${product.name}" agregado y publicado en el catálogo.`);
      await refreshBusinessData({ notifyNewOrders: false });
    } catch (error) {
      showToast(`No se pudo agregar "${product.name}".`);
      throw error;
    }
  };

  const patchProduct = async (productId: string, updates: Partial<Product>) => {
    try {
      await apiFetch("/api/products", {
        method: "PATCH",
        headers: jsonAuthHeaders,
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
      const response = await apiFetch("/api/products", {
        method: "DELETE",
        headers: jsonAuthHeaders,
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
        await apiFetch("/api/stock", {
          method: "PATCH",
          headers: jsonAuthHeaders,
          body: JSON.stringify(item)
        }),
        () => stockSaveVersionRef.current[item.id] === nextVersion
      );
      showToast(`Stock actualizado: ${displayStockName(item.item)}.`);
    } catch {
      showToast("El stock quedó local, pero no se pudo guardar en la API.");
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
        await apiFetch("/api/stock", {
          method: stockExists ? "POST" : "PATCH",
          headers: jsonAuthHeaders,
          body: JSON.stringify(stockExists ? { id: item.id, delta } : nextItem)
        })
      );
    } catch {
      showToast("El ajuste quedó local, pero no se pudo guardar en la API.");
    }
  };

  const handleDeleteStockColor = async (color: string) => {
    setStockList((currentStock) => currentStock.filter((stockItem) => stockItem.color !== color));

    try {
      await applyStockResponse(
        await apiFetch("/api/stock", {
          method: "DELETE",
          headers: jsonAuthHeaders,
          body: JSON.stringify({ color })
        })
      );
      showToast(`Color "${color}" eliminado del stock.`);
    } catch {
      showToast("El color se quitó localmente, pero no se pudo eliminar en la API.");
    }
  };

  const handleAddExpense = async (expense: Expense) => {
    setExpenseList((currentExpenses) => [expense, ...currentExpenses]);

    try {
      const response = await apiFetch("/api/expenses", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify(expense)
      });

      if (!response.ok) throw new Error("No se pudo guardar");

      setExpenseList((await response.json()) as Expense[]);
      showToast(`Gasto "${expense.title}" registrado.`);
    } catch {
      showToast("El gasto quedó local, pero no se pudo guardar en la API.");
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const expense = expenseList.find((item) => item.id === expenseId);
    setExpenseList((currentExpenses) => currentExpenses.filter((item) => item.id !== expenseId));

    try {
      const response = await apiFetch("/api/expenses", {
        method: "DELETE",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ id: expenseId })
      });

      if (!response.ok) throw new Error("No se pudo eliminar");

      setExpenseList((await response.json()) as Expense[]);
      showToast(expense ? `Gasto "${expense.title}" eliminado.` : "Gasto eliminado.");
    } catch {
      showToast("El gasto se quitó localmente, pero no se pudo eliminar en la API.");
    }
  };

  const handleUpdateCustomerNote = async (customerId: string, notes: string) => {
    setCustomerList((currentCustomers) =>
      currentCustomers.map((customer) => (customer.id === customerId ? { ...customer, notes } : customer))
    );

    const response = await apiFetch("/api/customers", {
      method: "PATCH",
      headers: jsonAuthHeaders,
      body: JSON.stringify({ id: customerId, notes })
    });

    if (!response.ok) {
      throw new Error("No se pudo guardar la nota del cliente.");
    }

    setCustomerList((await response.json()) as Customer[]);
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
    const countedOrders = orderList.filter((order) => order.status !== "Cancelado");
    return buildLiveMetrics(countedOrders, expenseList);
  }, [expenseList, orderList]);
  const customerOptions = useMemo(() => customersFromOrders(orderList, customerList), [customerList, orderList]);
  const liveChartData = useMemo(() => {
    const countedOrders = orderList.filter((order) => order.status !== "Cancelado");
    return buildLiveChartData(countedOrders);
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
          onNavigate={setActiveSection}
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
          uploadHeaders={authHeaders}
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

    if (activeSection === "historial") {
      return <OrderHistorySection orders={orderList} />;
    }

    if (activeSection === "stock") {
      return (
        <StockSection
          products={productList}
          stock={stockList}
          onDeleteStockColor={handleDeleteStockColor}
          onUpdateStock={handleUpdateStock}
        />
      );
    }

    if (activeSection === "clientes") {
      return <CustomersSection customers={customerList} orders={orderList} onUpdateCustomerNote={handleUpdateCustomerNote} />;
    }

    if (activeSection === "whatsapp") {
      return (
        <WhatsAppSalesSection
          chats={chats}
          orders={orderList}
          onSendManualMessage={handleSendManualMessage}
          onToggleBot={toggleBot}
          onUpdateOrder={handleUpdateOrder}
        />
      );
    }

    if (activeSection === "gastos") {
      return (
        <ExpensesSection
          expenses={expenseList}
          orders={orderList}
          onAddExpense={handleAddExpense}
          onDeleteExpense={handleDeleteExpense}
        />
      );
    }

    if (activeSection === "configuracion") {
      return <ConfigurationSection adminEmail={adminEmail} onNotify={showToast} />;
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
            adminEmail={adminEmail}
            isDark={isDark}
            onRegisterOrder={() => setIsOrderModalOpen(true)}
            onSignOut={onSignOut}
            onToggleTheme={() => setIsDark((value) => !value)}
          />

          {renderActiveSection()}
        </main>
      </div>

      <OrderFormModal
        customers={customerOptions}
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
