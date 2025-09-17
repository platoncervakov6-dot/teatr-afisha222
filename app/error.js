'use client';

export default function Error({ error, reset }) {
  console.error(error);
  return (
    <div className="empty">
      Что-то пошло не так.
      <div style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => reset()}>Попробовать снова</button>
      </div>
    </div>
  );
}
