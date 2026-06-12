-- Custom SQL migration file, put your code below! --

-- Tenant isolation (ADR-0002). Custom migration because drizzle-kit cannot
-- emit FORCE ROW LEVEL SECURITY — and FORCE is load-bearing: the app role
-- owns these tables, and Postgres exempts owners from RLS unless forced.
-- Source of truth is src/rls.ts; the rls.test.ts drift guard asserts this
-- file matches allRlsStatements().
ALTER TABLE "content_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_drafts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_drafts_tenant_isolation" ON "content_drafts"
  FOR ALL
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "content_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_versions_tenant_isolation" ON "content_versions"
  FOR ALL
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "media_tenant_isolation" ON "media"
  FOR ALL
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "custom_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_domains" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_domains_tenant_isolation" ON "custom_domains"
  FOR ALL
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
  FOR ALL
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
