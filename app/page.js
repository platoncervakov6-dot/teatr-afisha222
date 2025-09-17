'use client';

import { useEffect, useMemo, useState } from "react";
import EventCard from "@/components/EventCard";
import ChipBar from "@/components/ChipBar";
import { EVENTS as LOCAL_EVENTS, CATEGORIES } from "@/lib/events";

export default function HomePage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Все");
  const [events, setEvents] = useState(LOCAL_EVENTS);
  const [loading, setLoading] = useState(true);

  // Телеграм-фолбэк (как было)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window;
      if (!w.Telegram || !w.Telegram.WebApp) {
        w.Telegram = {
          WebApp: {
            colorScheme: "dark",
            themeParams: {},
            initDataUnsafe: {},
            ready(){}, expand(){}, setHeaderColor(){},
            openLink(url){ window.open(url, "_blank"); }
          }
        };
      }
      try {
        w.Telegram.WebApp.ready();
        w.Telegram.WebApp.expand();
        w.Telegram.WebApp.setHeaderColor("secondary_bg_color");
      } catch {}
    }
  }, []);

  // Подтягиваем агрегированные события с бэка
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/events?limit=200", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && Array.isArray(json.events)) {
          setEvents(json.events);
        }
      } catch (_) {
        // молча оставим локальный фолбэк
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (events || []).filter(ev => {
      const inCat = cat === "Все" || (ev.categories||[]).some(g => g.toLowerCase() === cat.toLowerCase());
      const okQ = !query || [ev.title, ev.venue?.name, ev.description, ...(ev.categories||[])]
        .some(v => String(v||"").toLowerCase().includes(query));
      return inCat && okQ;
    }).sort((a,b) => new Date(a.dateStart) - new Date(b.dateStart));
  }, [q, cat, events]);

  return (
    <div className="app">
      <div className="header">
        <div className="title">Москва Афиша</div>
        <label className="search" aria-label="Поиск">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти спектакль, театр…" />
        </label>
      </div>

      <ChipBar categories={CATEGORIES} current={cat} onChange={setCat} />

      <div className="grid">
        {loading && <div className="empty">Загружаем события…</div>}
        {!loading && list.length === 0 ? (
          <div className="empty">Ничего не найдено. Попробуйте изменить запрос или фильтр.</div>
        ) : !loading && list.map(ev => <EventCard key={ev.id} ev={ev} />)}
      </div>

      <div className="footer">
        Прототип мини-приложения. Источники: KudaGo (+ скоро Яндекс.Афиша, Ticketland, Kassir). •{" "}
        <a href="#" onClick={(e)=>{e.preventDefault(); alert('Данные подтягиваются с сервера и кэшируются на 15 минут.');}}>
          о проекте
        </a>
      </div>
    </div>
  );
}

