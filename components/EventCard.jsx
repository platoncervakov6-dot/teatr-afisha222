'use client';

export default function EventCard({ ev }){
  const openExternal = (url) => {
    try { window.Telegram?.WebApp?.openLink(url); }
    catch { window.open(url, "_blank"); }
  };

  return (
    <article className="card" data-id={ev.id}>
      <div className="poster">
        <div className="poster-inner">{ev.posterLabel || ""}</div>
      </div>

      <div className="content">
        <div className="h3">{ev.title}</div>
        <div className="meta">{ev.theatre} • {ev.date}</div>
        <div className="tags">
          {(ev.genres||[]).map(t => <span className="tag" key={t}>{t}</span>)}
        </div>
        <div className="descr">{ev.description || ""}</div>

        <div className="actions">
          <button className="btn primary" onClick={() => openExternal(ev.buyUrl)} dangerouslySetInnerHTML={{__html: iconTicket() + 'Купить билеты'}} />
          <button className="btn ghost" onClick={() => openExternal(ev.siteUrl)} dangerouslySetInnerHTML={{__html: iconLink() + 'Сайт театра'}} />
        </div>
      </div>
    </article>
  );
}

// SVG как строки (для простоты)
function iconTicket(){
  return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M3 9a3 3 0 0 0 3-3h12a3 3 0 0 0 3 3v6a3 3 0 0 0-3 3H6a3 3 0 0 0-3-3Z"></path><path d="M13 5v2"></path><path d="M13 17v2"></path><path d="M13 11v2"></path></svg> ';
}
function iconLink(){
  return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.72-1.71"></path></svg> ';
}
