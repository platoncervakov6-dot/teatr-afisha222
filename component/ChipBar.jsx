'use client';

export default function ChipBar({ categories, current, onChange }){
  return (
    <div className="chipbar">
      {categories.map(cat => (
        <button key={cat} className={"chip" + (current === cat ? " active" : "")} onClick={() => onChange(cat)}>
          {cat}
        </button>
      ))}
    </div>
  );
}
