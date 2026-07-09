// NiiVue Web Viewer — application logic
// @niivue/niivue is inlined directly into index.html as a classic UMD <script>
// (see the first <script> block in index.html), which attaches everything to
// window.niivue. This whole page is a single self-contained .html file with no
// external requests at runtime, so it works when opened straight from disk
// (file://) — ES module imports are blocked by the browser's Same-Origin
// Policy under file://, which is why we use the UMD build instead of import().
const { Niivue, SHOW_RENDER, DRAG_MODE } = window.niivue;

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const OVERLAY_COLORMAP_CYCLE = ["hot", "cool", "plasma", "winter", "viridis", "inferno"];
const LAYER_DOT_COLORS = ["#4fd8c4", "#ff9a4d", "#ffd24d", "#9a7bff", "#4dc0ff", "#ff6b9a"];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function isNiftiFile(file) {
  const n = file.name.toLowerCase();
  return n.endsWith(".nii") || n.endsWith(".nii.gz") || n.endsWith(".gz");
}

function setStatus(msg, isError = false) {
  const el = $("#statusMsg");
  el.textContent = msg || "";
  el.classList.toggle("err", !!isError);
  if (msg) {
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => { el.textContent = ""; }, 6000);
  }
}

// In-memory (session-only) settings cache, keyed by "name:size" so a file
// re-dropped in the same tab session restores its last colormap/window/opacity.
const sessionSettings = new Map();
function settingsKeyFor(file) { return `${file.name}:${file.size}`; }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let nv;
let colormapNames = [];
let measurementOn = false;
let frame4dTimer = null;
const fourDVolumeIds = new Set(); // ids of currently-loaded 4D volumes

let clip3dOn = false;
// Best-effort axis presets (azimuth/elevation, degrees) — NiiVue's clip plane
// uses the same spherical azimuth/elevation convention as its 3D render
// camera. If a volume's orientation makes one of these look off, nudge the
// azimuth/elevation fields directly; the render updates live.
const CLIP_AXIS_PRESETS = {
  sagittal: { azimuth: 0, elevation: 0 },
  coronal: { azimuth: 90, elevation: 0 },
  axial: { azimuth: 0, elevation: 90 },
};
const CLIP_DISABLED = [2, 0, 0]; // depth > ~1.73 disables clipping entirely

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  nv = new Niivue({
    dragAndDropEnabled: false, // we implement our own drop handling for UI sync
    backColor: [0.039, 0.047, 0.059, 1],
    show3Dcrosshair: true,
    isColorbar: true,
    isResizeCanvas: true,
  });

  await nv.attachToCanvas($("#gl"));
  nv.setSliceType(nv.sliceTypeMultiplanar);
  nv.opts.multiplanarLayout = 2; // grid, matches default "2x2" toolbar button
  nv.opts.multiplanarShowRender = SHOW_RENDER ? SHOW_RENDER.NEVER : 0;

  try { colormapNames = nv.colormaps(); } catch { colormapNames = ["gray", "hot", "cool", "plasma", "viridis", "inferno", "winter"]; }

  nv.onLocationChange = onLocationChange;
  nv.onFrameChange = onFrameChange;
  nv.onMeasurementCompleted = onMeasurementCompleted;
  nv.onImageLoaded = () => renderSidebar();
  nv.onVolumeRemoved = () => renderSidebar();

  $("#verTag").textContent = "v1.0.0 · offline";

  wireToolbar();
  wireDropzones();
  wireKeyboard();
  wireRenderScrollAlwaysZooms();
}

// ---------------------------------------------------------------------------
// Loading volumes
// ---------------------------------------------------------------------------

async function loadFiles(fileList) {
  const files = Array.from(fileList).filter(isNiftiFile);
  const rejected = Array.from(fileList).filter((f) => !isNiftiFile(f));
  if (rejected.length) {
    setStatus(`Skipped unsupported file${rejected.length > 1 ? "s" : ""}: ${rejected.map((f) => f.name).join(", ")}`, true);
  }
  for (const file of files) {
    await loadOneFile(file);
  }
}

async function loadOneFile(file) {
  const isBase = nv.volumes.length === 0;
  const url = URL.createObjectURL(file);
  const overlayIndex = Math.max(0, nv.volumes.length - 1);
  const defaultColormap = isBase ? "gray" : OVERLAY_COLORMAP_CYCLE[overlayIndex % OVERLAY_COLORMAP_CYCLE.length];
  const cached = sessionSettings.get(settingsKeyFor(file));

  showLoading(`Loading ${file.name}…`);
  try {
    const volume = await nv.addVolumeFromUrl({
      url,
      name: file.name,
      colormap: cached?.colormap || defaultColormap,
      opacity: cached?.opacity ?? (isBase ? 1 : 0.7),
    });

    // Track a stable key on the NVImage instance so we can persist settings later.
    volume.__settingsKey = settingsKeyFor(file);
    volume.__isBase = isBase;

    if (cached) applyCachedSettings(volume, cached);
    else if (!isBase) {
      volume.colorbarVisible = true;
    }

    // 4D detection
    const nFrames = volume.nFrame4D || (volume.hdr && volume.hdr.dims && volume.hdr.dims[4]) || 1;
    if (nFrames > 1) {
      fourDVolumeIds.add(volume.id);
      refreshFrame4dBar();
    }

    nv.updateGLVolume();
    renderSidebar();
    setStatus(`Loaded ${file.name}`);
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load ${file.name}: ${err?.message || err}`, true);
  } finally {
    hideLoading();
  }
}

function applyCachedSettings(volume, s) {
  if (s.cal_min !== undefined) volume.cal_min = s.cal_min;
  if (s.cal_max !== undefined) volume.cal_max = s.cal_max;
  if (s.colormapNegative) { try { nv.setColormapNegative(volume.id, s.colormapNegative); } catch {} }
  if (s.calMinNeg !== undefined) volume.cal_minNeg = s.calMinNeg;
  if (s.calMaxNeg !== undefined) volume.cal_maxNeg = s.calMaxNeg;
  if (s.opacity !== undefined) { try { nv.setOpacity(nv.volumes.indexOf(volume), s.opacity); } catch {} }
  if (s.visible !== undefined) volume.visible = s.visible;
  if (typeof s.colorbarVisible === "boolean") volume.colorbarVisible = s.colorbarVisible;
}

function persistSettings(volume) {
  if (!volume.__settingsKey) return;
  sessionSettings.set(volume.__settingsKey, {
    colormap: volume.colormap,
    opacity: volume.opacity,
    cal_min: volume.cal_min,
    cal_max: volume.cal_max,
    calMinNeg: volume.cal_minNeg,
    calMaxNeg: volume.cal_maxNeg,
    colormapNegative: volume.colormapNegative,
    visible: volume.visible,
    colorbarVisible: volume.colorbarVisible,
  });
}

function showLoading(text) {
  $("#loadingText").textContent = text;
  $("#loadingOverlay").classList.add("show");
}
function hideLoading() { $("#loadingOverlay").classList.remove("show"); }

// ---------------------------------------------------------------------------
// Sidebar (per-volume controls)
// ---------------------------------------------------------------------------

function colormapOptionsHtml(selected, includeNone = false) {
  let html = includeNone ? `<option value="">None</option>` : "";
  for (const name of colormapNames) {
    html += `<option value="${name}" ${name === selected ? "selected" : ""}>${name}</option>`;
  }
  return html;
}

function rangeBoundsFor(volume) {
  const lo = Math.min(volume.cal_min ?? 0, volume.global_min ?? volume.cal_min ?? 0);
  const hi = Math.max(volume.cal_max ?? 1, volume.global_max ?? volume.cal_max ?? 1);
  const pad = Math.max((hi - lo) * 1.5, 1);
  return { min: lo - pad, max: hi + pad };
}

function renderSidebar() {
  const list = $("#volumeList");
  list.innerHTML = "";
  nv.volumes.forEach((volume, index) => {
    list.appendChild(buildVolumeCard(volume, index));
  });
  refreshFrame4dBar();
}

function volumeGeometryLabel(volume) {
  const dims = volume?.hdr?.dims;
  const pix = volume?.hdr?.pixDims;
  if (!dims || !pix) return "";
  const [nx, ny, nz] = [dims[1], dims[2], dims[3]];
  const [sx, sy, sz] = [pix[1], pix[2], pix[3]];
  if (![nx, ny, nz, sx, sy, sz].every((v) => typeof v === "number" && !Number.isNaN(v))) return "";
  const matrix = `${nx}×${ny}×${nz}`;
  const spacing = `${fmtNum(sx, 2)}×${fmtNum(sy, 2)}×${fmtNum(sz, 2)} mm`;
  return `${matrix} vox · ${spacing} spacing`;
}

function buildVolumeCard(volume, index) {
  const isBase = index === 0;
  const dotColor = LAYER_DOT_COLORS[index % LAYER_DOT_COLORS.length];
  const { min: rMin, max: rMax } = rangeBoundsFor(volume);
  const step = Math.max((rMax - rMin) / 500, 0.001);
  const geometry = volumeGeometryLabel(volume);

  const card = document.createElement("div");
  card.className = `vcard ${isBase ? "base" : "overlay"}`;

  card.innerHTML = `
    <div class="vcard-head">
      <span class="vcard-dot" style="background:${dotColor}; color:${dotColor};"></span>
      <span class="vcard-name" title="${volume.name || ""}">${volume.name || "volume " + index}</span>
      <span class="vcard-tag">${isBase ? "base" : "overlay"}</span>
    </div>
    ${geometry ? `<div class="vcard-geometry">${geometry}</div>` : ``}
    <div class="vcard-body">
      <div class="row">
        <label class="flabel">Colormap</label>
        <select data-action="colormap">${colormapOptionsHtml(volume.colormap)}</select>
      </div>

      ${!isBase ? `
      <div class="row">
        <label class="flabel">Opacity</label>
        <div class="range-pair">
          <input type="range" min="0" max="1" step="0.01" value="${volume.opacity ?? 0.7}" data-action="opacity" />
          <span class="rv" data-readout="opacity">${fmtNum(volume.opacity ?? 0.7)}</span>
        </div>
      </div>` : ``}

      <div class="row">
        <label class="flabel">${isBase ? "Window min" : "Threshold min"}</label>
        <div class="range-pair">
          <input type="range" min="${rMin}" max="${rMax}" step="${step}" value="${volume.cal_min ?? rMin}" data-action="cal_min" />
          <span class="rv" data-readout="cal_min">${fmtNum(volume.cal_min)}</span>
        </div>
      </div>
      <div class="row">
        <label class="flabel">${isBase ? "Window max" : "Threshold max"}</label>
        <div class="range-pair">
          <input type="range" min="${rMin}" max="${rMax}" step="${step}" value="${volume.cal_max ?? rMax}" data-action="cal_max" />
          <span class="rv" data-readout="cal_max">${fmtNum(volume.cal_max)}</span>
        </div>
      </div>

      <div class="chip-row">
        <label class="chip"><input type="checkbox" data-action="visible" ${volume.visible === false ? "" : "checked"} /> Visible</label>
        <label class="chip"><input type="checkbox" data-action="colorbar" ${volume.colorbarVisible ? "checked" : ""} /> Colorbar</label>
      </div>

      ${!isBase ? `
      <details class="adv">
        <summary>Negative values (thresholded stat maps)</summary>
        <div class="row">
          <label class="flabel">Neg. cmap</label>
          <select data-action="colormapNegative">${colormapOptionsHtml(volume.colormapNegative || "", true)}</select>
        </div>
        <div class="row">
          <label class="flabel">Neg. min</label>
          <input type="text" inputmode="decimal" data-action="calMinNeg" value="${volume.cal_minNeg ?? ""}" placeholder="e.g. -6.0" />
        </div>
        <div class="row">
          <label class="flabel">Neg. max</label>
          <input type="text" inputmode="decimal" data-action="calMaxNeg" value="${volume.cal_maxNeg ?? ""}" placeholder="e.g. -3.0" />
        </div>
      </details>` : ``}
    </div>
    <div class="vcard-actions">
      <button class="btn small" data-action="autoWindow">Auto window</button>
      <button class="btn small" style="color:var(--danger);" data-action="remove">Remove</button>
    </div>
  `;

  bindCardEvents(card, volume);
  return card;
}

function bindCardEvents(card, volume) {
  card.querySelector('[data-action="colormap"]').addEventListener("change", (e) => {
    nv.setColormap(volume.id, e.target.value);
    persistSettings(volume);
  });

  const opacityInput = card.querySelector('[data-action="opacity"]');
  if (opacityInput) {
    opacityInput.addEventListener("input", (e) => {
      const idx = nv.volumes.indexOf(volume);
      nv.setOpacity(idx, parseFloat(e.target.value));
      card.querySelector('[data-readout="opacity"]').textContent = fmtNum(e.target.value);
      persistSettings(volume);
    });
  }

  card.querySelector('[data-action="cal_min"]').addEventListener("input", (e) => {
    volume.cal_min = parseFloat(e.target.value);
    card.querySelector('[data-readout="cal_min"]').textContent = fmtNum(volume.cal_min);
    nv.updateGLVolume();
    persistSettings(volume);
  });
  card.querySelector('[data-action="cal_max"]').addEventListener("input", (e) => {
    volume.cal_max = parseFloat(e.target.value);
    card.querySelector('[data-readout="cal_max"]').textContent = fmtNum(volume.cal_max);
    nv.updateGLVolume();
    persistSettings(volume);
  });

  card.querySelector('[data-action="visible"]').addEventListener("change", (e) => {
    volume.visible = e.target.checked;
    nv.updateGLVolume();
    persistSettings(volume);
  });
  card.querySelector('[data-action="colorbar"]').addEventListener("change", (e) => {
    volume.colorbarVisible = e.target.checked;
    nv.updateGLVolume();
    persistSettings(volume);
  });

  const negCmap = card.querySelector('[data-action="colormapNegative"]');
  if (negCmap) {
    negCmap.addEventListener("change", (e) => {
      try { nv.setColormapNegative(volume.id, e.target.value || ""); } catch {}
      nv.updateGLVolume();
      persistSettings(volume);
    });
  }
  const negMin = card.querySelector('[data-action="calMinNeg"]');
  if (negMin) {
    negMin.addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      volume.cal_minNeg = Number.isNaN(v) ? undefined : v;
      nv.updateGLVolume();
      persistSettings(volume);
    });
  }
  const negMax = card.querySelector('[data-action="calMaxNeg"]');
  if (negMax) {
    negMax.addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      volume.cal_maxNeg = Number.isNaN(v) ? undefined : v;
      nv.updateGLVolume();
      persistSettings(volume);
    });
  }

  card.querySelector('[data-action="autoWindow"]').addEventListener("click", () => {
    try {
      volume.calMinMax(); // re-run NiiVue's robust min/max calculation
    } catch {}
    nv.updateGLVolume();
    renderSidebar();
  });

  card.querySelector('[data-action="remove"]').addEventListener("click", () => {
    try { nv.removeVolume(volume); }
    catch { volume.visible = false; nv.updateGLVolume(); }
    fourDVolumeIds.delete(volume.id);
    renderSidebar();
  });
}

// ---------------------------------------------------------------------------
// HUD (crosshair + voxel intensity readout)
// ---------------------------------------------------------------------------

function onLocationChange(data) {
  if (!data) return;
  if (data.mm && data.mm.length >= 3) {
    $("#hudMm").textContent = Array.from(data.mm).slice(0, 3).map((v) => fmtNum(v, 1)).join(", ");
  }
  if (data.vox && data.vox.length >= 3) {
    $("#hudVox").textContent = Array.from(data.vox).slice(0, 3).map((v) => Math.round(v)).join(", ");
  }
  const valuesEl = $("#hudValues");
  valuesEl.innerHTML = "";
  const values = Array.isArray(data.values) ? data.values : [];
  values.forEach((v, i) => {
    const color = LAYER_DOT_COLORS[i % LAYER_DOT_COLORS.length];
    const name = v?.name || v?.id || `layer ${i}`;
    const val = typeof v?.value === "number" ? fmtNum(v.value, 3) : (v?.value ?? "—");
    const block = document.createElement("div");
    block.className = "hud-block";
    block.innerHTML = `<span class="layer-dot" style="background:${color}; color:${color};"></span><span class="hud-label">${name}</span><span class="hud-val">${val}</span>`;
    valuesEl.appendChild(block);
  });
}

// ---------------------------------------------------------------------------
// 4D timepoint slider
// ---------------------------------------------------------------------------

function refreshFrame4dBar() {
  const bar = $("#frame4dBar");
  const select = $("#frame4dSelect");
  const ids = Array.from(fourDVolumeIds).filter((id) => nv.volumes.some((v) => v.id === id));
  fourDVolumeIds.clear();
  ids.forEach((id) => fourDVolumeIds.add(id));

  if (ids.length === 0) {
    bar.classList.remove("show");
    return;
  }
  bar.classList.add("show");

  const prevSelected = select.value;
  select.innerHTML = ids.map((id) => {
    const v = nv.volumes.find((vv) => vv.id === id);
    return `<option value="${id}">${v?.name || id}</option>`;
  }).join("");
  if (ids.includes(prevSelected)) select.value = prevSelected;

  updateFrame4dSliderForSelected();
}

function currentFrame4dVolume() {
  const id = $("#frame4dSelect").value;
  return nv.volumes.find((v) => v.id === id);
}

function updateFrame4dSliderForSelected() {
  const volume = currentFrame4dVolume();
  const slider = $("#frame4dSlider");
  const label = $("#frame4dLabel");
  if (!volume) return;
  const nFrames = volume.nFrame4D || (volume.hdr?.dims?.[4]) || 1;
  slider.max = String(Math.max(0, nFrames - 1));
  slider.value = String(volume.frame4D || 0);
  label.textContent = `frame ${volume.frame4D || 0} / ${nFrames - 1}`;
}

function onFrameChange(volume, frameNumber) {
  if (currentFrame4dVolume()?.id === volume.id) {
    $("#frame4dSlider").value = String(frameNumber);
    const nFrames = volume.nFrame4D || (volume.hdr?.dims?.[4]) || 1;
    $("#frame4dLabel").textContent = `frame ${frameNumber} / ${nFrames - 1}`;
  }
}

// Fires when a distance-measurement drag (start → end) completes. NiiVue also
// draws the line + label directly on the canvas, but we surface the value
// here too — both as a status message and as a persistent HUD readout —
// since the in-canvas label can be easy to miss on a small slice pane.
function onMeasurementCompleted(measurement) {
  const mm = fmtNum(measurement?.distance, 2);
  setStatus(`Measured distance: ${mm} mm`);
  const el = $("#hudMeasure");
  el.style.display = "flex";
  el.querySelector(".hud-val").textContent = `${mm} mm`;
}

function wireFrame4dBar() {
  $("#frame4dSelect").addEventListener("change", updateFrame4dSliderForSelected);
  $("#frame4dSlider").addEventListener("input", (e) => {
    const volume = currentFrame4dVolume();
    if (!volume) return;
    const frame = parseInt(e.target.value, 10);
    nv.setFrame4D(volume.id, frame);
    const nFrames = volume.nFrame4D || (volume.hdr?.dims?.[4]) || 1;
    $("#frame4dLabel").textContent = `frame ${frame} / ${nFrames - 1}`;
  });
  $("#frame4dPlay").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (frame4dTimer) {
      clearInterval(frame4dTimer);
      frame4dTimer = null;
      btn.textContent = "▶";
      return;
    }
    btn.textContent = "⏸";
    frame4dTimer = setInterval(() => {
      const volume = currentFrame4dVolume();
      if (!volume) return;
      const nFrames = volume.nFrame4D || (volume.hdr?.dims?.[4]) || 1;
      const next = ((volume.frame4D || 0) + 1) % nFrames;
      nv.setFrame4D(volume.id, next);
    }, 200);
  });
}

// ---------------------------------------------------------------------------
// 3D clip plane
// ---------------------------------------------------------------------------
// NiiVue's 3D render is direct volume ray-casting, not a mesh: for every
// screen pixel it marches a ray through the voxel data, and each voxel's
// colormap-derived opacity (driven by cal_min/cal_max) decides how much it
// contributes. Low-intensity voxels are given near-zero opacity, which is
// why CSF/background/air fall away and reveal internal structure. A "clip
// plane" just tells that ray-marcher to stop early on one side of a plane
// through the volume, which is the mechanism behind this cutaway-axis tool.

// NiiVue's own clip depth parameter is "distance of the plane from the
// volume's center" — 0 means the plane passes through the center (half the
// volume gone), and larger values push the plane away until nothing is cut.
// That's not how a "cut amount" dial should read (0 ought to mean no cut),
// so we expose 0-100% here and convert to NiiVue's depth internally.
const CLIP_DEPTH_MAX = 1.73; // ~sqrt(3), the volume's half-diagonal in NiiVue's normalized space
function cutPercentToDepth(percent) {
  return CLIP_DEPTH_MAX - (percent / 100) * (2 * CLIP_DEPTH_MAX);
}

function updateClipDepthReadout(percent) {
  const step = parseFloat($("#clipPrecision").value);
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  $("#clipDepthVal").textContent = `${parseFloat(percent).toFixed(decimals)}%`;
}

function applyClipPlane() {
  if (!clip3dOn) {
    nv.setClipPlane(CLIP_DISABLED);
    return;
  }
  const depth = cutPercentToDepth(parseFloat($("#clipDepth").value));
  const azimuth = parseFloat($("#clipAzimuth").value);
  const elevation = parseFloat($("#clipElevation").value);
  nv.setClipPlane([depth, azimuth, elevation]);
}

function setClipAxisPreset(axisName) {
  const preset = CLIP_AXIS_PRESETS[axisName];
  if (!preset) return; // "custom" — leave azimuth/elevation as the user set them
  $("#clipAzimuth").value = preset.azimuth;
  $("#clipElevation").value = preset.elevation;
}

function wireClip3dBar() {
  $("#clipAxis").addEventListener("change", (e) => {
    setClipAxisPreset(e.target.value);
    applyClipPlane();
  });
  $("#clipDepth").addEventListener("input", (e) => {
    updateClipDepthReadout(e.target.value);
    applyClipPlane();
  });
  $("#clipPrecision").addEventListener("change", (e) => {
    const step = e.target.value;
    $("#clipDepth").step = step;
    updateClipDepthReadout($("#clipDepth").value);
  });
  $("#clipAzimuth").addEventListener("input", () => {
    $("#clipAxis").value = "custom";
    applyClipPlane();
  });
  $("#clipElevation").addEventListener("input", () => {
    $("#clipAxis").value = "custom";
    applyClipPlane();
  });
  $("#clipFlip").addEventListener("click", () => {
    // Axial cuts are oriented by elevation (±90 = viewed from top/bottom) —
    // flipping azimuth does nothing useful there since the cut is already
    // horizontal. Sagittal/coronal cuts are oriented by azimuth instead. For
    // a hand-tuned "custom" orientation, guess from whichever the current
    // angle is closer to (steep elevation → axial-like → flip elevation).
    const axis = $("#clipAxis").value;
    const az = $("#clipAzimuth");
    const el = $("#clipElevation");
    const flipElevation = axis === "axial" || (axis === "custom" && Math.abs(parseFloat(el.value)) > 45);
    if (flipElevation) {
      el.value = -parseFloat(el.value);
    } else {
      az.value = (parseFloat(az.value) + 180) % 360;
    }
    // Flipping the plane's facing direction also swaps which side "cut
    // amount" measures from, so complement it — otherwise the same slider
    // value jumps to a mirrored position instead of staying on the slice
    // you were just looking at.
    const depth = $("#clipDepth");
    depth.value = 100 - parseFloat(depth.value);
    updateClipDepthReadout(depth.value);
    applyClipPlane();
  });
  $("#clipCutaway").addEventListener("change", (e) => {
    nv.opts.isClipPlanesCutaway = e.target.checked;
    nv.drawScene();
  });
  $("#clipAllVolumes").addEventListener("change", (e) => {
    nv.opts.isClipAllVolumes = e.target.checked;
    nv.drawScene();
  });
}

// NiiVue's own scroll handling repurposes the mouse wheel in the 3D render
// tile: it zooms UNLESS a clip plane is currently active (depth < 1.8), in
// which case it adjusts clip depth instead — with no option to opt out. To
// keep scroll = zoom always (and leave clip depth to the on-screen slider
// only, as requested), we intercept the wheel event during the capture
// phase — before it reaches NiiVue's own bubble-phase listener on the
// canvas — and, when clipping is active and the pointer is over the render
// tile, replicate NiiVue's own zoom step ourselves and stop the event from
// propagating any further.
function wireRenderScrollAlwaysZooms() {
  const canvas = $("#gl");
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.target !== canvas || !clip3dOn) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = nv.uiData?.dpr || 1;
      const x = (e.clientX - rect.left) * dpr;
      const y = (e.clientY - rect.top) * dpr;
      let inRenderTile = false;
      try { inRenderTile = nv.inRenderTile(x, y) >= 0; } catch { inRenderTile = false; }
      if (!inRenderTile) return; // outside the 3D pane — normal slice-scroll behavior is fine as-is

      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY < 0 ? 1.1 : 0.9; // matches NiiVue's own zoom-per-notch factor
      const current = nv.scene.volScaleMultiplier ?? 1;
      nv.scene.volScaleMultiplier = Math.min(2, Math.max(0.1, current * step));
      nv.drawScene();
    },
    { capture: true, passive: false }
  );
}

// ---------------------------------------------------------------------------
// Toolbar wiring
// ---------------------------------------------------------------------------

function wireToolbar() {
  $("#btnOpen").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", (e) => {
    loadFiles(e.target.files);
    e.target.value = "";
  });

  // Layout toggle
  $$("[data-layout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-layout]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.layout;
      const singleSelect = $("#singlePaneSelect");
      singleSelect.style.display = mode === "single" ? "inline-block" : "none";

      if (mode === "single") {
        applySinglePane(singleSelect.value);
      } else {
        nv.setSliceType(nv.sliceTypeMultiplanar);
        const layoutValue = { grid: 2, row: 3, column: 1 }[mode] ?? 2;
        nv.opts.multiplanarLayout = layoutValue;
      }
    });
  });
  $("#singlePaneSelect").addEventListener("change", (e) => applySinglePane(e.target.value));

  function applySinglePane(which) {
    const map = {
      axial: nv.sliceTypeAxial,
      coronal: nv.sliceTypeCoronal,
      sagittal: nv.sliceTypeSagittal,
      render: nv.sliceTypeRender,
    };
    nv.setSliceType(map[which] ?? nv.sliceTypeAxial);
  }

  // 3D render pane toggle (only meaningful in multiplanar layouts)
  $("#chk3d").addEventListener("change", (e) => {
    nv.opts.multiplanarShowRender = e.target.checked
      ? (SHOW_RENDER ? SHOW_RENDER.ALWAYS : 1)
      : (SHOW_RENDER ? SHOW_RENDER.NEVER : 0);
  });

  $("#chkColorbar").addEventListener("change", (e) => {
    nv.opts.isColorbar = e.target.checked;
    nv.updateGLVolume();
  });

  $("#btnClip3d").addEventListener("click", (e) => {
    clip3dOn = !clip3dOn;
    e.currentTarget.classList.toggle("active", clip3dOn);
    $("#clip3dBar").classList.toggle("show", clip3dOn);
    applyClipPlane();

    // Make sure a 3D view is actually visible, or the clip has no visible effect.
    const chk3d = $("#chk3d");
    const singlePaneIsRender = $("#singlePaneSelect").style.display !== "none" && $("#singlePaneSelect").value === "render";
    if (clip3dOn && !chk3d.checked && !singlePaneIsRender) {
      chk3d.checked = true;
      chk3d.dispatchEvent(new Event("change"));
      setStatus("Turned on the 3D render pane so you can see the clip.");
    }
  });

  // Measurement tool.
  // NiiVue splits drag behavior across two options: opts.dragModePrimary
  // (left-click drag — defaults to moving the crosshair, which is what
  // powers click-to-navigate) and opts.dragMode (right/middle-click drag —
  // defaults to contrast windowing). Setting only opts.dragMode leaves the
  // left-click drag most people try first doing its normal crosshair thing,
  // so we drive the primary (left-click) mode here and leave right-click
  // windowing alone.
  $("#btnMeasure").addEventListener("click", (e) => {
    measurementOn = !measurementOn;
    e.currentTarget.classList.toggle("active", measurementOn);
    nv.opts.dragModePrimary = measurementOn ? DRAG_MODE.measurement : DRAG_MODE.crosshair;
    setStatus(measurementOn ? "Measurement mode: left-click-drag between two points on a slice." : "");
  });
  $("#btnClearMeasure").addEventListener("click", () => {
    try { nv.clearAllMeasurements(); } catch {}
    $("#hudMeasure").style.display = "none";
    nv.drawScene?.();
  });

  // Reset view / fit to window
  $("#btnReset").addEventListener("click", () => {
    if (typeof nv.resetScene === "function") {
      try { nv.resetScene(); return; } catch {}
    }
    // Fallback: NiiVue's core keyboard handler binds "r" to reset pan/zoom.
    $("#gl").focus();
    $("#gl").dispatchEvent(new KeyboardEvent("keydown", { key: "r", code: "KeyR", bubbles: true }));
    nv.updateGLVolume();
  });

  // Screenshot.
  // canvas.toBlob()/toDataURL() on a WebGL canvas returns a blank image
  // unless the context was created with preserveDrawingBuffer:true (NiiVue's
  // isn't, for performance). The reliable fix is to force a fresh render and
  // read the backbuffer directly with gl.readPixels() in the same task, then
  // hand those pixels to an ordinary 2D canvas for export.
  $("#btnScreenshot").addEventListener("click", () => {
    try {
      nv.drawScene();
      const canvas = $("#gl");
      const gl = nv.gl;
      const w = canvas.width;
      const h = canvas.height;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // WebGL's origin is bottom-left; flip rows so the PNG comes out right-side up.
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d");
      const imgData = ctx.createImageData(w, h);
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const srcStart = (h - y - 1) * rowBytes;
        imgData.data.set(pixels.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
      }
      ctx.putImageData(imgData, 0, 0);

      out.toBlob((blob) => {
        if (!blob) { setStatus("Screenshot failed.", true); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `niivue-screenshot-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatus("Screenshot saved.");
      }, "image/png");
    } catch (err) {
      console.error(err);
      setStatus(`Screenshot failed: ${err?.message || err}`, true);
    }
  });

  wireFrame4dBar();
  wireClip3dBar();
}

// ---------------------------------------------------------------------------
// Drag & drop
// ---------------------------------------------------------------------------

function wireDropzones() {
  const wrap = $("#canvasWrap");
  const sidebarDz = $("#dropzoneSidebar");

  sidebarDz.addEventListener("click", () => $("#fileInput").click());

  ["dragenter", "dragover"].forEach((evt) => {
    wrap.addEventListener(evt, (e) => { e.preventDefault(); wrap.classList.add("drag"); });
  });
  ["dragleave", "drop"].forEach((evt) => {
    wrap.addEventListener(evt, (e) => { e.preventDefault(); wrap.classList.remove("drag"); });
  });
  wrap.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
  });

  ["dragenter", "dragover"].forEach((evt) => {
    sidebarDz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); sidebarDz.classList.add("drag"); });
  });
  ["dragleave", "drop"].forEach((evt) => {
    sidebarDz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); sidebarDz.classList.remove("drag"); });
  });
  sidebarDz.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
  });
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
// Note: NiiVue's core already binds a large set of shortcuts once the canvas
// has focus (arrow keys step slices, 1-5 switch view modes, "r" resets, "v"
// cycles layouts, etc — see https://niivue.com/docs/gestures/). We only add a
// small number of app-level shortcuts that don't collide with those.

function wireKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key === "Escape" && measurementOn) {
      $("#btnMeasure").click();
    } else if (e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $("#btnScreenshot").click();
    }
  });
}

// ---------------------------------------------------------------------------

init().catch((err) => {
  console.error(err);
  setStatus(`Failed to initialize viewer: ${err?.message || err}`, true);
});
