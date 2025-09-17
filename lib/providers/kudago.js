// lib/providers/kudago.js
import { mapCategoryRu, normalizeText } from "../utils";

/**
 * Тянем реальные события из KudaGo (публичный API).
 * Документация меняется, поэтому используем максимально «толстые» поля и
 * безопасный парсинг. Фильтрация по Москве — через location=msk.
 */
export async function fetchFromKudaGo({ city = "moscow", noCache = false } = {}) {
  // KudaGo использует slug "msk" для Москвы
  const base = "https://kudago.com/public-api/v1.4/events/";
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    location: "msk",
    page_size: "100",
    // запрашиваем побольше полей, часть может отсутствовать
    fields: "id,dates,title,place,description,site_url,images,price,categories,age_restriction",
    expand: "place,dates",
    actual_since: String(now - 3600),      // от часа назад
    order_by: "dates",
    text_format: "text"
  });

  const out = [];
  let url = `${base}?${params.toString()}`;
  let guard = 0;

  while (url && guard < 10) {
    const res = await fetch(url, {
      // кэш на уровне Next; при ?refresh=1 будет no-store через флаг
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
      const title = it.title || "";

      const cats = Array.isArray(it.categories) ? it.categories : [];
      const catsRu = cats.map(mapCategoryRu);
      // базовая классификация: театр/опера/балет/драма
      const normalizedCats = Array.from(new Set(catsRu.filter(Boolean)));

      out.push({
        id: `kudago:${it.id}`,
        source: "kudago",
        sourceId: String(it.id),
        title: normalizeText(title),
        description: normalizeText(it.description || ""),
        dateStart: dateISO,
        dateEnd: dateISO,
        venue: {
          id: venue?.id ? `kudago-place:${venue.id}` : undefined,
          name: venue?.title || venue?.short_title || "",
          address: venue?.address || ""
        },
        citySlug: "moscow",
        categories: normalizedCats.length ? normalizedCats : ["Театр"],
        siteUrl: it.site_url || "",
        buyUrl: it.site_url || "",
        images: Array.isArray(it.images) ? it.images.map(i => i.image) : [],
        priceFrom: parsePrice(it.price),
        ageRestriction: it.age_restriction || null
      });
    }

    // пагинация KudaGo: data.next может быть абсолютным URL
    url = data.next || null;
    guard++;
  }

  return out.filter(e => e.dateStart); // только с датой
}

function toISO(v) {
  if (!v) return null;
  // KudaGo иногда отдаёт unix (секунды) или ISO/строки
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
  // ищем минимальную цифру в строке
  const m = String(str).match(/\d[\d\s]*/g);
  if (!m) return null;
  const nums = m.map(s => Number(s.replace(/\s/g, ""))).filter(n => !isNaN(n));
  if (!nums.length) return null;
  return Math.min(...nums);
}
