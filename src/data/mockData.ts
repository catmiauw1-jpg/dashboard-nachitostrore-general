import type {
  ChartData,
  Conversation,
  Customer,
  Metric,
  NavigationItem,
  Order,
  Product,
  StockItem
} from "@/types";

export const navigationItems: NavigationItem[] = [
  { key: "inicio", label: "Inicio", index: "01" },
  { key: "productos", label: "Productos", index: "02" },
  { key: "pedidos", label: "Pedidos", index: "03" },
  { key: "stock", label: "Stock", index: "04" },
  { key: "clientes", label: "Clientes", index: "05" },
  { key: "gastos", label: "Gastos", index: "06" },
  { key: "whatsapp", label: "WhatsApp / Bot", index: "07" },
  { key: "configuracion", label: "Configuración", index: "08" }
];

export const metrics: Metric[] = [
  {
    label: "Ventas de hoy",
    value: "430 Bs",
    icon: "Bs",
    details: ["3 prendas", "2 pedidos"]
  },
  {
    label: "Ventas semanales",
    value: "3.030 Bs",
    icon: "7D",
    details: ["21 prendas", "12 pedidos"]
  },
  {
    label: "Ganancia estimada",
    value: "920 Bs",
    icon: "%",
    details: ["Costos base descontados"]
  },
  {
    label: "Pendientes",
    value: "3",
    icon: "!",
    details: ["1 pago", "2 producción"]
  }
];

export const chartData: ChartData = {
  weekly: [
    { label: "Lun", ventas: 240, prendas: 2, pedidos: 1 },
    { label: "Mar", ventas: 380, prendas: 3, pedidos: 2 },
    { label: "Mié", ventas: 310, prendas: 2, pedidos: 2 },
    { label: "Jue", ventas: 520, prendas: 4, pedidos: 3 },
    { label: "Vie", ventas: 460, prendas: 3, pedidos: 2 },
    { label: "Sáb", ventas: 690, prendas: 4, pedidos: 2 },
    { label: "Dom", ventas: 430, prendas: 3, pedidos: 2 }
  ],
  monthly: {
    enero: [
      { label: "Sem 1", ventas: 980, prendas: 8, pedidos: 5 },
      { label: "Sem 2", ventas: 1240, prendas: 10, pedidos: 6 },
      { label: "Sem 3", ventas: 890, prendas: 7, pedidos: 4 },
      { label: "Sem 4", ventas: 1360, prendas: 11, pedidos: 7 }
    ],
    febrero: [
      { label: "Sem 1", ventas: 840, prendas: 7, pedidos: 4 },
      { label: "Sem 2", ventas: 1190, prendas: 9, pedidos: 6 },
      { label: "Sem 3", ventas: 980, prendas: 8, pedidos: 5 },
      { label: "Sem 4", ventas: 1420, prendas: 12, pedidos: 7 }
    ],
    marzo: [
      { label: "Sem 1", ventas: 1100, prendas: 9, pedidos: 5 },
      { label: "Sem 2", ventas: 1540, prendas: 12, pedidos: 7 },
      { label: "Sem 3", ventas: 1320, prendas: 10, pedidos: 6 },
      { label: "Sem 4", ventas: 1710, prendas: 14, pedidos: 8 }
    ],
    abril: [
      { label: "Sem 1", ventas: 960, prendas: 8, pedidos: 5 },
      { label: "Sem 2", ventas: 1280, prendas: 10, pedidos: 6 },
      { label: "Sem 3", ventas: 1450, prendas: 11, pedidos: 7 },
      { label: "Sem 4", ventas: 1210, prendas: 9, pedidos: 5 }
    ],
    mayo: [
      { label: "Sem 1", ventas: 1020, prendas: 8, pedidos: 5 },
      { label: "Sem 2", ventas: 1340, prendas: 10, pedidos: 6 },
      { label: "Sem 3", ventas: 1490, prendas: 12, pedidos: 7 },
      { label: "Sem 4", ventas: 1580, prendas: 13, pedidos: 8 }
    ],
    junio: [
      { label: "Sem 1", ventas: 890, prendas: 7, pedidos: 4 },
      { label: "Sem 2", ventas: 1180, prendas: 9, pedidos: 5 },
      { label: "Sem 3", ventas: 1260, prendas: 10, pedidos: 6 },
      { label: "Sem 4", ventas: 1390, prendas: 11, pedidos: 6 }
    ],
    julio: [
      { label: "Sem 1", ventas: 970, prendas: 8, pedidos: 5 },
      { label: "Sem 2", ventas: 1230, prendas: 10, pedidos: 6 },
      { label: "Sem 3", ventas: 1180, prendas: 9, pedidos: 5 },
      { label: "Sem 4", ventas: 1440, prendas: 11, pedidos: 7 }
    ],
    agosto: [
      { label: "Sem 1", ventas: 1110, prendas: 9, pedidos: 5 },
      { label: "Sem 2", ventas: 1380, prendas: 11, pedidos: 6 },
      { label: "Sem 3", ventas: 1520, prendas: 12, pedidos: 7 },
      { label: "Sem 4", ventas: 1610, prendas: 13, pedidos: 8 }
    ],
    septiembre: [
      { label: "Sem 1", ventas: 950, prendas: 8, pedidos: 5 },
      { label: "Sem 2", ventas: 1210, prendas: 9, pedidos: 5 },
      { label: "Sem 3", ventas: 1330, prendas: 10, pedidos: 6 },
      { label: "Sem 4", ventas: 1470, prendas: 11, pedidos: 7 }
    ],
    octubre: [
      { label: "Sem 1", ventas: 1080, prendas: 9, pedidos: 5 },
      { label: "Sem 2", ventas: 1290, prendas: 10, pedidos: 6 },
      { label: "Sem 3", ventas: 1430, prendas: 11, pedidos: 7 },
      { label: "Sem 4", ventas: 1680, prendas: 13, pedidos: 8 }
    ],
    noviembre: [
      { label: "Sem 1", ventas: 1010, prendas: 8, pedidos: 5 },
      { label: "Sem 2", ventas: 1170, prendas: 9, pedidos: 5 },
      { label: "Sem 3", ventas: 1360, prendas: 11, pedidos: 6 },
      { label: "Sem 4", ventas: 1550, prendas: 12, pedidos: 7 }
    ],
    diciembre: [
      { label: "Sem 1", ventas: 1420, prendas: 11, pedidos: 6 },
      { label: "Sem 2", ventas: 1660, prendas: 13, pedidos: 8 },
      { label: "Sem 3", ventas: 1850, prendas: 15, pedidos: 9 },
      { label: "Sem 4", ventas: 2100, prendas: 17, pedidos: 10 }
    ]
  },
  yearly: [
    { label: "Ene", ventas: 4470, prendas: 36, pedidos: 22 },
    { label: "Feb", ventas: 4430, prendas: 36, pedidos: 22 },
    { label: "Mar", ventas: 5670, prendas: 45, pedidos: 26 },
    { label: "Abr", ventas: 4900, prendas: 38, pedidos: 23 },
    { label: "May", ventas: 5430, prendas: 43, pedidos: 26 },
    { label: "Jun", ventas: 4720, prendas: 37, pedidos: 21 },
    { label: "Jul", ventas: 4820, prendas: 38, pedidos: 23 },
    { label: "Ago", ventas: 5620, prendas: 45, pedidos: 26 },
    { label: "Sep", ventas: 4960, prendas: 38, pedidos: 23 },
    { label: "Oct", ventas: 5480, prendas: 43, pedidos: 26 },
    { label: "Nov", ventas: 5090, prendas: 40, pedidos: 23 },
    { label: "Dic", ventas: 7030, prendas: 56, pedidos: 33 }
  ]
};

export const stockData: StockItem[] = [
  {
    id: "base-polera-dtf::Blanco arena::M",
    productId: "base-polera-dtf",
    productName: "Polera base DTF",
    size: "M",
    color: "Blanco arena",
    item: "Polera base DTF Blanco arena M",
    available: 2,
    min: 1
  },
  {
    id: "base-polera-dtf::Blanco arena::L",
    productId: "base-polera-dtf",
    productName: "Polera base DTF",
    size: "L",
    color: "Blanco arena",
    item: "Polera base DTF Blanco arena L",
    available: 5,
    min: 1
  },
  {
    id: "base-polera-dtf::Blanco arena::XL",
    productId: "base-polera-dtf",
    productName: "Polera base DTF",
    size: "XL",
    color: "Blanco arena",
    item: "Polera base DTF Blanco arena XL",
    available: 3,
    min: 1
  },
  {
    id: "base-polera-dtf::Negro::M",
    productId: "base-polera-dtf",
    productName: "Polera base DTF",
    size: "M",
    color: "Negro",
    item: "Polera base DTF Negro M",
    available: 3,
    min: 1
  },
  {
    id: "base-polera-dtf::Negro::L",
    productId: "base-polera-dtf",
    productName: "Polera base DTF",
    size: "L",
    color: "Negro",
    item: "Polera base DTF Negro L",
    available: 3,
    min: 1
  },
  {
    id: "base-polera-dtf::Negro::XL",
    productId: "base-polera-dtf",
    productName: "Polera base DTF",
    size: "XL",
    color: "Negro",
    item: "Polera base DTF Negro XL",
    available: 2,
    min: 1
  }
];

export const customers: Customer[] = [
  { id: "cus-001", name: "María López", phone: "+591 70000001", channel: "WhatsApp" },
  { id: "cus-002", name: "Camila Rojas", phone: "+591 70000003", channel: "Instagram" },
  { id: "cus-003", name: "Sofía Méndez", phone: "+591 70000002", channel: "Web" }
];

export const products: Product[] = [
  {
    id: "prod-oversize-hueso",
    name: "Oversize blanco hueso",
    category: "Oversize",
    basePrice: 160,
    colors: ["Blanco hueso", "Negro", "Arena"],
    sizes: ["S", "M", "L", "XL"]
  },
  {
    id: "prod-negra-minimal",
    name: "Polera negra minimal",
    category: "Regular",
    basePrice: 130,
    colors: ["Negro", "Blanco"],
    sizes: ["S", "M", "L"]
  },
  {
    id: "prod-regular-blanca",
    name: "Regular blanco básico",
    category: "Regular",
    basePrice: 120,
    colors: ["Blanco", "Negro"],
    sizes: ["S", "M", "L", "XL"]
  }
];

export const orders: Order[] = [
  {
    id: "#1028",
    customer: "María López",
    type: "Personalizada",
    product: "Oversize blanco hueso",
    payment: "50% pagado",
    status: "En preparación",
    total: 160,
    channel: "WhatsApp",
    prendas: 1,
    source: "Web personaliza",
    botStatus: "Bot registrado",
    color: "Blanco arena",
    size: "M",
    designDetails: "Diseño frontal pequeño, frase corta y estilo minimal.",
    quoteOption: "Solo frente pequeño",
    referenceImages: [
      "https://nachitostore.vercel.app/imagenes/medidas%20de%20camisas/solo%20frente%20peque%C3%B1o%20blanco%20hueso.png",
      "Logo NS"
    ]
  },
  {
    id: "#1027",
    customer: "Camila Rojas",
    type: "Catálogo",
    product: "Polera negra minimal",
    payment: "Pago completo",
    status: "Lista para enviar",
    total: 130,
    channel: "Instagram",
    prendas: 1,
    source: "Web catálogo",
    botStatus: "Bot registrado",
    color: "Negro",
    size: "L"
  },
  {
    id: "#1026",
    customer: "Sofía Méndez",
    type: "Personalizada",
    product: "Diseño DTF espalda",
    payment: "Pendiente",
    status: "Esperando pago",
    total: 170,
    channel: "Web",
    prendas: 1,
    source: "Web personaliza",
    botStatus: "Esperando comprobante",
    color: "Negro",
    size: "XL",
    designDetails: "Imagen grande en espalda con texto blanco. Cliente pidió revisar tamaño antes de imprimir.",
    quoteOption: "Solo espalda grande",
    referenceImages: [
      "https://nachitostore.vercel.app/imagenes/medidas%20de%20camisas/solo%20espalda%20grande%20negro.png",
      "Referencia del cliente",
      "Detalle texto"
    ]
  }
];

export const initialChats: Conversation[] = [
  {
    name: "María López",
    phone: "+591 70000001",
    bot: true,
    alert: false,
    status: "Pedido en preparación"
  },
  {
    name: "Sofía Méndez",
    phone: "+591 70000002",
    bot: true,
    alert: true,
    status: "Falta comprobante"
  },
  {
    name: "Camila Rojas",
    phone: "+591 70000003",
    bot: false,
    alert: false,
    status: "Atención manual"
  }
];
