// app/api/events/route.js
export const dynamic = "force-dynamic"; // чтобы не пытался пререндерить

import { aggregateAll } from "../../../lib/providers/index.js";

export async function GET(req) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || 0);
  const type = (url.searchParams.get("type") || "").trim().toLowerCase();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  let list = await aggregateAll({ noCache: true });

  if (type) list = list.filter(e => (e.categories || []).some(c => c.toLowerCase() === type));
  if (q) {
    const hit = s => String(s || "").toLowerCase().includes(q);
    list = list.filter(e => hit(e.title) || hit(e.venue?.name) || hit(e.description) || (e.categories || []).some(hit));
  }

  list.sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
  if (limit > 0) list = list.slice(0, limit);

  return Response.json(
    { events: list },
    { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" } }
  );
}
