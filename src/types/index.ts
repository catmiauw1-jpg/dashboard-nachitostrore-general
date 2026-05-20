export type SectionKey =
  | "inicio"
  | "pedidos"
  | "productos"
  | "stock"
  | "clientes"
  | "gastos"
  | "whatsapp"
  | "configuracion";

export type Period = "weekly" | "monthly" | "yearly";

export type MonthKey =
  | "enero"
  | "febrero"
  | "marzo"
  | "abril"
  | "mayo"
  | "junio"
  | "julio"
  | "agosto"
  | "septiembre"
  | "octubre"
  | "noviembre"
  | "diciembre";

export type PaymentStatus = "Pendiente" | "50% pagado" | "Pago completo";

export type OrderStatus =
  | "Esperando pago"
  | "En preparación"
  | "Lista para enviar"
  | "Entregado"
  | "Cancelado";

export type OrderType = "Catálogo" | "Personalizada";

export type SalesChannel = "WhatsApp" | "Instagram" | "Web" | "Manual";

export type DeliveryMethod = "Recoger" | "Yango";

export type OrderSource = "Web catálogo" | "Web personaliza" | "WhatsApp bot" | "Manual";

export type BotOrderStatus = "Bot registrado" | "Esperando comprobante" | "Atención manual";

export interface ChartPoint {
  label: string;
  ventas: number;
  prendas: number;
  pedidos: number;
}

export interface ChartData {
  weekly: ChartPoint[];
  monthly: Record<MonthKey, ChartPoint[]>;
  yearly: ChartPoint[];
}

export interface Metric {
  label: string;
  value: string;
  icon: string;
  details: string[];
}

export interface StockItem {
  id: string;
  productId: string;
  productName: string;
  size: string;
  color: string;
  item: string;
  available: number;
  min: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  channel: SalesChannel;
}

export interface Product {
  id: string;
  name: string;
  category: "Oversize" | "Regular" | "Personalizada";
  webCategory?: string;
  description?: string;
  basePrice: number;
  colors: string[];
  sizes: string[];
  imageUrl?: string;
  imageUrls?: string[];
  stock?: StockItem[];
  isHidden?: boolean;
  isSoldOut?: boolean;
}

export interface Order {
  id: string;
  customer: string;
  customerPhone?: string;
  type: OrderType;
  product: string;
  size?: string;
  color?: string;
  payment: PaymentStatus;
  status: OrderStatus;
  total: number;
  channel: SalesChannel;
  prendas: number;
  delivery?: DeliveryMethod;
  notes?: string;
  source?: OrderSource;
  botStatus?: BotOrderStatus;
  designDetails?: string;
  referenceImages?: string[];
}

export interface Conversation {
  name: string;
  phone: string;
  bot: boolean;
  alert: boolean;
  status: string;
}

export interface NavigationItem {
  key: SectionKey;
  label: string;
  index: string;
}
