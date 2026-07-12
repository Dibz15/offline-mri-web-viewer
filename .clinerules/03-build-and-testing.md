# .clinerules/03-build-and-testing.md

## Build pipeline safety
- When editing `scripts/build.mjs`: never pass the inlined bundle as a
  *string* to `String.prototype.replace()`. Use a function replacer —
  `html.replace(scriptTag, () => inlined)` — not
  `html.replace(scriptTag, inlined)`. A plain string replacement
  reinterprets `$&`/`$$`/etc. in the replacement text, and a 2MB+ minified
  bundle is near-guaranteed to contain a literal `"$&"` (common
  regex-replace idiom), silently corrupting the output. This happened once
  already.
- After every build, sanity-check the output before considering the task
  done:
      npm run build
      grep -o "</script" dist/index.html | wc -l   # must be exactly 2
  If it's not 2, something duplicated content or the vendored bundle
  contains a stray `</script` — do not ship until this checks out.

## Testing
There is no automated test suite. Verify UI changes by:
1. `npm run build`
2. Open `dist/index.html` directly via `file://` (the actual target use
   case) — or `npm run serve` + a **real host browser tab**, not an
   in-editor preview panel. WebGL2 needs a genuine browser context.
3. Hard-refresh (not a normal refresh) any tab already pointed at a
   locally-served `dist/index.html` — static servers here don't send
   cache-busting headers, so a stale bundle is a common false negative.

## Style
Match what's already there: vanilla JS, the `$`/`$$` query-selector
helpers already defined at the top of `app.js`, app.js wrapped in an IIFE
when inlined (keeps it off `window`, away from NiiVue's own UMD globals).
Don't introduce a different style in new code.