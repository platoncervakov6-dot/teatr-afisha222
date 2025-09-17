// app/page.js
// Страница всегда рендерится на запрос (без пререндеринга)
export const dynamic = "force-dynamic";

import EventCard from "../components/EventCard.jsx";
import ChipBar from "../components/ChipBar.jsx";

async function getEvents() {
  // 1) основной источник — Cloudflare Worker (если задан)
  // 2) фолбэк — локальная ручка /api/events
  const worker = process.env.NEXT_PUBLIC_EVENTS_API;
  const local = "/api/events";
  const urls = [worker, local].filter(Boolean).map(u => `${u}?limit=200`);

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000); // таймаут 8с
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const list = data && Array.isArray(data.events) ? data.events : [];
      if (list.length) return list;
    } catch (_) {
      // пробуем следующий источник
    }
  }

  return []; // ни один источник не сработал — вернём пусто
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
          <div className="empty">
            Ничего не нашли. Нажмите «Попробовать снова» или зайдите чуть позже.
          </div>
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

