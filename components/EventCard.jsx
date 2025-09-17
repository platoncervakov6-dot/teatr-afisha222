export default function EventCard({ event = {} }) {
  const title = event.title || "Без названия";
  const venue = event.venue?.name || "";
  const date = event.dateStart ? new Date(event.dateStart).toLocaleString("ru-RU") : "";
  const tags = Array.isArray(event.categories) ? event.categories : [];
  const buy = event.buyUrl || event.siteUrl || "#";
  const site = event.siteUrl || "#";

  return (
    <article className="card">
      <div className="content">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="h3">{title}</div>
          <div className="chip">{(tags[0] || "Событие").toUpperCase()}</div>
        </div>
        <div className="desc">
          {venue ? `${venue} • ` : ""}{date}
        </div>
        <div className="tags">
          {tags.map((t) => <span key={t} className="chip">{t}</span>)}
        </div>
        <div className="actions">
          <a className="btn" href={buy} target="_blank" rel="noreferrer">Купить билеты</a>
          <a className="btn secondary" href={site} target="_blank" rel="noreferrer">Сайт театра</a>
        </div>
      </div>
    </article>
  );
}
