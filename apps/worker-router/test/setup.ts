import { reset } from "cloudflare:test";
import { afterEach } from "vitest";

// The Workers Vitest plugin isolates storage per test file rather than per
// test — `isolatedStorage` went away with the Vitest 4 migration — so without
// this every test inherits whatever its predecessors wrote to R2 and KV, and
// a case like "no 404 page in the build" would read one an earlier test put
// there.
afterEach(async () => {
  await reset();
});
