const cards = [
  {
    icon: "ENV",
    title: "Entregas con Yango",
    description: "Control manual del envío: pendiente, solicitado, enviado y entregado."
  },
  {
    icon: "GAS",
    title: "Gastos y reinversión",
    description:
      "Registra poleras, DTF, empaques, publicidad y otros costos para calcular mejor la ganancia real."
  },
  {
    icon: "CLI",
    title: "Clientes frecuentes",
    description:
      "Identifica quién compra más, su talla favorita, colores preferidos y compras anteriores."
  }
];

export function BottomCards() {
  return (
    <section className="bottom-grid">
      {cards.map((card) => (
        <article className="mini-card" key={card.title}>
          <div className="mini-icon">{card.icon}</div>
          <h3>{card.title}</h3>
          <p>{card.description}</p>
        </article>
      ))}
    </section>
  );
}
