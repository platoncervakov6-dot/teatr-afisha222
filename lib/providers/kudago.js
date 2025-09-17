// lib/providers/kudago.js
import { mapCategoryRu, normalizeText } from "../utils";

/**
 * Реальные события из KudaGo (Москва).
 * Кэшируется на 15 мин, можно форсить refresh=1.
 */
export async function fetchFromKudaGo({ city = "moscow", noCache = false } = {}) {
  const base = "https://kudago.com/public-api/v1.4/events/";
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    location: "msk",
    page_size: "100",
    fields: "id,dates,title,place,description,site_url,images,price,categories,age_restriction",
    expand: "place,dates",
    actual_since: String(now - 3600),
    order_by: "dates",
    text_format: "text"
  });

  const out = [];
  let url = `${base}?${params.toString()}`;
  let guard = 0;

  while (url && guard < 10) {
    const res = await fetch(url, {
      cache: noCache ? "no-store" : "force-cache",
      next: { revalidate: noCache ? 0 : 900 }
    });
    if (!res.ok) break;

    const data = await res.json().catch(() => null);
    if (!data) break;

    const items = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    for (const it of items) {
      const dates = Array.isArray(it.dates) ? it.dates : [];
      const firstDate = dates[0] || {};
      const ts = firstDate.start || firstDate.date || firstDate.start_date || firstDate;
      const dateISO = toISO(ts);

      const venue = it.place || {};
      const cats = Array.isArray(it.categories) ? it.categories : [];
      const catsRu = cats.map(mapCategoryRu).filter(Boolean);

      out.push({
        id: `kudago:${it.id}`,
        source: "kudago",
        sourceId: String(it.id),
        title: normalizeText(it.title || ""),
        description: normalizeText(it.description || ""),
        dateStart: dateISO,
        dateEnd: dateISO,
        venue: {
          id: venue?.id ? `kudago-place:${venue.id}` : undefined,
          name: venue?.title || venue?.short_title || "",
          address: venue?.address || ""
        },
        citySlug: "moscow",
        categories: catsRu.length ? Array.from(new Set(catsRu)) : ["Театр"],
        siteUrl: it.site_url || "",
        buyUrl: it.site_url || "",
        images: Array.isArray(it.images) ? it.images.map(i => i.image) : [],
        priceFrom: parsePrice(it.price),
        ageRestriction: it.age_restriction || null
      });
    }

    url = data.next || null; // пагинация
    guard++;
  }

  return out.filter(e => e.dateStart);
}

function toISO(v) {
  if (!v) return null;
  if (typeof v === "number") {
    try { return new Date(v * 1000).toISOString(); } catch { return null; }
  }
  const n = Number(v);
  if (!Number.isNaN(n) && n > 1000000000) {
    try { return new Date(n * 1000).toISOString(); } catch { return null; }
  }
  try { return new Date(v).toISOString(); } catch { return null; }
}

function parsePrice(str) {
  if (!str) return null;
  const m = String(str).match(/\d[\d\s]*/g);
  if (!m) return null;
  const nums = m.map(s => Number(s.replace(/\s/g, ""))).filter(n => !isNaN(n));
  if (!nums.length) return null;
  return Math.min(...nums);
}

