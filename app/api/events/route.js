// app/api/events/route.js
// Next.js App Router API — серверная функция (runtime: nodejs для fetch к внешним API)

export const runtime = 'nodejs';

const CACHE_TTL_MS = 15 * 60 * 1000;
const mem = globalThis.__AFISHA_CACHE__ ||= { data: null, ts: 0 };

const nowSec = () => Math.floor(Date.now() / 1000);
const toISO  = (x) => { try { return new Date(x).toISOString(); } catch { return null; } };

function normalize(e = {}) {
  return {
    id: String(e.id ?? e.sourceId ?? Math.random().toString(36).slice(2)),
    source: e.source || 'kudago',
    sourceId: e.sourceId ?? null,
    title: e.title ?? '',
    description: e.description ?? '',
    dateStart: e.dateStart ? toISO(e.dateStart) : null,
    dateEnd: e.dateEnd ? toISO(e.dateEnd) : null,
    venue: e.venue || null,
    citySlug: e.citySlug || 'moscow',
    categories: Array.isArray(e.categories) ? e.categories : [],
    siteUrl: e.siteUrl || null,
    buyUrl: e.buyUrl || null,
    images: Array.isArray(e.images) ? e.images : [],
    priceFrom: e.priceFrom ?? null,
    ageRestriction: e.ageRestriction ?? null,
    updatedAt: Date.now(),
  };
}

function sortByDate(a, b) {
  const ax = a.dateStart ? Date.parse(a.dateStart) : Infinity;
  const bx = b.dateStart ? Date.parse(b.dateStart) : Infinity;
  return ax - bx;
}

async function fetchJSON(url, { timeout = 15000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
        ...headers,
      },
    });
    const textCT = res.headers.get('content-type') || '';
    if (!res.ok) return { ok: false, status: res.status, data: null, ct: textCT };
    const data = textCT.includes('application/json')
      ? await res.json().catch(() => null)
      : null;
    return { ok: true, status: res.status, data, ct: textCT };
  } catch (e) {
    return { ok: false, status: 0, error: e?.name || String(e), data: null };
  } finally {
    clearTimeout(t);
  }
}

/** Возвращает ближайшую будущую дату из массива `dates` (KudaGo), если она есть */
function pickNextDate(dates) {
  if (!Array.isArray(dates)) return null;
  const now = nowSec();
  const future = dates
    .map(d => ({
      start: typeof d?.start === 'number' ? d.start : null,
      end: typeof d?.end === 'number' ? d.end : null,
    }))
    .filter(d => d.start && d.start >= now)
    .sort((a, b) => a.start - b.start);
  return future[0] || null;
}

/** Грузим страницу KudaGo с фильтрами по окну дат; возвращаем уже нормализованные события */
async function fetchKudaGoPage({ page = 1, pageSize = 100, windowDays = 120, withCategories = true }) {
  const since = nowSec(); // прямо сейчас
  const until = since + windowDays * 24 * 3600;

  const params = new URLSearchParams({
    lang: 'ru',
    location: 'msk',
    page: String(page),
    page_size: String(Math.min(pageSize, 200)),
    actual_since: String(since),
    actual_until: String(until),
    order_by: 'dates',
    text_format: 'text',
    fields: 'id,title,description,place,site_url,images,dates,categories',
    expand: 'place,dates',
  });
  if (withCategories) params.set('categories', ['theatre', 'opera', 'ballet'].join(','));

  const url = `https://kudago.com/public-api/v1.4/events/?${params.toString()}`;
  const { ok, status, data, error } = await fetchJSON(url);

  const rows = Array.isArray(data?.results) ? data.results : [];

  const events = rows.map((x) => {
    // берём ближайшую будущую дату
    const nd = pickNextDate(x.dates);
    if (!nd?.start) return null;

    return normalize({
      id: x.id,
      source: 'kudago',
      sourceId: x.id,
      title: x.title,
      description: x.description,
      dateStart: nd.start * 1000,
      dateEnd: nd.end ? nd.end * 1000 : null,
      venue: x.place ? { name: x.place.title, address: x.place.address } : null,
      citySlug: 'moscow',
      categories: Array.isArray(x.categories) ? x.categories : [],
      siteUrl: x.site_url || null,
      buyUrl: x.site_url || null,
      images: Array.isArray(x.images) ? x.images.map(i => i.image) : [],
    });
  }).filter(Boolean);

  return {
    ok,
    status,
    error,
    url,
    count: events.length,
    next: data?.next || null,
    events,
  };
}

/** Пагинация по KudaGo, пока не соберём лимит/пока есть next */
async function collectFromKudaGo(limit = 300) {
  const out = [];
  let page = 1;
  // Сначала — с категориями
  while (out.length < limit) {
    const { ok, events, next } = await fetchKudaGoPage({ page, withCategories: true });
    if (!ok) break;
    out.push(...events);
    if (!next) break;
    page += 1;
  }
  // Если пусто — пробуем без фильтра категорий (некоторые типы событий странно размечены)
  if (out.length === 0) {
    page = 1;
    while (out.length < limit) {
      const { ok, events, next } = await fetchKudaGoPage({ page, withCategories: false });
      if (!ok) break;
      out.push(...events);
      if (!next) break;
      page += 1;
    }
  }
  // dedupe + сортировка
  const map = new Map();
  for (const e of out) map.set(e.id, e);
  return Array.from(map.values()).sort(sortByDate).slice(0, limit);
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

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const force  = searchParams.get('refresh') === '1';
  const debug  = searchParams.get('debug') === '1';
  const limit  = Math.max(1, Math.min(1000, Number(searchParams.get('limit')) || 300));

  if (debug) {
    // Диагностика: покажем две попытки
    const a = await fetchKudaGoPage({ page: 1, withCategories: true });
    const b = a.count ? a : await fetchKudaGoPage({ page: 1, withCategories: false });
    return Response.json({
      checkedAt: Date.now(),
      tryWithCategories: { url: a.url, ok: a.ok, status: a.status, count: a.count, error: a.error || null },
      tryWithoutCategories: { url: b.url, ok: b.ok, status: b.status, count: b.count, error: b.error || null },
      sampleTitles: (b.events || []).slice(0, 8).map(e => e.title),
    }, { headers: corsHeaders() });
  }

  const freshMem = Date.now() - mem.ts < CACHE_TTL_MS;
  if (!force && mem.data && freshMem) {
    return Response.json({ events: mem.data.slice(0, limit), updatedAt: mem.ts }, { headers: corsHeaders() });
  }

  const events = await collectFromKudaGo(limit);
  mem.data = events;
  mem.ts = Date.now();

  return Response.json({ events: events.slice(0, limit), updatedAt: mem.ts }, { headers: corsHeaders() });
}

