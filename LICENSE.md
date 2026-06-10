# License

Plinth has three licensing layers. Reading the whole file matters because each section governs different parts of the repository.

## 1. Code — MIT License

Applies to every file under `apps/`, `packages/`, `scripts/`, `.github/`, `docs/`, and `tests/`, plus configuration at the repository root (`package.json`, `tsconfig.json`, `turbo.json`, `pnpm-workspace.yaml`, `.eslintrc.*`, `.prettierrc.*`, `vitest.config.*`, `playwright.config.*`, and similar). Documentation written by me — including ADRs, `ARCHITECTURE.md`, `CONTEXT.md`, and `CONTRIBUTING.md` — is also MIT-licensed and may be quoted, paraphrased, and adapted under the same terms.

```
MIT License

Copyright (c) 2026 Farul Ivan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

You can fork Plinth, run it, modify it, deploy it under your own brand, and ship it as part of your own product. You can read, copy, and adapt the documentation and the ADRs. The MIT terms apply uniformly to code, configuration, and prose documentation across the repository.

## 2. Brand and copy — All Rights Reserved

The following are **not** licensed under MIT and are reserved:

- The **Plinth name** and the **Plinth wordmark** as a product identifier for a typed multi-tenant CMS or a hosted service derived from this codebase. Using "Plinth" to identify your fork or your offering misrepresents authorship and is not permitted.
- The **dashboard chrome copy** — marketing prose, taglines, button labels, empty-state messages, onboarding flow text, and the Plinth marketing site copy at plinth.farulivan.com.
- Any **logo or mark** introduced under the Plinth brand, including monochrome variants and favicons.
- The hosted service domain `plinth.farulivan.com` and any redirection from it.

Forks must be renamed and rebranded before public distribution. The MIT license on the code does not extend to the brand identity.

## 3. Reference content and photographs

The Norven reference template ships with example content (`packages/template-norven/example-content/` and similar paths) representing a fictional architecture studio. This content has separate terms:

- **Prose** — the Norven fictional studio identity (studio name, biographies, project briefs, project narratives, team names and roles, awards, testimonials) is **All Rights Reserved**. It exists as a demonstration of the template's shape and may not be redistributed as part of another commercial offering. A fork running the template for a different studio must replace the example content with its own.
- **Photographs** — example imagery is licensed via [Unsplash](https://unsplash.com/license). Unsplash images are free for commercial and non-commercial use, with no attribution required. The Unsplash license follows the photographs; redistributing the example photographs as part of your own fork is permitted under that license.
- **Logos and SVG marks** — the Norven emblem and wordmark in `packages/template-norven/assets/logo/` are part of the fictional studio identity and are **All Rights Reserved**.

## Summary

| What | License | You can | You cannot |
|---|---|---|---|
| Source code, configuration, docs | MIT | Fork, modify, redistribute, run commercially | Remove copyright notice |
| Plinth brand (name, wordmark, marketing copy) | All Rights Reserved | Reference Plinth as the upstream project | Run a fork or competing service under the Plinth name |
| Norven reference prose | All Rights Reserved | Read the template to understand the shape | Redistribute the Norven fictional content |
| Norven reference photographs | Unsplash | Use the photos commercially and non-commercially | (Unsplash's terms apply) |
| Norven reference logos | All Rights Reserved | Reference the Norven brand as a tenant example | Reuse the marks in your own project |

If you want to use the Plinth brand for a commercial offering, or use the Norven reference content beyond reading the codebase, contact Farul (farulivan@gmail.com).

## Questions

Open an issue on GitHub or email farulivan@gmail.com. Brand and copy questions get fastest replies because they often need clarification before commercial use; code-license questions usually have answers in the MIT FAQ.
