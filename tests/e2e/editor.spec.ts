import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

test("editing a field autosaves and survives a reload", async ({ page }) => {
  await login(page);

  const field = page.getByRole("textbox").first();
  await expect(field).toBeVisible();

  const value = `E2E edit ${Date.now()}`;
  await field.fill(value);

  // Autosave is debounced (500 ms) then persists through the RLS-scoped
  // Server Action; the status chip flips to "Saved" once the write lands.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Reload re-reads the draft from the database — proof the edit was persisted,
  // not just held in the client.
  await page.reload();
  await expect(page.getByRole("textbox").first()).toHaveValue(value);
});

/**
 * The home page's preview, which is the first thing every author sees.
 *
 * A required catch-all matches one segment or more, so `/preview/{id}/p` —
 * what the home page produces — matched no route and the panel said "page not
 * found". Every other page worked, which is why the collections test passed
 * while this was broken: it opens an entry, never the root.
 */
test("the preview renders the home page, not just the interior ones", async ({ page }) => {
  await login(page);

  const preview = page.frameLocator("iframe[title='Live preview']");
  await expect(preview.locator("main#main")).toBeVisible();
  await expect(preview.getByText("Page not found")).toHaveCount(0);
});
