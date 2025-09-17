// app/api/events/route.js
import { aggregateAll } from "@/lib/providers";
import { NextResponse } from "next/server";

export const revalidate = 900; // 15 минут кэш на уровне Next

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const type = (searchParams.get("type") || "").trim().toLowerCase(); // "балет" | "опера" | "драма" | "театр"
  const dateFrom = searchParams.get("date_from"); // ISO
  const dateTo = searchParams.get("date_to");     // ISO
  const limit = Number(searchParams.get("limit") || 0);
  const noCache = searchParams.get("refresh") === "1"; // ?refresh=1 для принудительного обновления

  const events = await aggregateAll({ city: "moscow", noCache });

  // серверные фильтры (клиентские останутся как есть)
  let list = events.filter(ev => ev.citySlug === "moscow");

  if (q) {
    const hit = (s) => String(s || "").toLowerCase().includes(q);
    list = list.filter(ev =>
      hit(ev.title) || hit(ev.venue?.name) || hit(ev.description) ||
      (ev.categories || []).some(hit)
    );
  }

  if (type) {
    list = list.filter(ev =>
      (ev.categories || []).some(c => c.toLowerCase() === type)
    );
  }

  if (dateFrom || dateTo) {
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).getTime() : Number.MAX_SAFE_INTEGER;
    list = list.filter(ev => {
      const t = new Date(ev.dateStart).getTime();
      return t >= from && t <= to;
    });
  }

  // сортировка по дате
  list.sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));

  if (limit > 0) list = list.slice(0, limit);

  return NextResponse.json({ events: list }, { status: 200 });
}
