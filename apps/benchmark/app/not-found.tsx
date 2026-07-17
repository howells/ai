import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-state">
      <p className="eyebrow">Not found</p>
      <h1>This benchmark view does not exist</h1>
      <Link className="button button--primary" href="/">
        Open Rigorous
      </Link>
    </main>
  );
}
