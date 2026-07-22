import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

test("magic-link sign-in lands on the authenticated studio", async ({ page }) => {
  await login(page);
  // The Publish button only exists behind the auth gate, on the studio.
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
});

test("an unauthenticated visit to the studio is redirected to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
