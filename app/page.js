// app/page.js
// Server Component (Next.js 13/14, app router)
// Берём события из API: сначала из NEXT_PUBLIC_EVENTS_API (Cloudflare Worker),
// иначе из локальной ручки /api/events

import EventCard from "../components/EventCard.jsx";
import ChipBar from "../components/ChipBar.jsx";

async function getEvents() {
  const API = process.env.NEXT_PUBLIC_EVENTS_API || `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/events`;
  // limit можно увеличить — UI всё равно фильтрует
  const res = await fetch(`${API}?limit=200`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ events: [] }));
  return Array.isArray(data.events) ? data.events : [];
}

export default async function Page() {
  const events = await getEvents();

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Москва Афиша</h1>
        <input className="search" placeholder="Найти спектакль, театр…" />
      </header>

      <ChipBar />

      <div className="grid">
        {events.length === 0 ? (
          <div className="empty">Пока ничего не нашли. Попробуйте позже.</div>
        ) : (
          events.map((ev) => <EventCard key={ev.id} event={ev} />)
        )}
      </div>

      <footer className="footer">
        Прототип мини-приложения. Данные собираются автоматически.
      </footer>
    </div>
  );
}


