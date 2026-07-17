import { expect, test } from "@playwright/test";

test("login is keyboard accessible and does not expose benchmark data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Howells AI Benchmark" })).toBeVisible();
  await expect(page.getByLabel("Shared secret")).toHaveAttribute("type", "password");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Shared secret")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("sandbox permanently redirects through the authenticated Explore boundary", async () => {
  const response = await fetch("http://127.0.0.1:23010/sandbox", { redirect: "manual" });
  expect(response.status).toBe(308);
  expect(new URL(response.headers.get("location") ?? "http://invalid").pathname).toBe("/explore");
});

test("protected modes redirect unauthenticated visitors", async ({ page }) => {
  await page.goto("/explore");
  await expect(page).toHaveURL(/\/login$/);
});
