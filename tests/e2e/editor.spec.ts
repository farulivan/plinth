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
