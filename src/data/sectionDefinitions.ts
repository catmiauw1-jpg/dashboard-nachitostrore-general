import type { SectionKey } from "@/types";

type Tone = "success" | "warning" | "danger" | "info" | "accent";

interface SummaryItem {
  label: string;
  value: string;
  detail: string;
}

interface ModuleItem {
  title: string;
  description: string;
  status: string;
  tone: Tone;
}

export interface SectionDefinition {
  kicker: string;
  title: string;
  description: string;
  primaryAction: string;
  summary: SummaryItem[];
  mainPanel: {
    title: string;
    description: string;
    badge: string;
    badgeTone: Tone;
    items: ModuleItem[];
  };
  nextStep: string;
  futureConnection: string;
}

export const sectionDefinitions: Record<Exclude<SectionKey, "inicio">, SectionDefinition> = {
  pedidos: {
    kicker: "Ventas",
    title: "Pedidos",
    description: "Controla pedidos de catálogo, pagos, entrega y estado de preparación.",
    primaryAction: "Registrar pedido",
    summary: [
      { label: "Activos", value: "3", detail: "Pedidos en proceso" },
      { label: "Pendientes", value: "1", detail: "Pago por confirmar" },
      { label: "Listos", value: "1", detail: "Preparado para entregar" }
    ],
    mainPanel: {
      title: "Flujo de pedidos",
      description: "Base para registrar ventas que llegan desde la web, WhatsApp o venta manual.",
      badge: "Mock data",
      badgeTone: "accent",
      items: [
        {
          title: "Pedido de catálogo",
          description: "Cliente elige una prenda existente, talla, color, cantidad y entrega.",
          status: "Listo para formulario",
          tone: "success"
        },
        {
          title: "Pago y comprobante",
          description: "Estados previstos: pendiente, 50% pagado o pago completo.",
          status: "Pendiente UI",
          tone: "warning"
        },
        {
          title: "Entrega",
          description: "Preparado para recoger en tienda o envío por Yango.",
          status: "Planificado",
          tone: "info"
        }
      ]
    },
    nextStep: "Crear el modal Registrar pedido con catálogo, cliente, pago y entrega.",
    futureConnection: "Luego este módulo recibirá pedidos desde webhooks de n8n y desde la página web."
  },
  personalizados: {
    kicker: "Producción",
    title: "Pedidos personalizados",
    description: "Gestiona diseños DTF, referencias, anticipo, producción y aprobación del cliente.",
    primaryAction: "Nuevo personalizado",
    summary: [
      { label: "En diseño", value: "2", detail: "Requieren revisión" },
      { label: "Con anticipo", value: "1", detail: "Pago parcial" },
      { label: "Por entregar", value: "0", detail: "Sin entregas hoy" }
    ],
    mainPanel: {
      title: "Etapas de personalización",
      description: "Pantalla preparada para separar catálogo normal de pedidos personalizados.",
      badge: "Producción",
      badgeTone: "info",
      items: [
        {
          title: "Referencia del cliente",
          description: "Guardar imagen, texto, color de polera y ubicación del diseño.",
          status: "Pendiente",
          tone: "warning"
        },
        {
          title: "Aprobación",
          description: "Estado para saber si el cliente aprobó el diseño final.",
          status: "Planificado",
          tone: "info"
        },
        {
          title: "Producción",
          description: "Seguimiento de impresión, planchado, empaquetado y entrega.",
          status: "Planificado",
          tone: "info"
        }
      ]
    },
    nextStep: "Crear formulario específico para poleras personalizadas.",
    futureConnection: "Más adelante n8n podrá guardar referencias del cliente desde WhatsApp."
  },
  productos: {
    kicker: "Catálogo",
    title: "Productos",
    description: "Administra prendas del catálogo, precios, visibilidad y variantes.",
    primaryAction: "Agregar producto",
    summary: [
      { label: "Publicados", value: "8", detail: "Visibles en web" },
      { label: "Ocultos", value: "1", detail: "No aparecen en catálogo" },
      { label: "Agotados", value: "2", detail: "Sin stock suficiente" }
    ],
    mainPanel: {
      title: "Estructura del catálogo",
      description: "Base para manejar productos, tallas, colores, fotos y precios.",
      badge: "Catálogo",
      badgeTone: "accent",
      items: [
        {
          title: "Producto base",
          description: "Nombre, descripción, precio, costo estimado y estado visible/oculto.",
          status: "Pendiente UI",
          tone: "warning"
        },
        {
          title: "Variantes",
          description: "Tallas y colores para controlar stock por combinación.",
          status: "Planificado",
          tone: "info"
        },
        {
          title: "Producto agotado",
          description: "Marcar como agotado sin borrar el historial de ventas.",
          status: "Planificado",
          tone: "info"
        }
      ]
    },
    nextStep: "Crear formularios para agregar y editar productos.",
    futureConnection: "Después se sincronizará con la página web para actualizar precios y stock."
  },
  stock: {
    kicker: "Inventario",
    title: "Stock",
    description: "Controla unidades disponibles por producto, talla, color y mínimo recomendado.",
    primaryAction: "Actualizar stock",
    summary: [
      { label: "Bajo mínimo", value: "2", detail: "Reponer pronto" },
      { label: "OK", value: "2", detail: "Stock suficiente" },
      { label: "Movimientos", value: "4", detail: "Mock del día" }
    ],
    mainPanel: {
      title: "Matriz de inventario",
      description: "Preparado para registrar entradas, salidas y ajustes manuales.",
      badge: "Stock crítico",
      badgeTone: "danger",
      items: [
        {
          title: "Stock por variante",
          description: "Cada producto podrá tener stock separado por talla y color.",
          status: "Planificado",
          tone: "info"
        },
        {
          title: "Alertas",
          description: "Avisos cuando una variante esté por debajo del mínimo recomendado.",
          status: "Base lista",
          tone: "success"
        },
        {
          title: "Movimientos",
          description: "Historial de compras, ventas y correcciones de inventario.",
          status: "Pendiente UI",
          tone: "warning"
        }
      ]
    },
    nextStep: "Crear formulario para sumar, restar o ajustar stock.",
    futureConnection: "Luego cada pedido descontará stock automáticamente desde la base de datos."
  },
  clientes: {
    kicker: "CRM",
    title: "Clientes",
    description: "Consulta compradores frecuentes, teléfonos, tallas preferidas y compras anteriores.",
    primaryAction: "Agregar cliente",
    summary: [
      { label: "Registrados", value: "3", detail: "Mock inicial" },
      { label: "Frecuentes", value: "1", detail: "Más de una compra" },
      { label: "WhatsApp", value: "3", detail: "Con teléfono" }
    ],
    mainPanel: {
      title: "Perfil del cliente",
      description: "Base para ver historial y preferencias sin buscar conversación por conversación.",
      badge: "Clientes",
      badgeTone: "accent",
      items: [
        {
          title: "Datos básicos",
          description: "Nombre, teléfono, canal, dirección y notas internas.",
          status: "Planificado",
          tone: "info"
        },
        {
          title: "Historial de compras",
          description: "Pedidos anteriores, pagos, productos y preferencias.",
          status: "Pendiente UI",
          tone: "warning"
        },
        {
          title: "Segmentos",
          description: "Detectar cliente frecuente o comprador de personalizados.",
          status: "Planificado",
          tone: "info"
        }
      ]
    },
    nextStep: "Crear tabla de clientes con búsqueda y perfil lateral.",
    futureConnection: "n8n podrá crear o actualizar clientes automáticamente desde WhatsApp."
  },
  gastos: {
    kicker: "Finanzas",
    title: "Gastos",
    description: "Registra costos de poleras, DTF, empaques, publicidad y entregas.",
    primaryAction: "Registrar gasto",
    summary: [
      { label: "Mes actual", value: "610 Bs", detail: "Mock de costos" },
      { label: "Publicidad", value: "120 Bs", detail: "Campañas" },
      { label: "Insumos", value: "490 Bs", detail: "Poleras y DTF" }
    ],
    mainPanel: {
      title: "Control de costos",
      description: "Base para calcular ganancia real y no solo ventas brutas.",
      badge: "Finanzas",
      badgeTone: "warning",
      items: [
        {
          title: "Categorías",
          description: "Poleras, DTF, empaques, publicidad, delivery y otros.",
          status: "Planificado",
          tone: "info"
        },
        {
          title: "Ganancia aproximada",
          description: "Ventas menos costos directos y gastos registrados.",
          status: "Base lista",
          tone: "success"
        },
        {
          title: "Reporte mensual",
          description: "Resumen para saber cuánto reinvertir y cuánto queda libre.",
          status: "Pendiente UI",
          tone: "warning"
        }
      ]
    },
    nextStep: "Crear formulario simple de gastos y categorías.",
    futureConnection: "Más adelante se podrá exportar a Excel o Google Sheets."
  },
  whatsapp: {
    kicker: "Automatización",
    title: "WhatsApp / Bot",
    description: "Supervisa conversaciones, estado del pedido y control ON/OFF por chat.",
    primaryAction: "Abrir conversación",
    summary: [
      { label: "Bot activo", value: "2", detail: "Chats automatizados" },
      { label: "Manual", value: "1", detail: "Atención humana" },
      { label: "Alertas", value: "1", detail: "Falta comprobante" }
    ],
    mainPanel: {
      title: "Centro de conversaciones",
      description: "Pantalla preparada para ver historial, cliente, pedido y estado del bot.",
      badge: "n8n futuro",
      badgeTone: "accent",
      items: [
        {
          title: "Control del bot",
          description: "Prender o apagar automatización por conversación.",
          status: "Base lista",
          tone: "success"
        },
        {
          title: "Mensajes",
          description: "Historial de mensajes enviados y recibidos.",
          status: "Planificado",
          tone: "info"
        },
        {
          title: "Comprobante",
          description: "Guardar evidencia de pago enviada por el cliente.",
          status: "Pendiente conexión",
          tone: "warning"
        }
      ]
    },
    nextStep: "Crear vista de conversaciones con panel de detalle.",
    futureConnection: "Luego se conectará a webhooks de n8n para leer mensajes y cambiar botActivo."
  },
  configuracion: {
    kicker: "Sistema",
    title: "Configuración",
    description: "Ajusta datos del negocio, usuarios, seguridad, integraciones y preferencias.",
    primaryAction: "Guardar cambios",
    summary: [
      { label: "Modo", value: "Mock", detail: "Sin base conectada" },
      { label: "Usuarios", value: "1", detail: "Admin futuro" },
      { label: "Integraciones", value: "0", detail: "Pendientes" }
    ],
    mainPanel: {
      title: "Ajustes principales",
      description: "Base para centralizar credenciales, permisos y comportamiento del dashboard.",
      badge: "Seguro",
      badgeTone: "info",
      items: [
        {
          title: "Negocio",
          description: "Nombre de tienda, moneda, horarios y reglas de entrega.",
          status: "Planificado",
          tone: "info"
        },
        {
          title: "Acceso administrador",
          description: "Login, sesión, permisos y protección del panel.",
          status: "Futuro auth",
          tone: "warning"
        },
        {
          title: "Integraciones",
          description: "Supabase, n8n, WhatsApp y webhooks.",
          status: "Futuro",
          tone: "accent"
        }
      ]
    },
    nextStep: "Definir qué ajustes deben existir antes de conectar base de datos.",
    futureConnection: "Aquí se conectarán credenciales seguras y opciones de automatización."
  }
};
