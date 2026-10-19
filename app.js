import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
};

const PINCH_THRESHOLD = 0.055;
const FRAME_PADDING = 28;
const FREEZE_HOLD_MS = 250;
const COUNTDOWN_SECONDS = 3;
const FIST_HOLD_FRAMES = 12;
const SNAP_DISTANCE_RATIO = 0.45;
const GRID = 3;
const LOAD_TIMEOUT_MS = 20000;

const PHOTOBOOTH_CONTRAST_ALPHA = 1.3;
const PHOTOBOOTH_BRIGHTNESS_BETA = 10;
const PHOTOBOOTH_NOISE_STD = 15;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const videoEl = document.getElementById("webcam");
const canvas = document.getElementById("sceneCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const loadingOverlay = document.getElementById("loadingOverlay");
const loaderText = document.getElementById("loaderText");
const loaderRetry = document.getElementById("loaderRetry");
const errorBanner = document.getElementById("errorBanner");
const progressBadge = document.getElementById("progressBadge");
const progressText = document.getElementById("progressText");

const galleryStrip = document.getElementById("galleryStrip");
const galleryEmpty = document.getElementById("galleryEmpty");
const galleryCount = document.getElementById("galleryCount");
const downloadStripBtn = document.getElementById("downloadStripBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const stripCompleteMsg = document.getElementById("stripCompleteMsg");

const filterToast = document.getElementById("filterToast");
const filterToastIcon = document.getElementById("filterToastIcon");
const filterToastName = document.getElementById("filterToastName");
const filterToastSub = document.getElementById("filterToastSub");
const filterToastBadge = document.getElementById("filterToastBadge");
const filterChipsContainer = document.getElementById("filterChips");
const camModeToggle = document.getElementById("camModeToggle");
const camModeLabel = document.getElementById("camModeLabel");

let appState = "tracking";

const puzzle = {
  boardBox: null,
  pieces: [],
  solved: false,
  tileW: 0,
  tileH: 0,
  rawCropCanvas: null,
};

const SHATTER_COLS = 6;
const SHATTER_ROWS = 6;
const SHATTER_DURATION_MS = 850;
const shatter = {
  active: false,
  startedAt: 0,
  fragments: [],
  pendingCanvas: null,
};

const STRIP_MAX_PHOTOS = 3;
const galleryEntries = [];

function addToGallery(snapshotCanvas) {
  if (galleryEntries.length >= STRIP_MAX_PHOTOS) return;

  galleryEntries.push({ canvas: snapshotCanvas, time: Date.now() });
  renderGalleryThumb(snapshotCanvas, galleryEntries.length);
  galleryCount.textContent = `${galleryEntries.length} / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) galleryEmpty.style.display = "none";

  if (galleryEntries.length >= STRIP_MAX_PHOTOS) {
    showStripComplete();
  }
}

function isStripFull() {
  return galleryEntries.length >= STRIP_MAX_PHOTOS;
}

function showStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.add("visible");
  updateStripDownloadAvailability();
}

function hideStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.remove("visible");
}

function updateStripDownloadAvailability() {
  if (!downloadStripBtn) return;
  downloadStripBtn.disabled = galleryEntries.length === 0;
}

const STRIP_FILE_BORDER = 24;
const STRIP_FILE_GAP = 16;
const STRIP_FILE_BG = "#ffffff";

function downloadPhotoStrip() {
  if (galleryEntries.length === 0) return;

  const entries = galleryEntries;
  const targetW = entries[0].canvas.width;
  const scaledHeights = entries.map((entry) =>
    Math.round(entry.canvas.height * (targetW / entry.canvas.width))
  );

  const totalH =
    STRIP_FILE_BORDER * 2 +
    scaledHeights.reduce((sum, h) => sum + h, 0) +
    STRIP_FILE_GAP * (entries.length - 1);
  const totalW = targetW + STRIP_FILE_BORDER * 2;

  const stripCanvas = document.createElement("canvas");
  stripCanvas.width = totalW;
  stripCanvas.height = totalH;
  const stripCtx = stripCanvas.getContext("2d");

  stripCtx.fillStyle = STRIP_FILE_BG;
  stripCtx.fillRect(0, 0, totalW, totalH);

  let cursorY = STRIP_FILE_BORDER;
  entries.forEach((entry, i) => {
    const h = scaledHeights[i];
    stripCtx.drawImage(entry.canvas, STRIP_FILE_BORDER, cursorY, targetW, h);
    cursorY += h + STRIP_FILE_GAP;
  });

  stripCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `puzzlecam_photobooth_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

function resetEverything() {
  galleryEntries.length = 0;
  galleryStrip.innerHTML = "";
  galleryCount.textContent = `0 / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) {
    galleryEmpty.style.display = "block";
    galleryStrip.appendChild(galleryEmpty);
  }
  hideStripComplete();
  updateStripDownloadAvailability();
  resetPuzzleOnly();
  statusText.textContent = "everything reset";
}

function renderGalleryThumb(snapshotCanvas, index) {
  const print = document.createElement("div");
  print.className = "print";

  const thumbCanvas = document.createElement("canvas");
  const THUMB_W = 220;
  const scale = THUMB_W / snapshotCanvas.width;
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = Math.round(snapshotCanvas.height * scale);
  thumbCanvas.getContext("2d").drawImage(snapshotCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  const label = document.createElement("div");
  label.className = "print-label";
  label.textContent = `#${String(index).padStart(2, "0")}`;

  print.appendChild(thumbCanvas);
  print.appendChild(label);
  galleryStrip.insertBefore(print, galleryStrip.firstChild);
}

function resetPuzzleOnly() {
  puzzle.boardBox = null;
  puzzle.pieces = [];
  puzzle.solved = false;
  puzzle.fullPhotoboothCanvas = null;
  puzzle.rawCropCanvas = null;
  appState = "tracking";
  countdown.active = false;
  drag.activeHand = null;
  drag.piece = null;
  shatter.active = false;
  shatter.fragments = [];
  shatter.pendingCanvas = null;
  fistHoldCounter = 0;
  lastSeenFrame.box = null;
  lastSeenFrame.at = 0;
  updateProgressBadge();
}

function fitCanvasToWindow() {
  const stageEl = document.getElementById("stage");
  const vw = stageEl.clientWidth;
  const vh = stageEl.clientHeight;
  const videoAspect = canvas.width / canvas.height;
  const containerAspect = vw / vh;

  let cssWidth, cssHeight;
  if (containerAspect > videoAspect) {
    cssWidth = vw;
    cssHeight = vw / videoAspect;
  } else {
    cssHeight = vh;
    cssWidth = vh * videoAspect;
  }

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
}

window.addEventListener("resize", fitCanvasToWindow);

async function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support getUserMedia.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  videoEl.srcObject = stream;

  await new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      resolve();
    };
  });

  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  fitCanvasToWindow();
}

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function initHandLandmarker() {
  let vision;
  try {
    vision = await withTimeout(
      FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      ),
      LOAD_TIMEOUT_MS,
      "Timed out loading the MediaPipe runtime (WASM). Check your internet connection or if cdn.jsdelivr.net is blocked."
    );
  } catch (err) {
    throw err;
  }

  try {
    const handLandmarker = await withTimeout(
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "video",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      }),
      LOAD_TIMEOUT_MS,
      "Timed out downloading the HandLandmarker model (~10MB) with GPU."
    );
    return handLandmarker;
  } catch (gpuErr) {
    console.warn("[PuzzleCam] GPU delegate failed, retrying with CPU…", gpuErr);
  }

  try {
    const handLandmarker = await withTimeout(
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "video",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      }),
      LOAD_TIMEOUT_MS,
      "Timed out downloading the HandLandmarker model (~10MB) even with CPU. Check your connection or if storage.googleapis.com is blocked on your network."
    );
    return handLandmarker;
  } catch (cpuErr) {
    throw cpuErr;
  }
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isPinching(landmarks) {
  return dist2D(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]) < PINCH_THRESHOLD;
}

function isFist(landmarks) {
  const wrist = landmarks[LM.WRIST];
  const pairs = [
    [LM.INDEX_TIP, LM.INDEX_MCP],
    [LM.MIDDLE_TIP, LM.MIDDLE_MCP],
    [LM.RING_TIP, LM.RING_MCP],
    [LM.PINKY_TIP, LM.PINKY_MCP],
  ];
  let curled = 0;
  for (const [tipIdx, mcpIdx] of pairs) {
    if (dist2D(landmarks[tipIdx], wrist) < dist2D(landmarks[mcpIdx], wrist)) curled++;
  }
  return curled >= 4;
}

function toPixel(landmarkNorm) {
  return { x: landmarkNorm.x * canvas.width, y: landmarkNorm.y * canvas.height };
}

function mirrorLandmarkX(landmark) {
  return { x: 1 - landmark.x, y: landmark.y };
}

function computeHandFrame(indexTipA, indexTipB) {
  const a = toPixel(indexTipA);
  const b = toPixel(indexTipB);

  const minX = Math.min(a.x, b.x) - FRAME_PADDING;
  const maxX = Math.max(a.x, b.x) + FRAME_PADDING;
  const minY = Math.min(a.y, b.y) - FRAME_PADDING;
  const maxY = Math.max(a.y, b.y) + FRAME_PADDING;

  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  const width = Math.min(canvas.width, maxX) - x;
  const height = Math.min(canvas.height, maxY) - y;

  return { x, y, width, height };
}

const freezeGate = { holding: false, since: 0 };

const FRAME_GRACE_MS = 450;
const lastSeenFrame = { box: null, at: 0 };

const countdown = {
  active: false,
  startedAt: 0,
};

function startCountdown(frameBox) {
  puzzle.boardBox = { ...frameBox };
  appState = "countdown";
  countdown.active = true;
  countdown.startedAt = performance.now();
}

function drawCountdownOverlay(box) {
  const elapsed = (performance.now() - countdown.startedAt) / 1000;
  const remaining = COUNTDOWN_SECONDS - elapsed;

  if (remaining <= 0) {
    finishCountdownAndCapture(box);
    return;
  }

  applyActiveFilterToBox(box);

  const filter = FILTERS[currentFilterIndex];
  ctx.save();
  ctx.strokeStyle = filter.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const n = Math.ceil(remaining);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  ctx.fillStyle = "rgba(10, 10, 24, 0.55)";
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.font = `bold ${Math.max(48, Math.min(box.width, box.height) * 0.42)}px 'Orbitron', monospace`;
  ctx.fillStyle = filter.color;
  ctx.shadowColor = filter.glow;
  ctx.shadowBlur = 28;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), cx, cy);
  ctx.restore();

  statusText.textContent = `capturing in ${n}… [${filter.name}]`;
}

function gaussianNoise(std) {
  const u1 = Math.random() || 1e-6;
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * std;
}

// ─── AESTHETIC FILTER PALETTES & ALGORITHMS ───────────────

const THERMAL_LUT = new Uint8ClampedArray(256 * 3);
(function initThermalLUT() {
  const stops = [
    { p: 0.00, r: 8,   g: 0,   b: 36  },
    { p: 0.18, r: 0,   g: 25,  b: 170 },
    { p: 0.38, r: 0,   g: 195, b: 215 },
    { p: 0.60, r: 35,  g: 215, b: 45  },
    { p: 0.78, r: 235, g: 145, b: 0   },
    { p: 0.92, r: 245, g: 30,  b: 20  },
    { p: 1.00, r: 255, g: 255, b: 245 },
  ];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s0 = stops[0], s1 = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].p && t <= stops[s + 1].p) {
        s0 = stops[s];
        s1 = stops[s + 1];
        break;
      }
    }
    const span = s1.p - s0.p || 1;
    const f = (t - s0.p) / span;
    const off = i * 3;
    THERMAL_LUT[off]     = Math.round(s0.r + (s1.r - s0.r) * f);
    THERMAL_LUT[off + 1] = Math.round(s0.g + (s1.g - s0.g) * f);
    THERMAL_LUT[off + 2] = Math.round(s0.b + (s1.b - s0.b) * f);
  }
})();

function applyOriginalPhotoboothFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = gray * PHOTOBOOTH_CONTRAST_ALPHA + PHOTOBOOTH_BRIGHTNESS_BETA;
    v += gaussianNoise(PHOTOBOOTH_NOISE_STD);
    v = Math.max(0, Math.min(255, v));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return imageData;
}

function applyNoirFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = (gray - 128) * 1.36 + 128 + 8 + gaussianNoise(12);
    v = Math.max(0, Math.min(255, v));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return imageData;
}

function applyVaporwaveFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i]     = Math.min(255, Math.max(30, r * 1.22 + 25));
    d[i + 1] = Math.min(255, Math.max(16, g * 0.84 + 14));
    d[i + 2] = Math.min(255, Math.max(52, b * 1.38 + 42));
  }
  return imageData;
}

function applyVHSFilter(imageData) {
  const d = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const src = new Uint8ClampedArray(d);
  const shift = 4;
  for (let y = 0; y < h; y++) {
    const scanline = (y % 3 === 0) ? 0.82 : 1.0;
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const idx = (rowOffset + x) * 4;
      const rIdx = (rowOffset + Math.max(0, x - shift)) * 4;
      const bIdx = (rowOffset + Math.min(w - 1, x + shift)) * 4;
      d[idx]     = Math.min(255, src[rIdx] * 1.18 * scanline + 10);
      d[idx + 1] = Math.min(255, src[idx + 1] * 1.02 * scanline);
      d[idx + 2] = Math.min(255, src[bIdx + 2] * 1.25 * scanline + 16);
    }
  }
  return imageData;
}

function applyGoldenFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i]     = Math.min(255, r * 1.28 + 22);
    d[i + 1] = Math.min(255, g * 1.10 + 10);
    d[i + 2] = Math.max(0, Math.min(255, b * 0.80 - 6));
  }
  return imageData;
}

function applyMatrixFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8;
    d[i]     = Math.min(255, lum * 0.12);
    d[i + 1] = Math.min(255, lum * 1.42 + 24);
    d[i + 2] = Math.min(255, lum * 0.32);
  }
  return imageData;
}

function applyThermalFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8;
    const off = lum * 3;
    d[i]     = THERMAL_LUT[off];
    d[i + 1] = THERMAL_LUT[off + 1];
    d[i + 2] = THERMAL_LUT[off + 2];
  }
  return imageData;
}

function applyVintageFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (77 * r + 150 * g + 29 * b) >> 8;
    const norm = lum / 255;

    // 1. Base 1970s Kodachrome warm golden palette
    let newR = r * 1.18 + 12;
    let newG = g * 1.10 + 8;
    let newB = b * 0.80 + 8;

    // 2. Vintage 70s Turquoise/Teal shift for blue spectrum (vintage car, summer sky)
    if (b > r + 8 && b > 55) {
      const tealAmount = Math.min(1, (b - r) / 60);
      newG += tealAmount * 28;
      newB = b * 1.10 + 14;
      newR = Math.max(0, newR - tealAmount * 18);
    }

    // 3. Poppy 70s vermilion reds (warm, punchy vintage red)
    if (r > g + 20 && r > b + 20) {
      newR = Math.min(255, newR * 1.15 + 10);
      newG = Math.max(0, newG * 0.94);
    }

    // 4. Lifted faded film blacks (warm olive/amber toe instead of harsh 0 black)
    if (norm < 0.35) {
      const lift = ((0.35 - norm) / 0.35) * 24;
      newR += lift * 0.90;
      newG += lift * 1.00;
      newB += lift * 0.70;
    }

    // 5. Creamy vanilla/butter highlight roll-off (sun-drenched whites)
    if (norm > 0.58) {
      const h = (norm - 0.58) / 0.42;
      newR += h * 24;
      newG += h * 18;
      newB = Math.max(0, newB - h * 22);
    }

    // 6. Subtle 35mm film grain
    const grain = (Math.random() - 0.5) * 8;
    newR += grain;
    newG += grain;
    newB += grain;

    d[i]     = Math.max(0, Math.min(255, newR));
    d[i + 1] = Math.max(0, Math.min(255, newG));
    d[i + 2] = Math.max(0, Math.min(255, newB));
  }
  return imageData;
}

function applyAnimeFilter(imageData) {
  const d = imageData.data;
  const steps = 4;
  const stepSize = 256 / steps;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (77 * r + 150 * g + 29 * b) >> 8;
    const quant = Math.floor(lum / stepSize) * (255 / (steps - 1));
    const factor = quant / Math.max(1, lum);
    d[i]     = Math.min(255, Math.max(0, r * factor * 1.16));
    d[i + 1] = Math.min(255, Math.max(0, g * factor * 1.10));
    d[i + 2] = Math.min(255, Math.max(0, b * factor * 1.16));
  }
  return imageData;
}

function applyRawFilter(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.min(255, d[i] * 1.04);
    d[i + 1] = Math.min(255, d[i + 1] * 1.04);
    d[i + 2] = Math.min(255, d[i + 2] * 1.04);
  }
  return imageData;
}

const FILTERS = [
  {
    id: "original",
    key: "1",
    name: "PHOTOBOOTH",
    subtitle: "Original B&W",
    icon: "📷",
    color: "#e8e4ff",
    glow: "rgba(232, 228, 255, 0.6)",
    apply: applyOriginalPhotoboothFilter,
  },
  {
    id: "noir",
    key: "2",
    name: "NOIR B&W",
    subtitle: "Silver Gelatin",
    icon: "🖤",
    color: "#e2e8f0",
    glow: "rgba(226, 232, 240, 0.5)",
    apply: applyNoirFilter,
  },
  {
    id: "vaporwave",
    key: "3",
    name: "VAPORWAVE",
    subtitle: "80s Sunset",
    icon: "🌸",
    color: "#f472b6",
    glow: "rgba(244, 114, 182, 0.6)",
    apply: applyVaporwaveFilter,
  },
  {
    id: "vhs",
    key: "4",
    name: "VHS GLITCH",
    subtitle: "Analog Tape",
    icon: "📼",
    color: "#fb7185",
    glow: "rgba(251, 113, 133, 0.6)",
    apply: applyVHSFilter,
  },
  {
    id: "golden",
    key: "5",
    name: "GOLDEN HOUR",
    subtitle: "Amber Sunlight",
    icon: "🌅",
    color: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.6)",
    apply: applyGoldenFilter,
  },
  {
    id: "matrix",
    key: "6",
    name: "MATRIX",
    subtitle: "Cyber Terminal",
    icon: "💻",
    color: "#22c55e",
    glow: "rgba(34, 197, 94, 0.6)",
    apply: applyMatrixFilter,
  },
  {
    id: "thermal",
    key: "7",
    name: "THERMAL",
    subtitle: "Heatmap Vision",
    icon: "🔥",
    color: "#ef4444",
    glow: "rgba(239, 68, 68, 0.6)",
    apply: applyThermalFilter,
  },
  {
    id: "vintage",
    key: "8",
    name: "1970s FILM",
    subtitle: "Kodachrome",
    icon: "🎞️",
    color: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.6)",
    apply: applyVintageFilter,
  },
  {
    id: "anime",
    key: "9",
    name: "ANIME POP",
    subtitle: "Cel-Shaded",
    icon: "🎨",
    color: "#a855f7",
    glow: "rgba(168, 85, 247, 0.6)",
    apply: applyAnimeFilter,
  },
  {
    id: "raw",
    key: "0",
    name: "NATURAL",
    subtitle: "True Color",
    icon: "✨",
    color: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.6)",
    apply: applyRawFilter,
  },
];

let currentFilterIndex = 0;
let fullCameraFilterEnabled = false;

function applyActiveFilter(imageData) {
  const active = FILTERS[currentFilterIndex];
  if (active && typeof active.apply === "function") {
    active.apply(imageData);
  }
  return imageData;
}

let audioCtx = null;
function playFilterSwitchSound(freq = 460) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, audioCtx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {}
}

let toastTimer = null;
function showFilterToast(filter) {
  if (!filterToast) return;
  if (filterToastIcon) filterToastIcon.textContent = filter.icon;
  if (filterToastName) filterToastName.textContent = filter.name;
  if (filterToastSub) filterToastSub.textContent = `${filter.subtitle} • Key [${filter.key}]`;
  if (filterToastBadge) filterToastBadge.textContent = `[${filter.key}]`;
  filterToast.style.borderColor = filter.color;
  filterToast.style.boxShadow = `0 0 24px ${filter.glow}, 0 8px 32px rgba(0,0,0,0.6)`;
  filterToast.classList.add("visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    filterToast.classList.remove("visible");
  }, 1600);
}

function setFilter(index, playSound = true) {
  currentFilterIndex = (index + FILTERS.length) % FILTERS.length;
  const filter = FILTERS[currentFilterIndex];

  if (filterChipsContainer) {
    const chips = filterChipsContainer.querySelectorAll(".filter-chip");
    chips.forEach((chip, i) => {
      chip.classList.toggle("active", i === currentFilterIndex);
      if (i === currentFilterIndex) {
        chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    });
  }

  showFilterToast(filter);

  if (playSound) {
    playFilterSwitchSound(380 + currentFilterIndex * 35);
  }

  if (appState === "puzzle" && puzzle.rawCropCanvas) {
    reapplyFilterToPuzzle();
  }
}

function toggleCamMode() {
  fullCameraFilterEnabled = !fullCameraFilterEnabled;
  if (camModeToggle && camModeLabel) {
    camModeToggle.classList.toggle("active-full", fullCameraFilterEnabled);
    camModeLabel.textContent = fullCameraFilterEnabled ? "FULL CAM" : "FRAME ONLY";
  }
  playFilterSwitchSound(620);
}

function reapplyFilterToPuzzle() {
  if (!puzzle.rawCropCanvas || !puzzle.pieces.length) return;
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = puzzle.rawCropCanvas.width;
  cropCanvas.height = puzzle.rawCropCanvas.height;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(puzzle.rawCropCanvas, 0, 0);

  const imgData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
  applyActiveFilter(imgData);
  cropCtx.putImageData(imgData, 0, 0);
  puzzle.fullPhotoboothCanvas = cropCanvas;

  for (const piece of puzzle.pieces) {
    const sx = piece.col * puzzle.tileW;
    const sy = piece.row * puzzle.tileH;
    const pctx = piece.canvas.getContext("2d");
    pctx.clearRect(0, 0, piece.w, piece.h);
    pctx.drawImage(cropCanvas, sx, sy, piece.w, piece.h, 0, 0, piece.w, piece.h);
  }
}

let filterUIInitialized = false;
function initFilterUI() {
  if (!filterChipsContainer) return;
  filterChipsContainer.innerHTML = "";

  FILTERS.forEach((filter, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `filter-chip ${idx === currentFilterIndex ? "active" : ""}`;
    chip.style.setProperty("--chip-color", filter.color);
    chip.style.setProperty("--chip-glow", filter.glow);
    chip.innerHTML = `
      <span class="chip-key">[${filter.key}]</span>
      <span class="chip-icon">${filter.icon}</span>
      <span class="chip-name">${filter.name}</span>
    `;
    chip.addEventListener("click", () => {
      setFilter(idx, true);
    });
    filterChipsContainer.appendChild(chip);
  });

  if (filterUIInitialized) return;
  filterUIInitialized = true;

  if (camModeToggle) {
    camModeToggle.addEventListener("click", () => {
      toggleCamMode();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const key = e.key;

    const filterKeyMap = {
      "1": 0, "2": 1, "3": 2, "4": 3, "5": 4,
      "6": 5, "7": 6, "8": 7, "9": 8, "0": 9,
    };

    if (key in filterKeyMap) {
      e.preventDefault();
      setFilter(filterKeyMap[key]);
      return;
    }

    if (key.toLowerCase() === "f") {
      e.preventDefault();
      setFilter(currentFilterIndex + 1);
      return;
    }

    if (key === "ArrowRight") {
      e.preventDefault();
      setFilter(currentFilterIndex + 1);
      return;
    }
    if (key === "ArrowLeft") {
      e.preventDefault();
      setFilter(currentFilterIndex - 1);
      return;
    }

    if (key.toLowerCase() === "c") {
      e.preventDefault();
      toggleCamMode();
      return;
    }
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function finishCountdownAndCapture(box) {
  countdown.active = false;

  const mirroredFrame = document.createElement("canvas");
  mirroredFrame.width = canvas.width;
  mirroredFrame.height = canvas.height;
  const mirroredCtx = mirroredFrame.getContext("2d");
  mirroredCtx.save();
  mirroredCtx.translate(mirroredFrame.width, 0);
  mirroredCtx.scale(-1, 1);
  mirroredCtx.drawImage(videoEl, 0, 0, mirroredFrame.width, mirroredFrame.height);
  mirroredCtx.restore();

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.max(1, Math.round(box.width));
  cropCanvas.height = Math.max(1, Math.round(box.height));
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(
    mirroredFrame,
    box.x, box.y, box.width, box.height,
    0, 0, cropCanvas.width, cropCanvas.height
  );

  // Preserve raw un-filtered image for live filter switching on puzzle pieces
  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = cropCanvas.width;
  rawCanvas.height = cropCanvas.height;
  rawCanvas.getContext("2d").drawImage(cropCanvas, 0, 0);
  puzzle.rawCropCanvas = rawCanvas;

  const fullImageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
  applyActiveFilter(fullImageData);
  cropCtx.putImageData(fullImageData, 0, 0);

  puzzle.fullPhotoboothCanvas = cropCanvas;

  const tileW = Math.floor(cropCanvas.width / GRID);
  const tileH = Math.floor(cropCanvas.height / GRID);
  const pieces = [];

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const sx = col * tileW;
      const sy = row * tileH;
      const w = col === GRID - 1 ? cropCanvas.width - sx : tileW;
      const h = row === GRID - 1 ? cropCanvas.height - sy : tileH;

      const pieceCanvas = document.createElement("canvas");
      pieceCanvas.width = w;
      pieceCanvas.height = h;
      pieceCanvas.getContext("2d").drawImage(cropCanvas, sx, sy, w, h, 0, 0, w, h);

      pieces.push({
        row, col,
        canvas: pieceCanvas,
        w, h,
        x: 0, y: 0,
        placed: false,
        dragging: false,
      });
    }
  }

  const slots = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      slots.push({ x: box.x + col * tileW, y: box.y + row * tileH });
    }
  }
  shuffle(slots);

  pieces.forEach((piece, i) => {
    piece.x = slots[i].x;
    piece.y = slots[i].y;
    if (isNearOwnCell(piece, box, tileW, tileH)) {
      snapPieceToCell(piece, box, tileW, tileH);
    }
  });

  puzzle.boardBox = box;
  puzzle.pieces = pieces;
  puzzle.tileW = tileW;
  puzzle.tileH = tileH;
  puzzle.solved = pieces.every((p) => p.placed);
  appState = "puzzle";
  fistHoldCounter = 0;
  updateProgressBadge();
}

const drag = {
  activeHand: null,
  piece: null,
  offsetX: 0,
  offsetY: 0,
};

function isNearOwnCell(piece, box, tileW, tileH) {
  const correctX = box.x + piece.col * tileW;
  const correctY = box.y + piece.row * tileH;
  const dx = piece.x - correctX;
  const dy = piece.y - correctY;
  const tolerance = Math.min(tileW, tileH) * SNAP_DISTANCE_RATIO;
  return Math.sqrt(dx * dx + dy * dy) < tolerance;
}

function reconcilePlacedState(box, tileW, tileH) {
  if (!box || !puzzle.pieces.length) return false;
  for (const piece of puzzle.pieces) {
    if (piece.displacing || piece.dragging) continue;
    piece.placed = isNearOwnCell(piece, box, tileW, tileH);
  }
  return puzzle.pieces.every((p) => p.placed);
}

function snapPieceToCell(piece, box, tileW, tileH) {
  displaceCellOccupant(piece, piece.row, piece.col, box, tileW, tileH);
  piece.x = box.x + piece.col * tileW;
  piece.y = box.y + piece.row * tileH;
  piece.placed = true;
}

function displaceCellOccupant(piece, targetRow, targetCol, box, tileW, tileH) {
  const cellX = box.x + targetCol * tileW;
  const cellY = box.y + targetRow * tileH;

  const occupant = puzzle.pieces.find((p) => {
    if (p === piece || p.displacing) return false;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    return (
      cx >= cellX && cx < cellX + tileW &&
      cy >= cellY && cy < cellY + tileH
    );
  });
  if (!occupant) return;

  if (occupant.row === targetRow && occupant.col === targetCol && occupant.placed) {
    return;
  }

  occupant.placed = false;

  const freeCells = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (row === targetRow && col === targetCol) continue;
      const cx0 = box.x + col * tileW;
      const cy0 = box.y + row * tileH;
      const taken = puzzle.pieces.some((p) => {
        if (p === occupant || p === piece || p.displacing) return false;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        return cx >= cx0 && cx < cx0 + tileW && cy >= cy0 && cy < cy0 + tileH;
      });
      if (!taken) freeCells.push({ row, col });
    }
  }

  let targetSlot;
  if (freeCells.length > 0) {
    targetSlot = freeCells[Math.floor(Math.random() * freeCells.length)];
  } else {
    targetSlot = { row: occupant.row, col: occupant.col };
  }

  const jitterX = (Math.random() - 0.5) * tileW * 0.5;
  const jitterY = (Math.random() - 0.5) * tileH * 0.5;
  const targetX = box.x + targetSlot.col * tileW + jitterX;
  const targetY = box.y + targetSlot.row * tileH + jitterY;

  animateDisplacement(occupant, targetX, targetY, box);
}

const DISPLACE_ANIM_MS = 220;

function animateDisplacement(piece, targetX, targetY, box) {
  const startX = piece.x;
  const startY = piece.y;
  const startedAt = performance.now();

  piece.displacing = true;

  function step() {
    const t = Math.min(1, (performance.now() - startedAt) / DISPLACE_ANIM_MS);
    const eased = 1 - Math.pow(1 - t, 3);

    piece.x = startX + (targetX - startX) * eased;
    piece.y = startY + (targetY - startY) * eased;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      piece.x = targetX;
      piece.y = targetY;
      piece.displacing = false;
      clampPieceToBoard(piece);
    }
  }

  requestAnimationFrame(step);
}

function findNearestPiece(px, py) {
  let best = null;
  let bestDist = Infinity;
  for (const piece of puzzle.pieces) {
    if (piece.displacing) continue;
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    const d = Math.hypot(px - cx, py - cy);
    if (d < Math.max(piece.w, piece.h) * 0.75 && d < bestDist) {
      best = piece;
      bestDist = d;
    }
  }
  return best;
}

function handleDragForHand(handLabel, pinching, indexPx) {
  if (pinching) {
    if (drag.activeHand === null) {
      const candidate = findNearestPiece(indexPx.x, indexPx.y);
      if (candidate) {
        drag.activeHand = handLabel;
        drag.piece = candidate;
        drag.offsetX = indexPx.x - candidate.x;
        drag.offsetY = indexPx.y - candidate.y;
        candidate.dragging = true;
        candidate.placed = false;
      }
    } else if (drag.activeHand === handLabel && drag.piece) {
      drag.piece.x = indexPx.x - drag.offsetX;
      drag.piece.y = indexPx.y - drag.offsetY;
    }
  } else {
    if (drag.activeHand === handLabel && drag.piece) {
      const piece = drag.piece;
      piece.dragging = false;
      if (isNearOwnCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH)) {
        snapPieceToCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      } else {
        clampPieceToBoard(piece);
        const box = puzzle.boardBox;
        const cx = piece.x + piece.w / 2;
        const cy = piece.y + piece.h / 2;
        const dropCol = Math.min(
          GRID - 1,
          Math.max(0, Math.floor((cx - box.x) / puzzle.tileW))
        );
        const dropRow = Math.min(
          GRID - 1,
          Math.max(0, Math.floor((cy - box.y) / puzzle.tileH))
        );
        displaceCellOccupant(piece, dropRow, dropCol, box, puzzle.tileW, puzzle.tileH);
      }
      drag.activeHand = null;
      drag.piece = null;
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
    }
  }
}

function clampPieceToBoard(piece) {
  const box = puzzle.boardBox;
  piece.x = Math.min(Math.max(piece.x, box.x), box.x + box.width - piece.w);
  piece.y = Math.min(Math.max(piece.y, box.y), box.y + box.height - piece.h);
}

function drawBoardAndPieces() {
  const box = puzzle.boardBox;

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(245,197,24,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(box.x + i * puzzle.tileW, box.y);
    ctx.lineTo(box.x + i * puzzle.tileW, box.y + box.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + i * puzzle.tileH);
    ctx.lineTo(box.x + box.width, box.y + i * puzzle.tileH);
    ctx.stroke();
  }
  ctx.restore();

  const sorted = [...puzzle.pieces].sort((a, b) => (a.dragging ? 1 : 0) - (b.dragging ? 1 : 0));

  for (const piece of sorted) {
    ctx.save();
    if (piece.dragging) {
      ctx.shadowColor = "rgba(245,197,24,0.9)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(piece.canvas, piece.x, piece.y, piece.w, piece.h);
    ctx.strokeStyle = piece.placed ? "#5fae6e" : "rgba(234,229,214,0.5)";
    ctx.lineWidth = piece.dragging ? 3 : 1.5;
    ctx.strokeRect(piece.x, piece.y, piece.w, piece.h);
    ctx.restore();
  }

  const filter = FILTERS[currentFilterIndex];
  ctx.save();
  ctx.strokeStyle = puzzle.solved ? "#34d399" : filter.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  if (puzzle.solved) {
    ctx.save();
    ctx.fillStyle = "rgba(52,211,153,0.15)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.font = `${Math.max(20, box.width * 0.07)}px 'Orbitron', monospace`;
    ctx.fillStyle = "#34d399";
    ctx.shadowColor = "rgba(52,211,153,0.8)";
    ctx.shadowBlur = 16;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("COMPLETE! — fist to save", box.x + box.width / 2, box.y + box.height / 2);
    ctx.restore();
  }
}

function updateProgressBadge() {
  if (appState !== "puzzle") {
    progressBadge.classList.remove("visible", "solved");
    return;
  }
  const placedCount = puzzle.pieces.filter((p) => p.placed).length;
  progressText.textContent = `${placedCount} / ${puzzle.pieces.length} pieces placed`;
  progressBadge.classList.add("visible");
  progressBadge.classList.toggle("solved", puzzle.solved);
}

function drawVideoFrame() {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (fullCameraFilterEnabled && appState === "tracking") {
    const fullImg = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyActiveFilter(fullImg);
    ctx.putImageData(fullImg, 0, 0);
  }
}

function applyActiveFilterToBox(box) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(canvas.width - x, Math.round(box.width));
  const h = Math.min(canvas.height - y, Math.round(box.height));
  if (w <= 0 || h <= 0) return;

  const region = ctx.getImageData(x, y, w, h);
  applyActiveFilter(region);
  ctx.putImageData(region, x, y);
}

function drawLiveFrameOverlay(box) {
  const filter = FILTERS[currentFilterIndex];
  ctx.save();
  ctx.strokeStyle = filter.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const cornerLen = 20;
  ctx.lineWidth = 4;
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + cornerLen * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + cornerLen * dx, cy);
    ctx.stroke();
  }

  // Floating filter label above frame
  ctx.font = "bold 11px 'Space Mono', monospace";
  ctx.fillStyle = filter.color;
  ctx.shadowColor = filter.glow;
  ctx.shadowBlur = 12;
  ctx.fillText(
    `${filter.icon} ${filter.name} [KEY ${filter.key}]`,
    box.x + 8,
    Math.max(22, box.y - 10)
  );
  ctx.restore();
}

function isPointInBoard(px, py, box) {
  if (!box) return false;
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

function drawHandSkeleton(landmarksPx) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.85)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;

  for (const [iA, iB] of HAND_CONNECTIONS) {
    const a = landmarksPx[iA];
    const b = landmarksPx[iB];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.shadowBlur = 6;
  ctx.fillStyle = "white";
  for (const p of landmarksPx) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHandSkeletonsOverBoard(handsLandmarks, box) {
  if (!box || !handsLandmarks || handsLandmarks.length === 0) return;

  for (const lm of handsLandmarks) {
    const landmarksPx = lm.map((pt) => toPixel(mirrorLandmarkX(pt)));
    const overBoard = landmarksPx.some((p) => isPointInBoard(p.x, p.y, box));
    if (overBoard) {
      drawHandSkeleton(landmarksPx);
    }
  }
}

function startShatter(sourceCanvas, box) {
  const cols = SHATTER_COLS;
  const rows = SHATTER_ROWS;
  const fragW = sourceCanvas.width / cols;
  const fragH = sourceCanvas.height / rows;
  const fragments = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = col * fragW;
      const sy = row * fragH;

      const fragCanvas = document.createElement("canvas");
      fragCanvas.width = Math.ceil(fragW);
      fragCanvas.height = Math.ceil(fragH);
      fragCanvas.getContext("2d").drawImage(
        sourceCanvas,
        sx, sy, fragW, fragH,
        0, 0, fragCanvas.width, fragCanvas.height
      );

      const cx = box.x + sx + fragW / 2;
      const cy = box.y + sy + fragH / 2;

      const boardCx = box.x + box.width / 2;
      const boardCy = box.y + box.height / 2;
      const dirX = cx - boardCx;
      const dirY = cy - boardCy;
      const dirLen = Math.max(1, Math.hypot(dirX, dirY));
      const speed = 90 + Math.random() * 160;

      fragments.push({
        canvas: fragCanvas,
        x: cx,
        y: cy,
        w: fragW,
        h: fragH,
        vx: (dirX / dirLen) * speed + (Math.random() - 0.5) * 40,
        vy: (dirY / dirLen) * speed + (Math.random() - 0.5) * 40 - 60,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 6,
        gravity: 220 + Math.random() * 80,
      });
    }
  }

  shatter.fragments = fragments;
  shatter.active = true;
  shatter.startedAt = performance.now();
  appState = "shattering";
}

function updateAndDrawShatter() {
  const elapsedMs = performance.now() - shatter.startedAt;
  const t = Math.min(1, elapsedMs / SHATTER_DURATION_MS);

  if (t >= 1) {
    finishShatter();
    return;
  }

  const dt = 1 / 60;
  const fadeStart = 0.45;

  ctx.save();
  for (const frag of shatter.fragments) {
    frag.x += frag.vx * dt;
    frag.y += frag.vy * dt;
    frag.vy += frag.gravity * dt;
    frag.rotation += frag.rotationSpeed * dt;

    const alpha = t < fadeStart ? 1 : Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart));
    const scale = 1 - t * 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rotation);
    ctx.scale(scale, scale);
    ctx.drawImage(frag.canvas, -frag.w / 2, -frag.h / 2, frag.w, frag.h);
    ctx.restore();
  }
  ctx.restore();
}

function finishShatter() {
  shatter.active = false;
  shatter.fragments = [];
  if (shatter.pendingCanvas) {
    addToGallery(shatter.pendingCanvas);
    statusText.textContent = "saved to photo booth!";
    shatter.pendingCanvas = null;
  }
  resetPuzzleOnly();
}

function handleFistReset() {
  if (appState !== "puzzle") {
    statusText.textContent = "reset (fist)";
    resetPuzzleOnly();
    return;
  }

  const reallySolved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
  puzzle.solved = reallySolved;

  if (reallySolved && puzzle.fullPhotoboothCanvas) {
    shatter.pendingCanvas = puzzle.fullPhotoboothCanvas;
    startShatter(puzzle.fullPhotoboothCanvas, puzzle.boardBox);
  } else {
    statusText.textContent = "reset (fist)";
    resetPuzzleOnly();
  }
}

let handLandmarker = null;
let fistHoldCounter = 0;

function processResults(result) {
  if (appState === "shattering") {
    updateAndDrawShatter();
    statusText.textContent = "saving…";
    return;
  }

  const handsLandmarks = result.landmarks || [];
  const noHands = handsLandmarks.length === 0;

  if (noHands) {
    statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot";
    fistHoldCounter = 0;
    freezeGate.holding = false;

    if (drag.activeHand && drag.piece) {
      handleDragForHand(drag.activeHand, false, { x: drag.piece.x, y: drag.piece.y });
    }

    if (appState === "tracking") {
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyActiveFilterToBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = isStripFull()
        ? "photo booth full — download or reset"
        : "looking for hands…";
      return;
    }

    if (appState === "countdown") {
      drawCountdownOverlay(puzzle.boardBox);
      return;
    }

    if (appState === "puzzle") {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
      drawBoardAndPieces();
      statusText.textContent = puzzle.solved
        ? "puzzle complete! close your fist to save"
        : "arrange the puzzle with pinch";
      return;
    }

    return;
  }

  statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot live";

  const anyFist = handsLandmarks.some((lm) => isFist(lm));
  const draggingNow = drag.activeHand !== null && drag.piece !== null;
  if (anyFist && !draggingNow && appState !== "tracking") {
    fistHoldCounter++;
    if (fistHoldCounter >= FIST_HOLD_FRAMES) {
      fistHoldCounter = 0;
      handleFistReset();
      return;
    }
  } else {
    fistHoldCounter = 0;
  }

  if (appState === "tracking") {
    if (isStripFull()) {
      statusText.textContent = "photo booth full — download or reset";
      return;
    }
    if (handsLandmarks.length === 2) {
      const [handA, handB] = handsLandmarks;
      const indexA = mirrorLandmarkX(handA[LM.INDEX_TIP]);
      const indexB = mirrorLandmarkX(handB[LM.INDEX_TIP]);
      const frameBox = computeHandFrame(indexA, indexB);

      if (frameBox.width > 4 && frameBox.height > 4) {
        applyActiveFilterToBox(frameBox);
        drawLiveFrameOverlay(frameBox);
        lastSeenFrame.box = frameBox;
        lastSeenFrame.at = performance.now();
      }

      const bothPinching = isPinching(handA) && isPinching(handB);
      if (bothPinching && frameBox.width > 40 && frameBox.height > 40) {
        if (!freezeGate.holding) {
          freezeGate.holding = true;
          freezeGate.since = performance.now();
        }
        statusDot.className = "status-dot armed";
        statusText.textContent = "hold the pinch…";

        if (performance.now() - freezeGate.since > FREEZE_HOLD_MS) {
          freezeGate.holding = false;
          startCountdown(frameBox);
        }
      } else {
        freezeGate.holding = false;
        statusText.textContent = "hands tracking";
      }
    } else {
      freezeGate.holding = false;
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyActiveFilterToBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
        statusText.textContent = "hands tracking";
      } else {
        statusText.textContent = "hands tracking";
      }
    }
    return;
  }

  if (appState === "countdown") {
    drawCountdownOverlay(puzzle.boardBox);
    return;
  }

  if (appState === "puzzle") {
    const labelsPresent = new Set();
    handsLandmarks.forEach((lm, i) => {
      const label = i === 0 ? "A" : "B";
      labelsPresent.add(label);
      const pinching = isPinching(lm);
      const indexPx = toPixel(mirrorLandmarkX(lm[LM.INDEX_TIP]));
      handleDragForHand(label, pinching, indexPx);
    });

    if (drag.activeHand && !labelsPresent.has(drag.activeHand) && drag.piece) {
      handleDragForHand(drag.activeHand, false, { x: drag.piece.x, y: drag.piece.y });
    }

    if (!drag.piece) {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
    }

    drawBoardAndPieces();
    drawHandSkeletonsOverBoard(handsLandmarks, puzzle.boardBox);

    statusText.textContent = puzzle.solved
      ? (fistHoldCounter > 0
          ? `saving… hold fist (${fistHoldCounter}/${FIST_HOLD_FRAMES})`
          : "puzzle complete! close your fist to save")
      : "arrange the puzzle with pinch";
  }
}

function renderLoop() {
  if (videoEl.readyState >= 2 && handLandmarker) {
    drawVideoFrame();
    const nowMs = performance.now();
    const result = handLandmarker.detectForVideo(videoEl, nowMs);
    processResults(result);
  }
  requestAnimationFrame(renderLoop);
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function showLoaderError(message) {
  loaderText.textContent = message;
  loaderText.style.color = "#e0533d";
  loaderRetry.classList.remove("hidden");
}

function resetLoaderUI() {
  loadingOverlay.classList.remove("hidden");
  loaderText.style.color = "";
  loaderText.textContent = "loading HandLandmarker model…";
  loaderRetry.classList.add("hidden");
  errorBanner.style.display = "none";
}

async function boot() {
  resetLoaderUI();

  let settled = false;
  const watchdogMs = (LOAD_TIMEOUT_MS * 2) + 5000;
  const watchdog = setTimeout(() => {
    if (!settled) {
      showLoaderError("Loading is taking too long. Press retry or check your connection.");
    }
  }, watchdogMs);

  try {
    if (!videoEl.srcObject) {
      await initWebcam();
    }

    handLandmarker = await initHandLandmarker();

    settled = true;
    clearTimeout(watchdog);
    loadingOverlay.classList.add("hidden");
    statusText.textContent = "ready";
    requestAnimationFrame(renderLoop);
  } catch (err) {
    settled = true;
    clearTimeout(watchdog);
    if (err && err.name === "NotAllowedError") {
      showLoaderError("Camera permission denied. Enable it in browser settings and press retry.");
    } else if (err && err.name === "NotFoundError") {
      showLoaderError("No webcam found.");
    } else {
      showLoaderError((err && err.message) || "Error starting the app.");
    }
  }
}

loaderRetry.addEventListener("click", () => {
  boot();
});

if (downloadStripBtn) {
  downloadStripBtn.addEventListener("click", downloadPhotoStrip);
  updateStripDownloadAvailability();
}

if (resetAllBtn) {
  resetAllBtn.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Are you sure you want to clear the photo booth and start over?"
    );
    if (confirmed) resetEverything();
  });
}

initFilterUI();
boot();