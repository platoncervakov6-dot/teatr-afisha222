// lib/providers/yandex-afisha.js
import { normalizeText } from "../utils.js";

export async function fetchFromYandexAfisha({ city = "moscow", noCache = false } = {}) {
  const pages = [
    "https://afisha.yandex.ru/moscow",
    "https://afisha.yandex.ru/moscow/theatre",
    "https://afisha.yandex.ru/moscow/opera",
    "https://afisha.yandex.ru/moscow/ballet"
  ];
  const out = [];
  for (const url of pages) {
    const html = await safeFetchText(url, noCache);
    if (!html) continue;
    const blocks = extractJsonLd(html);
    for (const node of blocks) {
      const events = flattenEvents(node);
      for (const ev of events) {
        const mapped = mapJsonLdEvent(ev);
        if (mapped && looksLikeMoscow(mapped)) out.push(mapped);
      }
    }
  }
  return dedupe(out);
}

function looksLikeMoscow(ev) {
  const city = [ev?.venue?.address, ev?.venue?.city, ev?.venue?.name].join(" ").toLowerCase();
  return /(москва|moscow|msk)/i.test(city);
}

function mapJsonLdEvent(obj) {
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
    const price =
      toNum(offers?.lowPrice) ?? toNum(offers?.price) ?? null;

    const cats = guessCategories(name, obj);

    return {
      id: `yandex:${hash(url || name + startDate)}`,
      source: "yandex-afisha",
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
      siteUrl: url || "https://afisha.yandex.ru/moscow",
      buyUrl: (offers && offers.url) ? offers.url : (url || "https://afisha.yandex.ru/moscow"),
      images: toArr(obj.image).map(s => (typeof s === "string" ? s : s?.url)).filter(Boolean),
      priceFrom: price,
      ageRestriction: obj?.typicalAgeRange || obj?.ageRequirement || null
    };
  } catch { return null; }
}

function guessCategories(name, obj) {
  const s = `${name} ${JSON.stringify(obj || {})}`.toLowerCase();
  const set = new Set();
  if (/(опера|opera)/.test(s)) set.add("Опера");
  if (/(балет|ballet)/.test(s)) set.add("Балет");
  if (/(драма)/.test(s)) set.add("Драма");
  if (/(театр|театра|theatre|theater)/.test(s)) set.add("Театр");
  return [...set];
}

async function safeFetchText(url, noCache) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      cache: noCache ? "no-store" : "force-cache",
      next: { revalidate: noCache ? 0 : 900 }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36";
function extractJsonLd(html){ const re=/<script[^>]+type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi; const arr=[]; let m; while((m=re.exec(html))){ const raw=m[1].trim(); try{ arr.push(JSON.parse(unescapeHtml(raw))); }catch{ for(const p of splitMulti(raw)){ try{ arr.push(JSON.parse(unescapeHtml(p))); }catch{}} } } return arr; }
function flattenEvents(n){ const out=[]; const w=(x)=>{ if(!x)return; if(Array.isArray(x)) x.forEach(w); else if(typeof x==="object"){ const t=String(x["@type"]||x.type||"").toLowerCase(); if(t.includes("event")) out.push(x); Object.values(x).forEach(w);} }; w(n); return out; }
function toISO(v){ if(!v) return null; try{ return new Date(v).toISOString(); }catch{ return null; } }
function toNum(v){ if(v==null) return null; const n=Number(String(v).replace(/\\s+/g,"").replace(",", ".")); return isFinite(n)?n:null; }
function toArr(v){ return Array.isArray(v)?v:(v?[v]:[]); }
function unescapeHtml(s){ return s.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
function splitMulti(s){ const out=[]; let d=0,st=-1; for(let i=0;i<s.length;i++){ const ch=s[i]; if(ch==="{"){ if(d===0)st=i; d++; } else if(ch==="}"){ d--; if(d===0&&st>=0){ out.push(s.slice(st,i+1)); st=-1; } } } return out; }
function hash(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; } return String(h>>>0); }
function dedupe(list){ const seen=new Set(), out=[]; for(const e of list){ const k=`${e.title}|${e.venue?.name}|${(e.dateStart||"").slice(0,10)}`.toLowerCase(); if(seen.has(k)) continue; seen.add(k); out.push(e);} return out;}
