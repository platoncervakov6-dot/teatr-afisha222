export default function ChipBar() {
  const chips = ["Все", "Балет", "Опера", "Драма", "Театр"];
  return (
    <div className="row" style={{ overflowX: "auto", paddingBottom: 6 }}>
      {chips.map((c) => (
        <span className="chip" key={c}>{c}</span>
      ))}
    </div>
  );
}
