import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">Private workspace</p>
        <h1 id="login-title">Howells AI Benchmark</h1>
        <p>Sign in before using provider credentials or viewing benchmark history.</p>
        <LoginForm />
      </section>
    </main>
  );
}
