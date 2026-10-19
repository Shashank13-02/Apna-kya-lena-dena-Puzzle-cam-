# GarbaFOMO — Poora Desh Garba Me, Main Idhar Webcam Pe 🪔

> An AI-powered, gesture-controlled webcam photobooth and puzzle game that runs 100% in the browser. Zero installations, zero backend, zero build steps. While the rest of India is playing Garba till 3 AM, you're pinching 3x3 puzzle pieces in mid-air!

---

## **DESCRIPTION**

**GarbaFOMO** lets you frame photos using your hands as a camera box (index fingers & thumbs), applies real-time aesthetic film filters (from authentic Photobooth B&W and 1970s Kodachrome to Retro Vaporwave & Thermal Heatmap), slices your shot into a 3×3 jigsaw puzzle, and lets you drag and solve the pieces using mid-air pinch gestures.

Once solved, completed snaps are collected into a downloadable vertical **Photo Booth** strip!

---

## **SYSTEM REQUIREMENTS**

- **Browser:** Google Chrome or Microsoft Edge (recommended), Firefox
- **Hardware:** Webcam
- **Internet Connection:** Required on first load to fetch the MediaPipe Vision model (~10MB CDN cached)
- **Local / Web Server:** Required for WebCam security (`getUserMedia` requires `http://localhost` or `https://`)

---

## **GETTING STARTED**

### 1. Clone the Repository

```bash
git clone https://github.com/mishu006/Puzzle.git
cd Puzzle
```

### 2. Start a Local Server

Because modern browsers restrict webcam access and ES modules over the `file://` protocol, run a quick local server:

**Using Python (built into macOS / Linux):**
```bash
python3 -m http.server 5500
```

**Or using VS Code:**
Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension and click **Go Live**.

### 3. Open in Browser

```
http://localhost:5500
```

Grant camera permissions when prompted.

---

## **PROJECT STRUCTURE**

```
Puzzle/
├── index.html        # App entrypoint, HUD overlays, Windows XP filter bar
├── app.js            # Complete engine (MediaPipe tracking, puzzle logic, 10 aesthetic filters, audio synthesis)
├── css/
│   └── styles.css    # Yatra One typography, Windows XP Luna push-buttons, animations, scanlines
└── README.md
```

---

## **HAND GESTURE CONTROLS**

| Gesture | Action |
|---|---|
| **Two-Hand Pinch Box** | Freeze the frame area and begin the 3-second capture countdown |
| **Single-Hand Pinch & Drag** | Grab and drag any puzzle piece across the board |
| **Closed Fist (Hold)** | Save completed puzzle to Photo Booth / Reset board |

---

## **KEYBOARD HOTKEYS & FILTERS**

Switch aesthetic photo filters anytime during framing, live solving, or viewing:

- <kbd>1</kbd> — 📷 **PHOTOBOOTH** (Original high-contrast grainy B&W)
- <kbd>2</kbd> — 🎬 **NOIR B&W** (Classic cinematic monochrome)
- <kbd>3</kbd> — 🌆 **VAPORWAVE** (Pink & cyan retro aesthetic)
- <kbd>4</kbd> — 📺 **VHS GLITCH** (RGB aberration & scanline noise)
- <kbd>5</kbd> — 🌅 **GOLDEN HOUR** (Warm sunset amber glow)
- <kbd>6</kbd> — 🟩 **MATRIX** (Cyberpunk terminal green)
- <kbd>7</kbd> — 🌡️ **THERMAL** (Ironbow infrared heatmap)
- <kbd>8</kbd> — 🎞️ **1970s FILM** (Sun-drenched Kodachrome with turquoise blues)
- <kbd>9</kbd> — 🌸 **ANIME POP** (High-saturation cel vibrancy)
- <kbd>0</kbd> — 🌿 **NATURAL RAW** (Clean uncompressed feed)
- <kbd>F</kbd> / <kbd>→</kbd> / <kbd>←</kbd> — Cycle filters forward / backward
- <kbd>C</kbd> — Toggle filter target: **FRAME ONLY** vs **FULL WEBCAM**

---

## **TECH STACK & ARCHITECTURE**

- **[Google MediaPipe Tasks Vision](https://developers.google.com/mediapipe)** `v0.10.14` — 21 real-time 3D hand landmarks running via WebGL GPU delegate (with CPU fallback).
- **HTML5 Canvas 2D API** — Hardware-accelerated sub-millisecond per-pixel color grading, LUT mapping, and puzzle tile slicing.
- **Web Audio API** — Synthesized procedural sci-fi audio chimes on filter changes without external MP3 dependencies.
- **Windows XP Luna Design System** — Pixel-accurate 2001 Windows XP bevels, amber hover glows, and active sunken states.
- **Vanilla ES Modules** — Zero build tools, bundlers, or npm bloat.

---

## **BROWSER COMPATIBILITY**

| Browser | Compatibility |
|---|---|
| Chrome / Edge | Recommended (full GPU acceleration) |
| Firefox | Compatible |
| Safari | Partial (Webcam permissions required) |
| Mobile | Supported (Desktop webcam recommended for hand gesture framing) |

---

## **LICENSE**

MIT — Free to use, adapt, and share.
