/**
 * The mobile menu's behaviour, bundled rather than inlined so a page that has
 * no menu open still costs one `getElementById` and stops.
 *
 * Markup-first, like the contact form: the header, the toggle and the overlay
 * are all server-rendered, and this only wires state onto them. Without the
 * script the overlay stays closed and the links in the header are still
 * reachable — the menu is an affordance for a narrow viewport, not the only
 * route to the pages.
 */

/** Attached once, at document level, because Escape has to be heard while
 * focus is anywhere inside the overlay. `enhanceNav` runs per navigation, so
 * binding here instead would add a listener per page visited. */
let keyboardBound = false;

const BUTTON_ID = "nav-toggle";
const MENU_ID = "nav-menu";

function elements(): { button: HTMLElement; menu: HTMLElement } | null {
  const button = document.getElementById(BUTTON_ID);
  const menu = document.getElementById(MENU_ID);
  return button && menu ? { button, menu } : null;
}

function isOpen(button: HTMLElement): boolean {
  return button.getAttribute("aria-expanded") === "true";
}

function setOpen(button: HTMLElement, menu: HTMLElement, open: boolean): void {
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  if (open) menu.setAttribute("data-open", "");
  else menu.removeAttribute("data-open");
  // Scroll lock on the root element, not the body: Lenis drives scroll through
  // the documentElement, so locking the body alone leaves the page still
  // moving behind a menu that covers it.
  document.documentElement.classList.toggle("nav-open", open);
}

/** Tab must not walk out of an overlay that covers the page — behind it sits a
 * whole document that is visually gone but still focusable. */
function trapTab(event: KeyboardEvent, menu: HTMLElement): void {
  const focusable = menu.querySelectorAll<HTMLElement>(
    "a, button, [tabindex]:not([tabindex='-1'])",
  );
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" && event.key !== "Tab") return;
  const found = elements();
  if (!found || !isOpen(found.button)) return;

  if (event.key === "Escape") {
    setOpen(found.button, found.menu, false);
    found.button.focus();
    return;
  }
  trapTab(event, found.menu);
}

/**
 * Wire the menu for the current document. Safe to call repeatedly: a view
 * transition swaps in fresh elements, so the listeners attached here go with
 * the nodes they were attached to.
 */
export function enhanceNav(): void {
  const found = elements();
  if (!found) return;
  const { button, menu } = found;

  // A navigation while the menu was open swaps in markup that renders closed,
  // but the scroll lock lives on the root element and survives the swap — so
  // clear it, or the new page cannot be scrolled at all. Runs on every call,
  // including the ones that return early below.
  setOpen(button, menu, false);

  // Idempotency guard, same shape as the contact form's. The layout calls
  // start() directly AND on `astro:page-load`, which Astro fires on first load
  // too — so without this the toggle collects a second click listener, each
  // click flips the menu open and immediately shut again, and the menu simply
  // never appears. The marker lives on the element, so the fresh button a view
  // transition swaps in is correctly treated as unbound.
  if (button.dataset["navBound"] === "true") return;
  button.dataset["navBound"] = "true";

  button.addEventListener("click", () => {
    const next = !isOpen(button);
    setOpen(button, menu, next);
    // Move focus with the state, in both directions: opening should land in
    // the menu, closing should return to the control that closed it rather
    // than dropping focus to the top of the document.
    if (next) menu.querySelector("a")?.focus();
    else button.focus();
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      setOpen(button, menu, false);
    });
  });

  if (!keyboardBound) {
    document.addEventListener("keydown", onKeydown);
    keyboardBound = true;
  }
}
