// lib/providers/index.js
import { fetchFromKudaGo } from "./kudago";
import { fetchFromYandexAfisha } from "./yandex-afisha";
import { fetchFromTicketland } from "./ticketland";
import { fetchFromKassir } from "./kassir";
import { dedupeByKey } from "../utils";

export async function aggregateAll({ city = "moscow", noCache = false } = {}) {
  const tasks = [
    fetchFromKudaGo({ city, noCache }),
    fetchFromYandexAfisha({ city, noCache }), // пока возвращает []
    fetchFromTicketland({ city, noCache }),   // пока возвращает []
    fetchFromKassir({ city, noCache })        // пока возвращает []
  ];

  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap(s =>
    s.status === "fulfilled" ? s.value : []
  );

  // дедуп: title@date@venue
  const keyOf = (e) =>
    `${(e.title||"").toLowerCase()}|${(e.venue?.name||"").toLowerCase()}|${(e.dateStart||"").slice(0,10)}`;

  return dedupeByKey(all, keyOf);
}
