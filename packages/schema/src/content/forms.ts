/**
 * Where a tenant contact form posts (ADR-0011).
 *
 * One constant, three consumers that must agree: the template renders it as
 * the form's `action`, the enhancement script fetches it, and the edge widens
 * `connect-src` and `form-action` to exactly this origin for tenants that have
 * a form. A disagreement between them does not fail a build — it fails at
 * submit time, in a visitor's browser, as a blocked request nobody sees.
 *
 * Web3Forms was chosen over a native endpoint deliberately: submissions are
 * the one piece of tenant data Plinth would otherwise have to store, secure
 * and delete on request, and delivering them straight to the tenant's inbox
 * keeps them out of the platform entirely.
 */
export const CONTACT_FORM_ENDPOINT = "https://api.web3forms.com/submit";

/** The origin the edge has to allow — `form-action` and `connect-src` match on
 * origin, not on path. */
export const CONTACT_FORM_ORIGIN = "https://api.web3forms.com";
