"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <button className="button button--quiet" onClick={logout} type="button">
      Sign out
    </button>
  );
}
