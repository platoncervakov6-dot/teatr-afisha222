// app/api/events/route.js

// Переводим на Node.js-рантайм для стабильности и логов
export const runtime = 'nodejs';

// ====== НАСТРОЙКИ КЭША ======
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут
const mem = globalThis.__AFISHA_CACHE__ ||= { data: null, ts: 0 };

// ====== УТИЛИТЫ ======
function toISO(x) { try { return new Date(x).toISOString(); } catch { return null; } }
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

async function fetchJSON(url, { timeout = 10000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'accept': 'application/json',
        // многие источники не любят пустой UA
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
        ...headers,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('Upstream not ok:', res.status, url);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (e) {
    console.warn('Upstream fetch failed:', e?.name || e, url);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ====== ПРОВАЙДЕРЫ ======

// 1) KudaGo (Москва). Берём базовые жанры, простой URL.
async function fromKudaGo(limit = 100) {
  const cats = ['theatre', 'opera', 'ballet'];
  const url =
    'https://kudago.com/public-api/v1.4/events/?' +
    new URLSearchParams({
      lang: 'ru',
      location: 'msk',
      categories: cats.join(','),
      page_size: String(Math.min(limit, 200)),
      fields:
        'id,dates,title,description,place,site_url,images,price,is_free,categories',
      expand: 'place,dates',
      text_format: 'text',
    }).toString();

  const data = await fetchJSON(url);
  const list = Array.isArray(data?.results) ? data.results : [];
  return list.map((x) =>
    normalize({
      id: x.id,
      source: 'kudago',
      sourceId: x.id,
      title: x.title,
      description: x.description,
      dateStart: x.dates?.[0]?.start ? x.dates[0].start * 1000 : null,
      dateEnd: x.dates?.[0]?.end ? x.dates[0].end * 1000 : null,
      venue: x.place ? { name: x.place.title, address: x.place.address } : null,
      citySlug: 'moscow',
      categories: Array.isArray(x.categories) ? x.categories : ['theatre'],
      siteUrl: x.site_url || null,
      buyUrl: x.site_url || null,
      images: Array.isArray(x.images) ? x.images.map((i) => i.image) : [],
      priceFrom: x.is_free ? 0 : null,
    })
  );
}

// Заглушки под остальные источники (добавим позже)
async function fromYandexAfisha() { return []; }
async function fromTicketland()   { return []; }
async function fromKassir()       { return []; }

// Сборка всех источников
async function collectAll(limit = 300) {
  const chunks = await Promise.all([
    fromKudaGo(Math.min(200, limit)),
    fromYandexAfisha(),
    fromTicketland(),
    fromKassir(),
  ]);
  const all = chunks.flat().filter(Boolean);
  const map = new Map();
  for (const e of all) map.set(e.id, e);
  return Array.from(map.values()).sort(sortByDate);
}

// ====== API ======
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('refresh') === '1';
  const limit = Math.max(1, Math.min(1000, Number(searchParams.get('limit')) || 300));

  // Кэш в памяти процесса
  const freshMem = Date.now() - mem.ts < CACHE_TTL_MS;
  if (!force && mem.data && freshMem) {
    return Response.json(
      { events: mem.data.slice(0, limit), updatedAt: mem.ts },
      { headers: corsHeaders() }
    );
  }

  // Собираем заново
  const events = await collectAll(limit);
  mem.data = events;
  mem.ts = Date.now();

  return Response.json(
    { events: events.slice(0, limit), updatedAt: mem.ts },
    { headers: corsHeaders() }
  );
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}
export function OPTIONS() {
  return new Response(null, { headers: corsHeaders() });
}
