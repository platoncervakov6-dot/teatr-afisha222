// lib/providers/index.js
// Единый агрегатор без внешних импортов. Работает на Node runtime Vercel.

export async function aggregateAll({ noCache = false } = {}) {
  const tasks = [
    fetchFromKudaGo({ noCache }),
    fetchFromYandexAfisha({ noCache }),
    fetchFromTicketland({ noCache }),
    fetchFromKassir({ noCache }),
  ];

  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap(s => (s.status === "fulfilled" ? s.value : []));

  // дедуп: title + venue + день
  const seen = new Set();
  const out = [];
  for (const e of all) {
    const k = `${(e.title || "").toLowerCase()}|${(e.venue?.name || "").toLowerCase()}|${(e.dateStart || "").slice(0, 10)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  // только Москва и валидная дата
  return out.filter(e => e.citySlug === "moscow" && e.dateStart);
}

/* -------------------- KudaGo -------------------- */
async function fetchFromKudaGo({ noCache = false } = {}) {
  const base = "https://kudago.com/public-api/v1.4/events/";
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    location: "msk",
    page_size: "100",
    fields: "id,dates,title,place,description,site_url,images,price,categories,age_restriction",
    expand: "place,dates",
    actual_since: String(now - 3600),
    order_by: "dates",
    text_format: "text",
  });

  const out = [];
  let url = `${base}?${params.toString()}`;
  let guard = 0;

  while (url && guard < 10) {
    const res = await fetch(url, { cache: noCache ? "no-store" : "reload" });
    if (!res.ok) break;
    const data = await res.json().catch(() => null);
    if (!data) break;

    const items = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    for (const it of items) {
      const dates = Array.isArray(it.dates) ? it.dates : [];
      const first = dates[0] || {};
      const ts = first.start || first.date || first.start_date || first;
      const dateISO = toISO(ts);
      const venue = it.place || {};
      const cats = Array.isArray(it.categories) ? it.categories : [];
      const catsRu = Array.from(new Set(cats.map(mapCategoryRu).filter(Boolean)));

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
          address: venue?.address || "",
        },
        citySlug: "moscow",
        categories: catsRu.length ? catsRu : ["Театр"],
        siteUrl: it.site_url || "",
        buyUrl: it.site_url || "",
        images: Array.isArray(it.images) ? it.images.map(i => i.image) : [],
        priceFrom: parsePrice(it.price),
        ageRestriction: it.age_restriction || null,
      });
    }

    url = data.next || null;
    guard++;
  }

  return out.filter(e => e.dateStart);
}

function parsePrice(str) {
  if (!str) return null;
  const m = String(str).match(/\d[\d\s]*/g);
  if (!m) return null;
  const nums = m.map(s => Number(s.replace(/\s/g, ""))).filter(n => !isNaN(n));
  return nums.length ? Math.min(...nums) : null;
}

/* -------------- Общий скрейп JSON-LD -------------- */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36";

async function fetchHtml(url, noCache) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml" },
      cache: noCache ? "no-store" : "reload",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractJsonLd(html) {
  // ВНИМАНИЕ: именно литерал /.../gi, а не строка — чтобы не было экранирования бэкслешей
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      blocks.push(JSON.parse(unescapeHtml(raw)));
    } catch {
      for (const p of splitMultiJson(raw)) {
        try { blocks.push(JSON.parse(unescapeHtml(p))); } catch {}
      }
    }
  }
  return blocks;
}

function flattenEvents(node) {
  if (!node) return [];
  const arr = [];
  const walk = (x) => {
    if (!x) return;
    if (Array.isArray(x)) x.forEach(walk);
    else if (typeof x === "object") {
      const t = String(x["@type"] || x.type || "").toLowerCase();
      if (t.includes("event")) arr.push(x);
      Object.values(x).forEach(walk);
    }
  };
  walk(node);
  return arr;
}

function mapJsonLdEvent(obj, { fallbackBase, source }) {
  try {
    const t = String(obj["@type"] || obj.type || "").toLowerCase();
    if (!t.includes("event")) return null;

    const url = obj.url || obj["@id"] || "";
    const name = normalizeText(obj.name || obj.headline || "");
    const startDate = toISO(obj.startDate || obj.start_time || obj.start || obj.datePublished);
    if (!name || !startDate) return null;

    const location = obj.location || {};
    const address = location.address || {};
    const offers = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers || {};
    const price = toNum(offers?.lowPrice ?? offers?.price);

    const cats = guessCategories(name, obj);

    return {
      id: `${source}:${hash(url || name + startDate)}`,
      source,
      sourceId: url || name,
      title: name,
      description: normalizeText(obj.description || ""),
      dateStart: startDate,
      dateEnd: toISO(obj.endDate) || startDate,
      venue: {
        name: location.name || "",
        address: address?.streetAddress || address?.addressLocality || "",
      },
      citySlug: "moscow",
      categories: cats.length ? cats : ["Театр"],
      siteUrl: url || fallbackBase,
      buyUrl: (offers && offers.url) ? offers.url : (url || fallbackBase),
      images: toArr(obj.image).map(s => (typeof s === "string" ? s : s?.url)).filter(Boolean),
      priceFrom: price,
      ageRestriction: obj?.typicalAgeRange || obj?.ageRequirement || null,
    };
  } catch {
    return null;
  }
}

function guessCategories(name, obj) {
  const s = `${name} ${JSON.stringify(obj || {})}`.toLowerCase();
  const set = new Set();
  if (/(опера|opera)/.test(s)) set.add("Опера");
  if (/(балет|balet|ballet)/.test(s)) set.add("Балет");
  if (/(драма)/.test(s)) set.add("Драма");
  if (/(театр|театра|theatre|theater)/.test(s)) set.add("Театр");
  return [...set];
}

function looksLikeMoscow(ev) {
  const city = [ev?.venue?.address, ev?.venue?.city, ev?.venue?.name].join(" ").toLowerCase();
  return /(москва|moscow|msk)/i.test(city);
}

function toISO(v) { if (!v) return null; try { return new Date(v).toISOString(); } catch { return null; } }
function toArr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
function toNum(v) { if (v == null) return null; const n = Number(String(v).replace(/\s+/g, "").replace(",", ".")); return isFinite(n) ? n : null; }
function unescapeHtml(s){ return s.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
function splitMultiJson(s){ const out=[]; let d=0,st=-1; for(let i=0;i<s.length;i++){ const ch=s[i]; if(ch==="{"){ if(d===0)st=i; d++; } else if(ch==="}"){ d--; if(d===0&&st>=0){ out.push(s.slice(st,i+1)); st=-1; } } } return out; }
function hash(str){ let h=0; for (let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; } return String(h>>>0); }
function normalizeText(s){ return String(s||"").replace(/\s+/g," ").replace(/&nbsp;/g," ").trim(); }
function mapCategoryRu(c){ const v=String(c||"").toLowerCase(); if(v==="opera")return "Опера"; if(v==="ballet")return "Балет"; if(v==="drama")return "Драма"; if(v==="theatre"||v==="theater")return "Театр"; return null; }

/* -------------------- JSON-LD провайдеры -------------------- */
async function fetchFromYandexAfisha({ noCache = false } = {}) {
  const pages = [
    "https://afisha.yandex.ru/moscow",
    "https://afisha.yandex.ru/moscow/theatre",
    "https://afisha.yandex.ru/moscow/opera",
    "https://afisha.yandex.ru/moscow/ballet",
  ];
  const out = [];
  for (const url of pages) {
    const html = await fetchHtml(url, noCache);
    if (!html) continue;
    const blocks = extractJsonLd(html);
    for (const node of blocks) {
      for (const ev of flattenEvents(node)) {
        const m = mapJsonLdEvent(ev, { fallbackBase: "https://afisha.yandex.ru/moscow", source: "yandex-afisha" });
        if (m && looksLikeMoscow(m)) out.push(m);
      }
    }
  }
  return out;
}

async function fetchFromTicketland({ noCache = false } = {}) {
  const pages = [
    "https://www.ticketland.ru/msk/",
    "https://www.ticketland.ru/msk/teatr/",
    "https://www.ticketland.ru/msk/balet/",
    "https://www.ticketland.ru/msk/opera/",
  ];
  const out = [];
  for (const url of pages) {
    const html = await fetchHtml(url, noCache);
    if (!html) continue;
    const blocks = extractJsonLd(html);
    for (const node of blocks) {
      for (const ev of flattenEvents(node)) {
        const m = mapJsonLdEvent(ev, { fallbackBase: "https://www.ticketland.ru/msk/", source: "ticketland" });
        if (m && looksLikeMoscow(m)) out.push(m);
      }
    }
  }
  return out;
}

async function fetchFromKassir({ noCache = false } = {}) {
  const pages = [
    "https://msk.kassir.ru/teatr",
    "https://msk.kassir.ru/teatr/balet",
    "https://msk.kassir.ru/teatr/opera",
  ];
  const out = [];
  for (const url of pages) {
    const html = await fetchHtml(url, noCache);
    if (!html) continue;
    const blocks = extractJsonLd(html);
    for (const node of blocks) {
      for (const ev of flattenEvents(node)) {
        const m = mapJsonLdEvent(ev, { fallbackBase: "https://msk.kassir.ru/teatr", source: "kassir" });
        if (m && looksLikeMoscow(m)) out.push(m);
      }
    }
  }
  return out;
}
