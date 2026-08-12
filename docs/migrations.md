# Migrations

Two things in Plinth version independently, and conflating them is the mistake
this document exists to prevent.

- **The database schema** — Postgres tables, applied by `drizzle-kit migrate` at
  deploy time, forward-only ([ADR-0011](./adr/0011-operational-baseline.md)).
  Every tenant is on the same schema version at the same moment
  ([ADR-0002](./adr/0002-tenant-isolation.md)).
- **The content document** — the JSON shape inside `content_drafts.document` and
  `content_versions.snapshot`, versioned by its own `schemaVersion` field
  ([ADR-0001](./adr/0001-editor-model.md)). Old versions of this shape stay
  readable indefinitely, and the reason is not politeness — see
  [Why old document versions can never be dropped](#why-old-document-versions-can-never-be-dropped).

A change to one is not a change to the other. Adding a template field touches
no SQL at all; the column is `jsonb`.

---

## Part 1 — Database schema

### The shape of a safe change

Migrations apply globally, so there is no staging a change tenant by tenant. The
only shape that is safe is one where the old code and the new schema can coexist,
because for the length of the deploy they do:

```
migrate ──▶ old image still serving ──▶ new image takes traffic
        ▲
        └─ the schema is ahead of the code here, always
```

`deploy-api.yml` runs the `migrate` job before `flyctl deploy`, and gates on it:
a failed migration never reaches the deploy step, so the old image keeps serving
against the old schema. That gate is only worth having if the migration itself
was safe to apply under the old code.

**Additive is safe.** A new nullable column, a new column with a default, a new
table, a new index. Old code ignores what it does not select.

**Destructive is a sequence, never one migration.** Dropping or renaming a column,
tightening a nullable column to `NOT NULL`, changing a type. Each is expand →
migrate → contract, across at least two deploys:

| | Migration | Code | Safe because |
|---|---|---|---|
| 1. Expand | add the new column, nullable | writes both, reads the old | nothing reads the new column yet |
| 2. Backfill | populate the new column | unchanged | a data-only step, re-runnable |
| 3. Migrate | — | reads the new, still writes both | rollback to the previous image still works |
| 4. Contract | drop the old column | reads and writes the new only | nothing references the old column |

A rename is the same sequence: it is an add, a backfill, and a drop. There is no
`ALTER TABLE … RENAME` that is safe here, because the moment it lands the old
image is querying a column that no longer exists.

### When null is a value, not a backlog

The table above assumes the backfill eventually completes and null stops
occurring. Some columns are not like that, and it is worth recognising one
before scheduling a contract that can never happen.

`media.variant_widths` (migration `0002`) is the example. It records which
image variants were generated for a row. Null means "this upload predates the
recording", and the code reads that as the frozen legacy set — which is
correct, permanently, because those uploads did not retain their original bytes
and so cannot be re-encoded into anything else
([ADR-0006](./adr/0006-media-pipeline.md)). There is no backfill that would
finish, and `NOT NULL` is not a later tightening to look forward to.

The test is whether null carries information the new value cannot express. If
it does, say so in the column's comment, because the next person reading a
nullable column will otherwise assume the contract step was simply forgotten.

What this shape still owes you is that every reader agrees on the reading. A
single `?? legacyDefault` helper, used everywhere the column is consumed, is
the whole discipline: the bug this prevents is one caller treating null as
"empty" while another treats it as the default, which typechecks, passes tests
that only cover populated rows, and produces the wrong answer on exactly the
oldest data.

### Forward-only, and what that costs

There are no down migrations ([ADR-0011](./adr/0011-operational-baseline.md)). A
bad migration is corrected by a following migration, not reversed. Write the up
migration having already answered "if this is wrong, what is the forward fix?" —
if the honest answer is "restore from backup", the change is destructive and
belongs in the sequence above.

The one case a forward fix cannot cover is data already destroyed. That is the
whole argument for contract being a separate, later deploy: by the time you drop
the old column, the new one has been carrying production writes for a release
and you have evidence rather than hope.

### Generating one

```sh
pnpm db:generate          # diff src/schema/* → a new src/migrations/NNNN_*.sql
pnpm db:migrate           # apply to the local database
pnpm --filter @plinth/db test   # the RLS suite, against a real Postgres
```

Read the generated SQL before committing it. `drizzle-kit` infers a rename as a
drop plus an add whenever it cannot match columns by name, which is exactly the
destructive shape above wearing an additive-looking diff.

### Any new tenant table needs RLS in the same migration

A table with `workspace_id` and no policy is a cross-tenant leak that every test
passes. The isolation invariant is enforced by Postgres, not by query authors
([ADR-0002](./adr/0002-tenant-isolation.md)), so a table outside the policy set
has no isolation at all.

1. Add the table to `tenantTables` in `packages/db/src/rls.ts` — the source of truth.
2. Append the statements it emits to the RLS migration, or a new one.
3. `packages/db/src/rls.test.ts`'s drift guard asserts the SQL matches what
   `allRlsStatements()` produces, so a table added in step 1 and forgotten in
   step 2 fails `verify` rather than shipping.

`drizzle-kit` cannot emit `FORCE ROW LEVEL SECURITY`, which is why these are
hand-written. `FORCE` is load-bearing: the application role owns these tables and
Postgres exempts owners from RLS unless forced.

---

## Part 2 — The content document

### Read-upgrade, write-latest

The document schema carries a `schemaVersion` discriminant. One function owns the
transition:

```ts
parseContentDocument(unknown) → ContentDocument   // always the current version
```

It is a discriminated union on `schemaVersion` whose older branches `.transform()`
up to the current shape. Two rules follow, and both matter:

- **Every read goes through it.** A read path that parses the raw row sees an old
  shape and quietly behaves differently from one that upgrades.
- **Every write emits the current version.** Upgrading on read and writing back
  the old shape means the migration never completes.

The database needs no migration for this. `document` and `snapshot` are `jsonb`;
the Drizzle `$type<>` is a TypeScript assertion, not a constraint. A one-shot
script that reads every draft and writes it back converges live rows so the
upgrade path stops running on the hot read path, but nothing breaks without it.

### Additive-with-default is the only safe field change

Adding a field to a template means every existing tenant's content lacks it
([ADR-0001](./adr/0001-editor-model.md)). Give it a default in the schema, or
make it optional and have the component handle its absence. A required field
with no default makes every stored document invalid the moment it ships — and
invalid at *publish* time, which means the tenant discovers it as a failed
publish of content they did not touch.

Removing a field is the expand/contract sequence again: stop rendering it, ship,
then remove it from the manifest once no live snapshot depends on it.

### Why old document versions can never be dropped

This is the constraint people get wrong.

`content_versions` rows are immutable snapshots. `rollbackToVersion` accepts any
version whose `status` is `built`, and the reaper retains the ten most recent per
workspace plus the live one. So a rollback can select a snapshot written ten
publishes ago, and the build path must render it **without a rebuild** — a
rollback is a pointer swap, not a re-publish.

Therefore: **a `schemaVersion` branch may never be deleted while any retained
snapshot could carry it.** Not until every workspace has published past its
retention window. In practice the old branches stay.

The corollary is worth stating plainly, because it looks like a bug when it
happens: rolling back across a version boundary produces a site built from the
old shape. That is correct — the snapshot is what was published — but it can
mean losing capability the newer shape had, silently, on a button that reads as
"undo".

### What changes when you bump `schemaVersion`

- **`contentHash` changes for every document**, because it hashes the canonical
  JSON and the shape moved. Consequences to expect rather than debug:
  - Every workspace shows "unpublished changes" immediately after deploy.
  - The first publish after the bump misses `findVersionByIdempotencyKey` and
    rebuilds, even for content nobody edited.
  - Preview reloads on the first save.
- **Hash both sides of the preview channel identically.** The preview route hashes
  the document it renders; the save action hashes what it stored. If one hashes
  the raw row and the other the upgraded document, every save sends a hash that
  never matches the render, the iframe hard-reloads, and the next save does it
  again — a reload loop with no error anywhere. Upgrade at the database read
  boundary, before anything hashes.
- **Media references must keep the `mediaId` key.** The orphaned-media reaper
  finds live references by scanning serialized JSON for `"mediaId":"<uuid>"`, a
  regex rather than a foreign key. It is depth-independent, so nesting is fine —
  but a shape that stores a media id under any other key makes every image it
  references look unreferenced, and they are deleted with their R2 variants after
  seven days.

### Checklist

- [ ] `parseContentDocument` accepts the old version and upgrades it
- [ ] Every database read boundary upgrades before hashing or rendering
- [ ] Writes emit the current version only
- [ ] A retained old-version snapshot still builds — tested, not assumed
- [ ] New fields are optional or defaulted
- [ ] Media references still use `mediaRef`, `mediaId` key included
- [ ] The convergence script ran, or its absence is a deliberate call

---

## Restoring, when a migration was the problem

`docs/operations.md` holds the restore runbook. One line belongs here: after a
restore, run the cross-tenant RLS probe (`pnpm --filter @plinth/db test`) before
trusting the database. A restore that lost the RLS policies is a database that
answers every query for every tenant, and nothing else in the stack will notice.
