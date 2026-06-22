/**
 * Data access for the custom-domains domain — workspace-scoped Drizzle queries
 * over customDomains. The only domains layer that touches Postgres (ADR-0009);
 * callers reach it through service. Impl lands with custom-domain wiring
 * (ADR-0004).
 */
export {};
