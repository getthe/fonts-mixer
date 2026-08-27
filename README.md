# fontMixer

**Blend two fonts into a new hybrid.**

fontMixer is a web-based tool that lets you mix two fonts together and create unique hybrid typefaces. Select any two fonts, adjust mixing parameters, and see the result in real-time.

![fontMixer](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Two font inputs** — Choose from 40+ curated Google Fonts or upload your own `.ttf` / `.otf` files
- **Three mixing modes:**
  - **Glyph Interpolation** — Blends glyph outline paths point-by-point between two fonts
  - **Canvas Blend** — Renders both fonts to canvas and blends pixel alpha channels
  - **CSS Overlay** — Layers both fonts with adjustable opacity
- **Mixing parameters** — Fine-tune the result with:
  - Mix ratio (0–100% blend between fonts)
  - Weight blend
  - Width stretch (condensed ↔ expanded)
  - Letter spacing
  - Smoothness
- **Live preview** — Type any text and see the mixed result instantly
- **Glyph grid** — Inspect individual character cells of the mixed output
- **Save Mixed Font** — Export the result as:
  - **PNG image** — the mixed preview as a raster image
  - **SVG vector** — mixed glyph outlines as scalable paths
  - **Font file (.otf)** — a real installable font file (glyph data is fetched
    automatically for Google Fonts — no manual downloads or uploads needed).
    opentype.js writes CFF-based OpenType; install on Windows via right-click → Install

## How It Works

fontMixer uses [opentype.js](https://github.com/opentypejs/opentype.js) to parse font files and extract glyph outlines. For each character, it:

1. Extracts the Bézier path commands from both source fonts
2. Flattens all control points into coordinate arrays
3. Resamples to a common length if the structures differ
4. Linearly interpolates all coordinates based on the mix ratio
5. Renders the hybrid paths to an HTML5 Canvas

For fonts with incompatible glyph structures, the canvas blending mode provides a visual blend of both typefaces.

## Quick Start

Just open `index.html` in a browser — no build tools or server required.

```bash
# Or serve locally:
npx http-server . -p 8080
# Then open http://localhost:8080
```

## Usage

1. **Select Font A** — Pick from the dropdown or upload a custom font file
2. **Select Font B** — Same for the second font
3. **Click "Try Mix"** — See the initial hybrid result
4. **Adjust parameters** — Tweak the ratio, stretch, spacing, etc.
5. **Click "Remix"** — Re-generate with new settings
6. **Type custom text** — Preview any text in the mixed font

## Tech Stack

- **HTML5 / CSS3 / Vanilla JavaScript** (ES Modules)
- **opentype.js** — Font parsing and glyph path extraction
- **HTML5 Canvas** — Pixel-level blending and rendering
- **Google Fonts API** — Curated font catalog

## Project Structure

```
fontMixer/
├── index.html          # Main application page
├── style.css           # Dark theme styling
├── js/
│   ├── font-loader.js  # Font fetching & parsing (Google Fonts + uploads)
│   ├── font-mixer.js   # Core mixing algorithms
│   └── app.js          # UI logic & event handling
└── README.md
```

## Roadmap

- [x] Export mixed font as installable font file (auto-fetches Google Font glyph data)
- [ ] Multi-font mixing (3+ fonts)
- [ ] Per-character mix ratio control
- [ ] Save/load mix presets
- [ ] Font comparison overlay view
- [ ] Kerning and ligature preservation

## License

MIT
