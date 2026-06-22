/**
 * External-SDK boundary for the custom-domains domain — Cloudflare API (hostname
 * registration, cert status) and the KV hostname→workspace map (ADR-0004). Pure
 * vendor calls; never imports service or db (ADR-0009). Impl lands with
 * custom-domain wiring.
 */
export {};
