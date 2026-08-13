/**
 * The Norven motion runtime, ported from the norven repo. One entry: the
 * published site's page loads this module and calls boot(). The preview
 * iframe never imports it — content is visible without the runtime because
 * every hidden initial state in styles.css is gated on `html.js`, which only
 * boot() adds.
 *
 * Reduced motion honors BOTH the OS preference and the dashboard's preview
 * guard attribute (`data-prefers-reduced-motion`, ADR-0007) — belt and
 * suspenders should the runtime ever load inside an iframe.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export const reducedMotion = (): boolean =>
  typeof window === "undefined" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.hasAttribute("data-prefers-reduced-motion");

// --- Lenis smooth scroll ---
/** Held so teardown can release them. Without references, a second boot leaves
 * the previous Lenis instance and its ticker callback running forever — one
 * more of each per navigation, each still driving scroll. */
let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;

function initLenis(): void {
  if (reducedMotion()) return;
  lenis = new Lenis({ autoRaf: false, lerp: 0.12, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  const instance = lenis;
  tick = (time: number) => {
    instance.raf(time * 1000);
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
}

// --- [data-reveal] scroll-driven fade-in (scrub, disables after first pass) ---
function bindReveals(): void {
  const els = gsap.utils.toArray<HTMLElement>("[data-reveal]");
  if (els.length === 0) return;
  if (reducedMotion()) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  // Opacity is a discrete transition on entry, not scrubbed against scroll
  // position — the one deliberate departure from the ported original.
  //
  // Scrubbing opacity makes an element's legibility a function of how far the
  // page happens to be scrolled: anything resting part-way through the scrub
  // renders at part-way contrast and stays there. That is a real reading
  // problem and `color-contrast` is right to fail it — it caught text at
  // 1.4:1 on two of the five pages. The original passed only because its
  // layout never left content in that band.
  //
  // `autoAlpha` still drives the entry, so before it fires the element is
  // `visibility: hidden` rather than faint: absent from the accessibility
  // tree instead of present and unreadable. The drift stays scrubbed, because
  // position carries no legibility.
  els.forEach((el) => {
    gsap.set(el, { autoAlpha: 0, y: 40 });
    ScrollTrigger.create({
      trigger: el,
      start: "top 92%",
      once: true,
      onEnter: () => {
        gsap.to(el, {
          autoAlpha: 1,
          y: 0,
          duration: 0.6,
          ease: "power2.out",
          onComplete: () => el.classList.add("is-in"),
        });
      },
    });
  });
}

// --- [data-reveal-lift] clip-mask reveal ---
function wrapLiftInner(el: HTMLElement): HTMLElement {
  const existing = el.querySelector<HTMLElement>(":scope > .reveal-lift__inner");
  if (existing) return existing;
  const inner = document.createElement("span");
  inner.className = "reveal-lift__inner";
  while (el.firstChild) inner.appendChild(el.firstChild);
  el.appendChild(inner);
  return inner;
}

function bindLifts(): void {
  const els = gsap.utils.toArray<HTMLElement>("[data-reveal-lift]");
  if (els.length === 0) return;
  const inners = els.map(wrapLiftInner);
  if (reducedMotion()) {
    els.forEach((el) => el.classList.add("is-in"));
    inners.forEach((inner) => (inner.style.transform = "none"));
    return;
  }
  gsap.set(inners, { yPercent: 110 });
  ScrollTrigger.batch(els, {
    start: "top 88%",
    onEnter: (batch) => {
      batch.forEach((el) => el.classList.add("is-in"));
      const matched = batch
        .map((el) => el.querySelector<HTMLElement>(":scope > .reveal-lift__inner"))
        .filter((x): x is HTMLElement => x !== null);
      gsap.to(matched, {
        yPercent: 0,
        duration: 1.1,
        ease: "cubic-bezier(0.2, 0.7, 0.2, 1)",
        stagger: 0.08,
        overwrite: true,
      });
    },
    once: true,
  });
}

// --- img.image-fade fade-on-load ---
function bindImageFades(): void {
  document.querySelectorAll<HTMLImageElement>("img.image-fade").forEach((img) => {
    if (img.complete && img.naturalHeight !== 0) {
      img.classList.add("is-loaded");
      return;
    }
    const onSettled = (): void => img.classList.add("is-loaded");
    img.addEventListener("load", onSettled, { once: true });
    img.addEventListener("error", onSettled, { once: true });
  });
}

// --- [data-parallax] gentle non-pinning parallax ---
function bindParallax(): void {
  if (reducedMotion()) return;
  gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
    const amount = Number(el.dataset.parallax || "8");
    gsap.fromTo(
      el,
      { yPercent: -amount },
      {
        yPercent: amount,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
      },
    );
  });
}

// --- [data-hero-scale] slow zoom on the hero photo ---
function bindHeroScale(): void {
  if (reducedMotion()) return;
  const el = document.querySelector<HTMLElement>("[data-hero-scale]");
  if (!el) return;
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      scale: 1.06,
      ease: "none",
      scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true },
    },
  );
}

// --- [data-count] stat counters ---
function bindCounters(): void {
  const counters = gsap.utils.toArray<HTMLElement>("[data-count]");
  if (counters.length === 0) return;
  if (reducedMotion()) return; // markup already shows the target value
  counters.forEach((el) => {
    const target = Number(el.getAttribute("data-count") ?? "");
    if (!Number.isFinite(target)) return; // non-numeric stat — leave as text
    el.textContent = "0";
    ScrollTrigger.create({
      trigger: el,
      start: "top 82%",
      once: true,
      onEnter: () => {
        const proxy = { n: 0 };
        gsap.to(proxy, {
          n: target,
          duration: 1.6,
          ease: "power3.out",
          onUpdate: () => {
            el.textContent = Math.round(proxy.n).toLocaleString();
          },
        });
      },
    });
  });
}

/**
 * Boot the runtime: mark html.js (activates the CSS hidden states), then bind
 * every effect.
 *
 * Idempotent, because view transitions call it per navigation (ADR-0015) and
 * the first load calls it directly — so the two overlap on the initial page.
 * Tearing down first is what makes a second call safe rather than additive.
 */
export function boot(): void {
  teardown();
  document.documentElement.classList.add("js");
  initLenis();
  bindReveals();
  bindLifts();
  bindImageFades();
  bindParallax();
  bindHeroScale();
  bindCounters();
  requestAnimationFrame(() => ScrollTrigger.refresh());
}

/**
 * Release everything boot bound. Called before a view transition swaps the
 * document, and by boot itself.
 *
 * Every ScrollTrigger on a tenant page comes from this runtime — the renderer
 * is the only script source (ADR-0011) — so killing all of them is exact
 * rather than broad. The DOM the old triggers pointed at is about to be
 * discarded, and a trigger holding a detached element keeps that whole subtree
 * alive.
 */
export function teardown(): void {
  ScrollTrigger.getAll().forEach((trigger) => {
    trigger.kill();
  });
  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
}
