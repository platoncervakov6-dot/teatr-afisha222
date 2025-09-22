// app/api/events/route.js

export const runtime = 'nodejs';

// ===== КЭШ (в памяти процесса) =====
const CACHE_TTL_MS = 15 * 60 * 1000;
const mem = globalThis.__AFISHA_CACHE__ ||= { data: null, ts: 0 };

// ===== УТИЛЫ =====
const nowSec = () => Math.floor(Date.now() / 1000);
const toISO = (x) => { try { return new Date(x).toISOString(); } catch { return null; } };

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

async function fetchJSON(url, { timeout = 12000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        'accept': 'application/json',
        // нормальный UA — некоторые апи без него режут
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
        ...headers,
      },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, data: null };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e?.name || String(e), data: null };
  } finally {
    clearTimeout(t);
  }
}

// ===== KudaGo provider =====
async function fromKudaGo(limit = 120, { withCategories = true } = {}) {
  // Категории для начала (если пусто — попробуем без них)
  const categories = withCategories ? ['theatre', 'opera', 'ballet'] : null;

  const params = new URLSearchParams({
    lang: 'ru',
    location: 'msk',
    page_size: String(Math.min(limit, 200)),
    // берём актуальные/будущие события
    actual_since: String(nowSec() - 3600), // небольшой запас на прошлый час
    order_by: 'dates',
    text_format: 'text',
    fields: 'id,title,description,place,site_url,images,dates,categories',
    expand: 'place,dates',
  });
  if (categories) params.set('categories', categories.join(','));

  const url = `https://kudago.com/public-api/v1.4/events/?${params.toString()}`;
  const { ok, status, data, error } = await fetchJSON(url);

  const results = Array.isArray(data?.results) ? data.results : [];
  const events = results.map((x) =>
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
      categories: Array.isArray(x.categories) ? x.categories : [],
      siteUrl: x.site_url || null,
      buyUrl: x.site_url || null,
      images: Array.isArray(x.images) ? x.images.map((i) => i.image) : [],
    })
  );

  return { ok, status, error, url, count: events.length, events };
}

async function collectAll(limit = 300) {
  // 1. пробуем с категориями
  const first = await fromKudaGo(Math.min(limit, 200), { withCategories: true });
  let events = first.events;

  // 2. если пусто — повторим без фильтра категорий
  if (!events.length) {
    const retry = await fromKudaGo(Math.min(limit, 200), { withCategories: false });
    events = retry.events;
  }

  // TODO: позже подключим ещё источники и сольём
  const map = new Map();
  for (const e of events) map.set(e.id, e);
  return Array.from(map.values()).sort(sortByDate);
}

// ===== CORS =====
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

// ===== API =====
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('refresh') === '1';
  const debug = searchParams.get('debug') === '1';
  const limit = Math.max(1, Math.min(1000, Number(searchParams.get('limit')) || 300));

  // Диагностика: проверим апстрим и вернём краткий отчёт
  if (debug) {
    const a = await fromKudaGo(20, { withCategories: true });
    const b = a.count ? a : await fromKudaGo(20, { withCategories: false });
    return Response.json(
      {
        checkedAt: Date.now(),
        tryWithCategories: { url: a.url, ok: a.ok, status: a.status, count: a.count, error: a.error || null },
        tryWithoutCategories: { url: b.url, ok: b.ok, status: b.status, count: b.count, error: b.error || null },
        sampleTitles: b.events.slice(0, 5).map((e) => e.title),
      },
      { headers: corsHeaders() }
    );
  }

  const freshMem = Date.now() - mem.ts < CACHE_TTL_MS;
  if (!force && mem.data && freshMem) {
    return Response.json(
      { events: mem.data.slice(0, limit), updatedAt: mem.ts },
      { headers: corsHeaders() }
    );
  }

  const events = await collectAll(limit);
  mem.data = events;
  mem.ts = Date.now();

  return Response.json(
    { events: events.slice(0, limit), updatedAt: mem.ts },
    { headers: corsHeaders() }
  );
}

