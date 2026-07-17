"use client";

export default function BenchmarkLoadError({ reset }: { reset: () => void }) {
  return (
    <main className="route-state">
      <p className="eyebrow">Workspace unavailable</p>
      <h1>The benchmark could not load</h1>
      <p>Check the database and server configuration, then retry.</p>
      <button className="button button--primary" onClick={reset} type="button">
        Retry
      </button>
    </main>
  );
}
