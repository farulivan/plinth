/**
 * The frame every unauthenticated screen shares: a brand panel on the left,
 * the form on the right. The panel is always dark — it carries the wordmark,
 * not content — so it scopes the dark tokens to itself with a nested `dark`
 * class rather than hardcoding a palette that would drift from them.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="dark bg-card text-card-foreground border-border relative hidden flex-col justify-between border-r p-10 lg:flex">
        {/* A quiet grid, the drafting-table kind: structure behind the name. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.04)_1px,transparent_1px)] bg-size-[56px_56px]"
        />
        <div className="relative flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-semibold">
            P
          </span>
          <span className="text-lg font-semibold tracking-tight">Plinth</span>
        </div>
        <div className="relative space-y-3">
          <p className="max-w-sm text-2xl leading-snug font-medium tracking-tight">
            The CMS for sites that read well.
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            One workspace, one publish button, no passwords.
          </p>
        </div>
      </div>
      <main className="flex flex-col items-center justify-center p-6">{children}</main>
    </div>
  );
}
