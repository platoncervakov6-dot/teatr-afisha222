// lib/providers/index.js
import { fetchFromKudaGo } from "./kudago.js";
import { fetchFromYandexAfisha } from "./yandex-afisha.js";
import { fetchFromTicketland } from "./ticketland.js";
import { fetchFromKassir } from "./kassir.js";
import { dedupeByKey } from "../utils.js";

export async function aggregateAll({ city = "moscow", noCache = false } = {}) {
  const tasks = [
    fetchFromKudaGo({ city, noCache }),
    fetchFromYandexAfisha({ city, noCache }),
    fetchFromTicketland({ city, noCache }),
    fetchFromKassir({ city, noCache })
  ];

  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap(s => (s.status === "fulfilled" ? s.value : []));

  const keyOf = (e) =>
    `${(e.title||"").toLowerCase()}|${(e.venue?.name||"").toLowerCase()}|${(e.dateStart||"").slice(0,10)}`;

  return dedupeByKey(all, keyOf);
}
