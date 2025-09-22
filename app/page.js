// app/page.js
export const dynamic = "force-dynamic"; // всегда рендерим свежие данные

import ChipBar from "../components/ChipBar.jsx";
import EventCard from "../components/EventCard.jsx";

/** URL API: берём из ENV, иначе локальный эндпоинт */
const API =
  (process.env.NEXT_PUBLIC_EVENTS_API || "/api/events").trim().replace(/\/+$/, "");

/** безопасный fetch JSON с таймаутом */
async function safeFetchJSON(url, opts = {}) {
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), opts.timeout ?? 8000);
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "accept": "application/json" },
    });
    clearTimeout(to);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** получаем события с API; ожидаем { events: [] } */
async function getEvents() {
  // сначала пробуем основной API
  const primary = await safeFetchJSON(`${API}?limit=300`);
  if (Array.isArray(primary?.events) && primary.events.length) {
    return primary.events;
  }
  // fallback: локальный /api/events на всякий случай
  if (!API.startsWith("/api/")) {
    const fallback = await safeFetchJSON(`/api/events?limit=300`);
    if (Array.isArray(fallback?.events)) return fallback.events;
  }
  return [];
}

/** главная страница */
export default async function Page() {
  const events = await getEvents();
  const hasData = Array.isArray(events) && events.length > 0;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Москва Афиша</h1>

        {/* декоративный поиск (без логики фильтра — добавим позже) */}
        <div className="search">
          <input placeholder="Найти спектакль, театр…" aria-label="Поиск" />
          <button aria-label="Искать">⌕</button>
        </div>
      </header>

      {/* чипы-фильтры (визуальные; логику добавим после) */}
      <ChipBar />

      <main className="grid">
        {hasData ? (
          events.map((e, i) => <EventCard key={e?.id ?? i} event={e} />)
        ) : (
          <EmptyState />
        )}
      </main>

      <Footer />
    </div>
  );
}

/** пустое состояние */
function EmptyState() {
  return (
    <div className="empty">
      <div style={{ fontSize: 16, opacity: 0.9, marginBottom: 8 }}>
        Пока ничего не нашли
      </div>
      <div style={{ fontSize: 13, opacity: 0.7 }}>
        Попробуйте обновить страницу через минуту — данные могли ещё кэшироваться.
      </div>
    </div>
  );
}

/** футер */
function Footer() {
  return (
    <footer className="footer">
      Прототип мини-приложения. Источники: KudaGo (и др. пригодятся позже).
    </footer>
  );
}


