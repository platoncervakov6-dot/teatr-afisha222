export const dynamic = "force-dynamic";

import EventCard from "../components/EventCard.jsx";
import ChipBar from "../components/ChipBar.jsx";

async function safeFetchJSON(url) {
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(to);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

async function getEvents() {
  const worker = process.env.NEXT_PUBLIC_EVENTS_API?.trim();
  const local = "/api/events";
  const urls = [worker, local].filter(Boolean).map(u => `${u}?limit=200`);
  for (const url of urls) {
    const data = await safeFetchJSON(url);
    const list = data?.events;
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

export default async function Page() {
  const events = await getEvents();
  const has = Array.isArray(events) && events.length > 0;
  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Москва Афиша</h1>
        <input className="search" placeholder="Найти спектакль, театр…" />
      </header>
      <ChipBar />
      <div className="grid">
        {has ? events.map((e, i) => <EventCard key={e?.id ?? i} event={e} />)
             : <div className="empty">Пока ничего не нашли. Обновите через минуту.</div>}
      </div>
    </div>
  );
}



