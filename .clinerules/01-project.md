# .clinerules/01-project.md

## What this is
A single-purpose offline MRI/NIfTI viewer built almost entirely on NiiVue
(WebGL2). The deliverable is one self-contained `dist/index.html` — no
server, no CDN, no install. `src/index.html` + `src/app.js` are the source;
`scripts/build.mjs` inlines them + NiiVue's UMD bundle into `dist/`.

## Hard constraints — do not violate without being explicitly asked
- No frameworks, no bundler beyond `scripts/build.mjs`, no new runtime
  dependencies. The only devDependency should stay `@niivue/niivue` (+
  `serve` for local preview if present).
- Nothing in `src/` may use `import`/`export`/`type="module"`. The shipped
  page must run as classic `<script>` tags — ES modules are blocked by the
  browser's Same-Origin Policy when opened via `file://`, which is the
  actual target use case.
- Reuse the existing CSS custom properties defined at the top of
  `src/index.html` (`--void`, `--panel`, `--nav`, `--stat`, `--border`,
  etc.) for any new UI. Don't hardcode new colors.
- Keep changes scoped. This is a small single-maintainer tool, not a
  platform — don't add test frameworks, linters, or CI changes unprompted.
- `dist/` is a build artifact (gitignored). Never hand-edit it — edit
  `src/`, then rebuild.