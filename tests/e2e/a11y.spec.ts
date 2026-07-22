import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

// The gate is WCAG 2.1 A/AA — the conformance bar Plinth commits to, not the
// broader best-practice rules axe also ships (those stay advisory).
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("the login page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("the studio has no WCAG A/AA violations", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(WCAG)
    // The preview iframe renders tenant content with its own CSP and a11y
    // story (ADR-0007) — out of scope for the dashboard's own gate.
    .exclude("iframe")
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
