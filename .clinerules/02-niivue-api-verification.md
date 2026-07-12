# .clinerules/02-niivue-api-verification.md

## Rule zero: never assume NiiVue's API from memory, web search, or its
## own README. Verify against the real vendored source before writing any
## code that touches `nv.*`, `volume.*`, `nv.opts.*`, or `nv.scene.*`.

This project has been burned repeatedly by plausible-sounding but wrong
API assumptions. The real, current source is sitting right there after
`npm install`:

    node_modules/@niivue/niivue/dist/index.js   (unminified, readable — use this)

Grep it before writing the call:
- Method exists?      grep -n "  methodName(" node_modules/@niivue/niivue/dist/index.js
- Field on a class?    grep -n "__publicField(this, \"fieldName\"" ...index.js
  then check which class the surrounding constructor belongs to — a field
  existing somewhere in the file does NOT mean it exists on the class you
  think it does.
- Enum values?         grep -n "var ENUM_NAME = " -A 8 ...index.js

Do NOT vendor `dist/index.min.js` for anything — most of that file is one
giant self-referential string constant (NiiVue's own `generateHTML()`
templating), not normal executable code. Use `dist/niivue.umd.js` for the
shipped classic-script bundle, `dist/index.js` only for grepping/reading.

## Known gotchas already paid for — don't rediscover these
- `volume.visible` does not exist on NVImage (it only exists on mesh
  options). Opacity is the ONLY way to hide/show a volume:
  `nv.setOpacity(index, 0)` to hide, restore the prior value to show.
- `onLocationChange`'s `data.mm` / `data.vox` are typed arrays
  (Float32Array), not plain Arrays. `Array.isArray()` on them is always
  `false` — use `.length` duck-typing instead.
- `nv.opts.dragMode` only controls right/middle-click drag.
  `nv.opts.dragModePrimary` controls left-click (the default interaction,
  including click-to-navigate). A toggle that sets only `dragMode` will
  silently do nothing for the interaction most people try first.
- `nv.resetScene()` does not exist, and NiiVue's core `keyDownListener` has
  no "reset view" action at all (checked the switch statement directly).
  To reset the view: `nv.setPan2Dxyzmm([0,0,0,1])`,
  `nv.scene.volScaleMultiplier = 1`, `nv.setRenderAzimuthElevation(110, 10)`
  (110/10 = NiiVue's own `INITIAL_SCENE_DATA` defaults), then `nv.drawScene()`.
- Scroll wheel in the 3D render tile is hijacked by NiiVue itself to adjust
  clip-plane depth (instead of zoom) whenever a clip plane is active
  (depth < 1.8), with no built-in opt-out — this app overrides it with its
  own capture-phase `wheel` listener. If you touch zoom or clip-plane code,
  keep that override intact regardless of clip state.
- Native scroll-zoom clamps `volScaleMultiplier` to [0.5, 2], but that
  clamp only lives inside NiiVue's internal scroll handler — it's not
  re-enforced in the projection math. This app's own wheel override uses a
  wider ceiling; don't assume 2 is a hard limit elsewhere.
- Verified enum values (re-check after any `@niivue/niivue` version bump):
  `SHOW_RENDER`: NEVER=0, ALWAYS=1, AUTO=2.
  `MULTIPLANAR_TYPE`: AUTO=0, COLUMN=1, GRID=2, ROW=3.
  `DRAG_MODE`: none=0, contrast=1, measurement=2, pan=3, ... (grep for the
  rest, ~10 members).
- Clip plane: `nv.setClipPlane([depth, azimuthDeg, elevationDeg])`, where
  `depth` (~ -1.73..1.73, sqrt(3)) is distance-from-center and ≥~1.8
  disables clipping. The UI deliberately exposes a 0–100% "cut amount"
  abstraction over this (`cutPercentToDepth()` in app.js) because the raw
  parameter's direction is unintuitive — keep using that abstraction.

`node_modules/@niivue/niivue/dist/index.js` is ~50k+ lines. Grep for the
specific symbol first; don't read the whole file into context.