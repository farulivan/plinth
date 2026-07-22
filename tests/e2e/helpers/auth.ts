import { expect, type Page } from "@playwright/test";
import { latestMagicLinkToken } from "./db";

/** The seeded dev account (scripts/seed.ts). */
export const SEED_EMAIL = "dev@plinth.local";

/**
 * Sign in the real way — submit the magic-link form, then follow the link the
 * way a click would, except the token comes from the database instead of an
 * inbox (see latestMagicLinkToken). Leaves the page authenticated on the
 * studio. This exercises the whole ADR-0005 chain: form → Better Auth handler
 * → verification row → session cookie → the authed layout.
 */
export async function login(page: Page, email: string = SEED_EMAIL): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();

  // The confirmation state means the sign-in POST resolved and the
  // verification row is committed — safe to read the token now.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const token = await latestMagicLinkToken();
  const verifyUrl = `/api/auth/magic-link/verify?token=${token}&callbackURL=/`;
  await page.goto(verifyUrl);

  // Verifying redirects to "/" (the studio); the login route is behind us.
  await expect(page).not.toHaveURL(/\/login/);
}
