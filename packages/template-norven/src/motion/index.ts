/**
 * The Norven motion runtime, ported from the norven repo (M6). One entry: the
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
function initLenis(): void {
  if (reducedMotion()) return;
  const lenis = new Lenis({ autoRaf: false, lerp: 0.12, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
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
  els.forEach((el) => {
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 40 },
      {
        autoAlpha: 1,
        y: 0,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "top 88%",
          scrub: true,
          onLeave: (self) => {
            el.classList.add("is-in");
            self.disable(false);
          },
        },
      },
    );
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

/** Boot the runtime: mark html.js (activates the CSS hidden states), then
 * bind every effect. Static single-page site — no navigation lifecycle. */
export function boot(): void {
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
