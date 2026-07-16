declare module "cloudflare:test" {
  // Declaration merging: gives `env` from cloudflare:test the worker's real
  // binding types. Intentionally member-less.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
