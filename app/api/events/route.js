export const runtime = 'edge'; // быстрый старт, можно убрать для node

// ====== НАСТРОЙКИ КЭША ======
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут
const KV_KEY = 'events_cache_v1';

// Глобальный "процессный" кэш (живёт, пока живёт инстанс)
const mem = globalThis.__AFISHA_CACHE__ ||= { data: null, ts: 0 };

// --- если подключишь Vercel KV, раскомментируй эту функцию и ENV внизу ---
// async function kvGetSet(newData) {
//   const url = process.env.KV_REST_API_URL;
//   const token = process.env.KV_REST_API_TOKEN;
//   if (!url || !token) return null;
//   const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
//   if (newData === undefined) {
//     const res = await fetch(`${url}/get/${KV_KEY}`, { headers, cache: 'no-store' });
//     if (!res.ok) return null;
//     const txt = await res.text();
//     return txt ? JSON.parse(txt) : null;
//   } else {
//     await fetch(`${url}/set/${KV_KEY}`, {
//       method: 'POST',
//       headers,
//       body: JSON.stringify(newData)
//     });
//     return newData;
//   }
// }

// ====== УТИЛИТЫ ======
function toISO(x) {
  try { return new Date(x).toISOString(); } catch { return null; }
}
function normalize(e = {}) {
  return {
    id: String(e.id ?? e.sourceId ?? Math.random().toString(36).slice(2)),
    source: e.source || 'unknown',
    sourceId: e.sourceId ?? null,
    title: e.title ?? '',
    description: e.description ?? '',
    dateStart: e.dateStart ? toISO(e.dateStart) : null,
    dateEnd: e.dateEnd ? toISO(e.dateEnd) : null,
    venue: e.venue || null,                 // {name, address}
    citySlug: e.citySlug || 'moscow',
    categories: Array.isArray(e.categories) ? e.categories : [],
    siteUrl: e.siteUrl || null,
    buyUrl: e.buyUrl || null,
    images: Array.isArray(e.images) ? e.images : [],
    priceFrom: e.priceFrom ?? null,
    ageRestriction: e.ageRestriction ?? null,
    updatedAt: Date.now()
  };
}
function sortByDate(a, b) {
  const ax = a.dateStart ? Date.parse(a.dateStart) : Infinity;
  const bx = b.dateStart ? Date.parse(b.dateStart) : Infinity;
  return ax - bx;
}

// ====== ПРОВАЙДЕРЫ (минимально рабочие) ======
// 1) KudaGo — берём публичный JSON API (Москва, театр/опера/балет/драма) — можно расширять фильтры.
async function fromKudaGo(limit = 100) {
  const categories = ['theatre', 'opera', 'ballet']; // базовые жанры
  const url = `https://kudago.com/public-api/v1.4/events/?lang=ru&fields=id,dates,title,description,place,site_url,images,price,is_free&expand=place,dates&location=msk&text_format=text&categories=${categories.join(',')}&page_size=${limit}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.results) ? data.results : [];
    return list.map((x) => normalize({
      id: x.id,
      source: 'kudago',
      sourceId: x.id,
      title: x.title,
      description: x.description,
      dateStart: x.dates?.[0]?.start ? x.dates[0].start * 1000 : null,
      dateEnd: x.dates?.[0]?.end ? x.dates[0].end * 1000 : null,
      venue: x.place ? { name: x.place.title, address: x.place.address } : null,
      citySlug: 'moscow',
      categories: x.categories || ['theatre'],
      siteUrl: x.site_url,
      buyUrl: x.site_url,
      images: (x.images || []).map((i) => i.image),
      priceFrom: x.is_free ? 0 : null
    }));
  } catch {
    return [];
  }
}

// 2) Заглушки под остальные источники (потом допишем)
async function fromYandexAfisha() { return []; }
async function fromTicketland()   { return []; }
async function fromKassir()       { return []; }

// Сборка всех источников
async function collectAll(limit = 300) {
  const chunks = await Promise.all([
    fromKudaGo(Math.min(200, limit)),
    fromYandexAfisha(),
    fromTicketland(),
    fromKassir()
  ]);
  const all = chunks.flat().filter(Boolean);
  // уникаем по id
  const map = new Map();
  for (const e of all) map.set(e.id, e);
  return Array.from(map.values()).sort(sortByDate);
}

// ====== API ======
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('refresh') === '1';
  const limit = Math.max(1, Math.min(1000, Number(searchParams.get('limit')) || 300));

  // 1) KV (если подключено)
  // let kvData = null;
  // if (!force) {
  //   kvData = await kvGetSet(undefined);
  //   if (kvData?.events?.length && (Date.now() - (kvData.updatedAt || 0) < CACHE_TTL_MS)) {
  //     return Response.json({ events: kvData.events.slice(0, limit), updatedAt: kvData.updatedAt }, {
  //       headers: corsHeaders()
  //     });
  //   }
  // }

  // 2) process memory cache
  const freshMem = Date.now() - mem.ts < CACHE_TTL_MS;
  if (!force && mem.data && freshMem) {
    return Response.json({ events: mem.data.slice(0, limit), updatedAt: mem.ts }, {
      headers: corsHeaders()
    });
  }

  // 3) собираем заново
  const events = await collectAll(limit);
  mem.data = events;
  mem.ts = Date.now();

  // если KV подключено — запишем
  // await kvGetSet({ events, updatedAt: mem.ts });

  return Response.json({ events: events.slice(0, limit), updatedAt: mem.ts }, {
    headers: corsHeaders()
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}
