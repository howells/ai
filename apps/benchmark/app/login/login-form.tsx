"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({ secret: form.get("secret") }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Too many attempts. Try again later."
            : "That secret is not valid.",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("The sign-in service could not be reached. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="shared-secret">Shared secret</label>
      <input
        autoComplete="current-password"
        id="shared-secret"
        name="secret"
        required
        type="password"
      />
      {error ? <p role="alert">{error}</p> : null}
      <button disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
