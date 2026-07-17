export default function Loading() {
  return (
    <main className="route-state" aria-busy="true">
      <p className="eyebrow">Private benchmark</p>
      <h1>Loading the benchmark workspace…</h1>
      <div className="route-state__skeleton" />
    </main>
  );
}
