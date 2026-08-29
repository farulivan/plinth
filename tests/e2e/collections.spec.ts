import { expect, test } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * The collection loop end to end: add an entry, name it, watch the preview
 * follow it to a path that did not exist a moment ago.
 *
 * Worth an e2e rather than a unit test because the parts that break here are
 * the seams between them — the editor deriving a path from a slug, the preview
 * route resolving that path against the draft, and the detail component being
 * asked to render an entry that is still empty. Each is correct alone.
 */
test("adding a project gives it a route the preview follows", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Add project" }).click();

  // Created parked and at a free slug, so it can neither collide nor appear on
  // the live site before anyone has typed into it.
  const slug = page.getByLabel("Slug");
  await expect(slug).toHaveValue(/untitled-\d+/);

  const value = `salt-house-${Date.now().toString(36)}`;
  await slug.fill(value);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // The path shown in the route settings bar is the one the build will emit.
  await expect(page.getByText(`/projects/${value}/`)).toBeVisible();

  // The preview iframe follows the open route. An empty entry renders the
  // placeholder rather than throwing — which is the state every entry is in
  // for the first few seconds of its life.
  const preview = page.frameLocator("iframe");
  await expect(preview.locator("[data-entry-invalid='projects']")).toBeVisible();

  // And it survives a reload, which is the proof the entry reached Postgres
  // rather than living in client state — the outline rail lists it.
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Content outline" }).getByRole("button", {
      name: value,
      exact: true,
    }),
  ).toBeVisible();
});
