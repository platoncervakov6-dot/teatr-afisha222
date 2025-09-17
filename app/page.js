'use client';

import { useEffect, useMemo, useState } from "react";
import { EVENTS, CATEGORIES } from "@/lib/events";
import EventCard from "@/components/EventCard";
import ChipBar from "@/components/ChipBar";

export default function HomePage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Все");

  useEffect(() => {
    // Fallback для превью вне Telegram
    if (typeof window !== "undefined") {
      const w = window;
      if (!w.Telegram || !w.Telegram.WebApp) {
        w.Telegram = {
          WebApp: {
            colorScheme: "dark",
            themeParams: {},
            initDataUnsafe: {},
            ready(){},
            expand(){},
            setHeaderColor(){},
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

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return EVENTS.filter(ev => {
      const inCat = cat === "Все" || (ev.genres||[]).some(g => g.toLowerCase() === cat.toLowerCase()) || ev.title.toLowerCase().includes(cat.toLowerCase());
      const okQ = !query || [ev.title, ev.theatre, ev.description, ...(ev.genres||[])].some(v => String(v).toLowerCase().includes(query));
      return inCat && okQ;
    });
  }, [q, cat]);

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
        {list.length === 0 ? (
          <div className="empty">Ничего не найдено. Попробуйте изменить запрос или фильтр.</div>
        ) : list.map(ev => <EventCard key={ev.id} ev={ev} />)}
      </div>

      <div className="footer">
        Прототип мини-приложения. Данные фейковые для проверки UI. •{" "}
        <a href="#" onClick={(e)=>{e.preventDefault(); alert('Москва Афиша — прототип Telegram Mini App. Сейчас показаны 2 фейк-мероприятия для проверки интерфейса.');}}>
          о проекте
        </a>
      </div>
    </div>
  );
}
