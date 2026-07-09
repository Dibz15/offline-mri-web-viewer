# Offline MRI Viewer

A simple, offline, no-download-required tool for viewing 3D MRI scans
(NIfTI `.nii` / `.nii.gz`) directly in your browser. No install, no server,
no account, no data leaving your machine — open one HTML file and drop in
a scan.

**Live site:** https://dibz15.github.io/offline-mri-viewer/
*(update this link if your repository name or GitHub username differs — see
[Deployment](#deployment) below)*

**Download:** grab the latest self-contained `offline-mri-viewer.html` from
the [Releases page](../../releases/latest) — save it anywhere and double-click
to open it, no internet connection required after that.

---

## Screenshots / demo

*(Add a few screenshots or a short screen recording here once you have them.
Suggestions for what's worth capturing:)*

1. **Multiplanar view** — a loaded T1 scan in the default 2×2 grid layout
   (axial/coronal/sagittal + optional 3D render), crosshair visible, sidebar
   showing the volume's colormap/window controls.
2. **Overlay + colorbar** — an anatomical base image with a statistical map
   or segmentation overlay on top (hot/jet colormap, colorbar visible,
   opacity slider mid-way), to show off multi-volume support.
3. **3D clip plane** — the render view with the clip-plane tool cutting away
   part of the volume to reveal internal structure — this is the most
   visually distinctive feature, worth a GIF or short clip showing the cut
   amount slider being dragged live.
4. *(Optional)* A short (10–20s) screen recording of the whole flow: drag a
   `.nii.gz` file onto the page → adjust window/level → switch layouts →
   take a screenshot with the built-in export button.

```md
<!-- Example once you have images, e.g. in a docs/ or screenshots/ folder:
![Multiplanar view](docs/screenshot-multiplanar.png)
![3D clip plane](docs/screenshot-clip3d.png)
-->
```

---

## Features

- Axial / coronal / sagittal multiplanar views, plus an optional 3D volume
  render, with synced crosshair and click-to-navigate
- Load a base volume plus any number of overlays (e.g. anatomical +
  statistical map, or anatomical + segmentation), via drag-and-drop or a
  file picker
- Per-volume colormap, opacity, and window/level (threshold) controls, with
  sensible auto-calculated defaults on load
- Thresholded statistical overlays with positive/negative colormaps and a
  colorbar
- 3D clip-plane tool — cut away part of the volume along an axis (or a
  custom angle) to see internal structure, with adjustable precision
- Basic distance measurement
- 4D (time series) volumes with a timepoint slider and playback
- Layout switching (grid / row / column / single pane), reset view, and
  PNG screenshot export
- Live crosshair position, voxel intensity, and voxel spacing readouts
- Runs entirely in the browser — nothing is uploaded anywhere

## Usage

1. Open the app (via the [live site](#offline-mri-viewer) or a downloaded
   `offline-mri-viewer.html`).
2. Drag a `.nii` or `.nii.gz` file onto the page, or click **Open files…**.
   The first file you load becomes the base layer; anything after that
   loads as an overlay.
3. Use the sidebar to adjust each volume's colormap, opacity, and
   window/threshold. The **Auto window** button re-runs NiiVue's own
   robust min/max calculation if you want to reset it.
4. Switch layouts, toggle the 3D render pane, or turn on **Clip 3D** to cut
   away part of the volume and see inside it — the axis presets
   (sagittal/coronal/axial) are a good starting point, with a cut-amount
   slider and precision control for fine adjustment.
5. Click **📏 Measure** to drag out a distance between two points on a
   slice, or **📷** to save a PNG screenshot of the current view.

Everything runs client-side — closing your network connection after the
page has loaded (or after opening the downloaded `.html` file) doesn't
break anything.

## Development

```sh
npm install
npm run build   # writes the self-contained dist/index.html
```

`npm run build` (via [`scripts/build.mjs`](./scripts/build.mjs)) inlines
NiiVue's own prebuilt UMD bundle and this project's `src/app.js` into a
single `dist/index.html`, so the result has zero runtime dependencies —
useful both for GitHub Pages and for the downloadable release asset. The
source (`src/index.html`, `src/app.js`) is what you'll actually want to
edit; `dist/` is a build output and isn't committed.

To iterate locally, run `npm run build` and open `dist/index.html`
directly in a browser, or serve `src/` with any static file server during
development (NiiVue itself is only vendored at build time).

### Deployment

- **GitHub Pages:** [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
  builds and deploys `dist/` to GitHub Pages on every push to `main`.
  Enable Pages under *Settings → Pages → Source: GitHub Actions* for this
  to take effect.
- **Releases:** [`.github/workflows/release.yml`](./.github/workflows/release.yml)
  builds the app and attaches `offline-mri-viewer.html` to a GitHub
  Release whenever a tag matching `v*.*.*` is pushed (or via manual
  workflow dispatch).

## Credits

This project is almost entirely a UI built on top of
**[NiiVue](https://github.com/niivue/niivue)**, the WebGL2 medical image
viewer created by Chris Rorden and the NiiVue authors/contributors
(BSD-2-Clause license). All the actual rendering, volume loading, and
interaction handling is NiiVue — this repository just wraps it in an
offline-friendly single-file page with some additional controls layered on
top. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for full
attribution, including the libraries NiiVue itself bundles.

## License

This project's own code is licensed under [Apache-2.0](./LICENSE). The
built output also embeds NiiVue (BSD-2-Clause) — see
[`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).
