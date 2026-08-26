/**
 * app.js
 * Main application logic for fontMixer.
 * Handles UI events, font selection, mixing, and preview rendering.
 */

import {
  loadGoogleFont,
  loadFontFile,
  populateFontSelect,
  addUploadedFontToSelect,
  getFont,
  renderPreview,
  fontCache,
} from './font-loader.js';

import {
  canvasBlendText,
  renderInterpolatedText,
  renderGlyphCell,
  createCssOverlay,
  interpolateGlyph,
} from './font-mixer.js';

// ─── STATE ──────────────────────────────────────────────────────

const state = {
  fontA: null,   // loaded font data object { opentype, family, ... }
  fontB: null,
  fontAKey: '',  // cache key
  fontBKey: '',
  isMixing: false,
  lastParams: null,
};

// ─── DOM REFS ───────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const fontASelect = $('font-a-select');
const fontBSelect = $('font-b-select');
const fontAFile = $('font-a-file');
const fontBFile = $('font-b-file');
const previewA = $('preview-a');
const previewB = $('preview-b');
const mixBtn = $('mix-btn');
const remixBtn = $('remix-btn');
const sampleText = $('sample-text');
const outputPreview = $('output-preview');
const outputGlyphs = $('output-glyphs');
const statusBar = $('status-bar');
const saveGroup = $('save-group');
const saveBtn = $('save-btn');
const saveDropdown = $('save-dropdown');

// Parameter inputs
const paramRatio = $('param-ratio');
const paramWeight = $('param-weight');
const paramWidth = $('param-width');
const paramSpacing = $('param-spacing');
const paramSmooth = $('param-smooth');
const paramMode = $('param-mode');

// Parameter display values
const valRatio = $('val-ratio');
const valWeight = $('val-weight');
const valWidth = $('val-width');
const valSpacing = $('val-spacing');
const valSmooth = $('val-smooth');

// ─── INITIALIZATION ─────────────────────────────────────────────

function init() {
  // Populate font dropdowns
  populateFontSelect(fontASelect);
  populateFontSelect(fontBSelect);

  // Event listeners
  fontASelect.addEventListener('change', () => handleFontSelectChange('a'));
  fontBSelect.addEventListener('change', () => handleFontSelectChange('b'));
  fontAFile.addEventListener('change', e => handleFileUpload('a', e));
  fontBFile.addEventListener('change', e => handleFileUpload('b', e));

  mixBtn.addEventListener('click', doMix);
  remixBtn.addEventListener('click', doMix);

  // Save dropdown toggle
  saveBtn.addEventListener('click', () => saveGroup.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!saveGroup.contains(e.target)) saveGroup.classList.remove('open');
  });
  sampleText.addEventListener('input', () => {
    if (state.lastParams) doMix();
  });

  // Parameter sliders with live display
  paramRatio.addEventListener('input', () => { valRatio.textContent = paramRatio.value + '%'; });
  paramWeight.addEventListener('input', () => { valWeight.textContent = paramWeight.value + '%'; });
  paramWidth.addEventListener('input', () => { valWidth.textContent = paramWidth.value + '%'; });
  paramSpacing.addEventListener('input', () => { valSpacing.textContent = paramSpacing.value + 'px'; });
  paramSmooth.addEventListener('input', () => { valSmooth.textContent = paramSmooth.value + '%'; });

  showStatus('Ready. Select two fonts to begin.');
  setTimeout(hideStatus, 3000);
}

// ─── FONT SELECTION ─────────────────────────────────────────────

function handleFontSelectChange(side) {
  const select = side === 'a' ? fontASelect : fontBSelect;
  const preview = side === 'a' ? previewA : previewB;
  const value = select.value;

  if (!value) {
    if (side === 'a') state.fontA = null; else state.fontB = null;
    updateMixButton();
    return;
  }

  // Google Fonts load synchronously via CSS <link> (no CORS issues)
  const fontData = loadGoogleFont(value);
  if (side === 'a') {
    state.fontA = fontData;
    state.fontAKey = value;
  } else {
    state.fontB = fontData;
    state.fontBKey = value;
  }

  // Render preview
  renderPreview(fontData, preview);

  showStatus(`Selected: ${value}`);
  setTimeout(hideStatus, 2000);
  updateMixButton();
}

async function handleFileUpload(side, event) {
  const file = event.target.files[0];
  if (!file) return;

  const select = side === 'a' ? fontASelect : fontBSelect;
  const preview = side === 'a' ? previewA : previewB;

  showStatus(`Parsing ${file.name}...`);
  try {
    const fontData = await loadFontFile(file);
    const cacheKey = `upload:${fontData.family}:${file.name}`;

    if (side === 'a') {
      state.fontA = fontData;
      state.fontAKey = cacheKey;
    } else {
      state.fontB = fontData;
      state.fontBKey = cacheKey;
    }

    addUploadedFontToSelect(select, cacheKey, fontData.family);
    renderPreview(fontData, preview);

    showStatus(`Loaded: ${file.name} (${fontData.family})`);
    setTimeout(hideStatus, 2000);
  } catch (err) {
    showStatus(`Error parsing ${file.name}: ${err.message}`);
  }
  updateMixButton();
}

// ─── MIX BUTTON STATE ───────────────────────────────────────────

function updateMixButton() {
  mixBtn.disabled = !(state.fontA && state.fontB);
}

// ─── MIXING ─────────────────────────────────────────────────────

async function doMix() {
  if (!state.fontA || !state.fontB) return;

  state.isMixing = true;
  document.body.classList.add('mixing');
  showStatus('Mixing fonts...');

  // Wait for CSS fonts to be ready (Google Fonts load async via <link>)
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  } else {
    await new Promise(r => setTimeout(r, 500));
  }

  // Read parameters
  const ratio = parseInt(paramRatio.value) / 100;
  const weight = parseInt(paramWeight.value) / 100;
  const widthStretch = parseInt(paramWidth.value) / 100;
  const spacing = parseInt(paramSpacing.value);
  const smoothness = parseInt(paramSmooth.value);
  const mode = paramMode.value;
  const text = sampleText.value || 'The quick brown fox jumps over the lazy dog';

  state.lastParams = { ratio, weight, widthStretch, spacing, smoothness, mode, text };

  // Use requestAnimationFrame to let the UI update before heavy work
  await new Promise(r => requestAnimationFrame(r));

  try {
    const fontSize = 48;
    const options = { smoothness, widthStretch, spacing };

    // Clear output
    while (outputPreview.firstChild) outputPreview.removeChild(outputPreview.firstChild);
    while (outputGlyphs.firstChild) outputGlyphs.removeChild(outputGlyphs.firstChild);

    if (mode === 'css-overlay') {
      // CSS overlay mode
      const familyA = state.fontA.family;
      const familyB = state.fontB.family;
      const overlay = createCssOverlay(text, familyA, familyB, ratio, fontSize);
      outputPreview.appendChild(overlay);

    } else if (mode === 'glyph-interp' && state.fontA.opentype && state.fontB.opentype) {
      // Glyph interpolation mode (requires opentype data from uploaded fonts)
      const canvas = renderInterpolatedText(state.fontA, state.fontB, text, fontSize, ratio, options);
      canvas.style.maxWidth = '100%';
      outputPreview.appendChild(canvas);

    } else {
      // Canvas pixel blending (works with any font source)
      // Also used as fallback when glyph-interp is selected but no opentype data
      if (mode === 'glyph-interp') {
        showStatus('Glyph interpolation needs uploaded .ttf fonts — using canvas blend instead');
      }
      const canvas = canvasBlendText(state.fontA, state.fontB, text, fontSize, ratio, options);
      canvas.style.maxWidth = '100%';
      outputPreview.appendChild(canvas);
    }

    // Render individual glyph cells
    const uniqueChars = [...new Set(text.replace(/\s/g, ''))];
    const glyphText = uniqueChars.slice(0, 26).join('');

    for (const ch of glyphText) {
      const cell = document.createElement('div');
      cell.className = 'glyph-cell';
      const cellCanvas = renderGlyphCell(state.fontA, state.fontB, ch, 56, ratio, mode);
      cellCanvas.style.width = '56px';
      cellCanvas.style.height = '56px';
      cell.appendChild(cellCanvas);
      outputGlyphs.appendChild(cell);
    }

    remixBtn.disabled = false;
    saveGroup.style.display = 'inline-block';
    showStatus(`Mix complete: ${state.fontA.family} + ${state.fontB.family} (${Math.round(ratio * 100)}% blend)`);
    setTimeout(hideStatus, 3000);

  } catch (err) {
    showStatus(`Mixing error: ${err.message}`);
    console.error('Mix error:', err);
  }

  state.isMixing = false;
  document.body.classList.remove('mixing');
}

// ─── EXPORT / SAVE FUNCTIONS ─────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getMixFilename(ext) {
  const a = state.fontA?.family || 'fontA';
  const b = state.fontB?.family || 'fontB';
  const ratio = paramRatio.value;
  return `${a}_${b}_mix${ratio}.${ext}`;
}

/**
 * Export the mixed preview as a PNG image.
 * Works with all mixing modes.
 */
function exportAsPNG() {
  saveGroup.classList.remove('open');

  // Try to find a canvas in the preview
  const canvas = outputPreview.querySelector('canvas');
  if (canvas) {
    canvas.toBlob(blob => {
      if (blob) {
        downloadBlob(blob, getMixFilename('png'));
        showStatus('Saved as PNG');
        setTimeout(hideStatus, 3000);
      }
    });
    return;
  }

  // For CSS overlay mode — render to a temp canvas
  const overlay = outputPreview.querySelector('.css-overlay-container');
  if (overlay) {
    const text = sampleText.value || 'The quick brown fox jumps over the lazy dog';
    const ratio = parseInt(paramRatio.value) / 100;
    const fontSize = 48;
    const widthStretch = parseInt(paramWidth.value) / 100;
    const spacing = parseInt(paramSpacing.value);
    const canvas2 = canvasBlendText(state.fontA, state.fontB, text, fontSize, ratio, { widthStretch, spacing });
    canvas2.toBlob(blob => {
      if (blob) {
        downloadBlob(blob, getMixFilename('png'));
        showStatus('Saved as PNG');
        setTimeout(hideStatus, 3000);
      }
    });
    return;
  }

  showStatus('No mixed output to save — run a mix first');
  setTimeout(hideStatus, 3000);
}

/**
 * Export mixed glyphs as an SVG vector file.
 */
function exportAsSVG() {
  saveGroup.classList.remove('open');
  if (!state.fontA || !state.fontB) return;

  const text = sampleText.value || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const ratio = parseInt(paramRatio.value) / 100;
  const fontSize = 200;
  const hasOpentype = state.fontA.opentype && state.fontB.opentype;

  let svgContent = '';
  let totalWidth = 0;
  const charElements = [];

  for (const char of text) {
    if (char === ' ') { totalWidth += fontSize * 0.3; continue; }

    if (hasOpentype) {
      const path = interpolateGlyph(state.fontA, state.fontB, char, fontSize, ratio);
      if (path) {
        let d = '';
        for (const cmd of path.commands) {
          switch (cmd.type) {
            case 'M': d += `M${cmd.x} ${cmd.y}`; break;
            case 'L': d += `L${cmd.x} ${cmd.y}`; break;
            case 'Q': d += `Q${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`; break;
            case 'C': d += `C${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`; break;
            case 'Z': d += 'Z'; break;
          }
        }
        charElements.push(`<g transform="translate(${totalWidth},0)"><path d="${d}" fill="black"/></g>`);
      }
    } else {
      charElements.push(`<text x="${totalWidth}" y="${fontSize}" font-size="${fontSize}" font-family="${state.fontA.family}">${char === '&' ? '&amp;' : char === '<' ? '&lt;' : char}</text>`);
    }
    totalWidth += fontSize * 0.6;
  }

  const svgHeight = fontSize * 1.4;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(totalWidth + 40)} ${Math.ceil(svgHeight)}" width="${Math.ceil(totalWidth + 40)}" height="${Math.ceil(svgHeight)}">
  <!-- fontMixer: ${state.fontA.family} + ${state.fontB.family} (${Math.round(ratio * 100)}% blend) -->
  <g transform="translate(20, 0)">
    ${charElements.join('\n    ')}
  </g>
</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  downloadBlob(blob, getMixFilename('svg'));
  showStatus('Saved as SVG vector');
  setTimeout(hideStatus, 3000);
}

/**
 * Export a real .ttf font file using opentype.js.
 * Requires both source fonts to be uploaded .ttf/.otf files.
 */
function exportAsTTF() {
  saveGroup.classList.remove('open');

  if (!state.fontA?.opentype || !state.fontB?.opentype) {
    showStatus('TTF export requires both fonts to be uploaded .ttf/.otf files (Google Fonts cannot be repackaged)');
    setTimeout(hideStatus, 5000);
    return;
  }

  if (typeof opentype === 'undefined') {
    showStatus('opentype.js not available');
    setTimeout(hideStatus, 3000);
    return;
  }

  showStatus('Building TTF font file...');

  const ratio = parseInt(paramRatio.value) / 100;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?\'-;:';
  const unitsPerEm = state.fontA.opentype.unitsPerEm || 1000;

  const notdefGlyph = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: unitsPerEm * 0.5,
    path: new opentype.Path(),
  });

  const glyphs = [notdefGlyph];

  for (const char of chars) {
    try {
      const path = interpolateGlyph(state.fontA, state.fontB, char, unitsPerEm, ratio);
      if (path && path.commands && path.commands.length > 0) {
        // Flip Y axis (opentype fonts use Y-up coordinate system)
        const flippedCmds = path.commands.map(cmd => {
          const nc = { type: cmd.type };
          if (cmd.x !== undefined) nc.x = cmd.x;
          if (cmd.y !== undefined) nc.y = -cmd.y;
          if (cmd.x1 !== undefined) nc.x1 = cmd.x1;
          if (cmd.y1 !== undefined) nc.y1 = -cmd.y1;
          if (cmd.x2 !== undefined) nc.x2 = cmd.x2;
          if (cmd.y2 !== undefined) nc.y2 = -cmd.y2;
          return nc;
        });

        const opPath = new opentype.Path();
        for (const cmd of flippedCmds) {
          switch (cmd.type) {
            case 'M': opPath.moveTo(cmd.x, cmd.y); break;
            case 'L': opPath.lineTo(cmd.x, cmd.y); break;
            case 'Q': opPath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y); break;
            case 'C': opPath.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y); break;
            case 'Z': opPath.close(); break;
          }
        }

        const glyph = new opentype.Glyph({
          name: char === ' ' ? 'space' : `uni${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
          unicode: char.charCodeAt(0),
          advanceWidth: Math.round(unitsPerEm * 0.6),
          path: opPath,
        });
        glyphs.push(glyph);
      }
    } catch {
      // Skip characters that fail
    }
  }

  try {
    const mixedFont = new opentype.Font({
      familyName: `${state.fontA.family}${state.fontB.family}Mix`,
      styleName: 'Regular',
      unitsPerEm: unitsPerEm,
      ascender: unitsPerEm * 0.8,
      descender: unitsPerEm * -0.2,
      glyphs: glyphs,
    });

    const buffer = mixedFont.toArrayBuffer();
    const blob = new Blob([buffer], { type: 'font/ttf' });
    downloadBlob(blob, getMixFilename('ttf'));
    showStatus(`Saved TTF with ${glyphs.length - 1} mixed glyphs`);
    setTimeout(hideStatus, 4000);
  } catch (err) {
    showStatus(`TTF export error: ${err.message}`);
    console.error('TTF export error:', err);
    setTimeout(hideStatus, 5000);
  }
}

// Make export functions available globally for onclick handlers
window.exportAsPNG = exportAsPNG;
window.exportAsSVG = exportAsSVG;
window.exportAsTTF = exportAsTTF;

// ─── STATUS BAR ─────────────────────────────────────────────────

function showStatus(msg) {
  statusBar.textContent = msg;
  statusBar.classList.add('visible');
}

function hideStatus() {
  statusBar.classList.remove('visible');
}

// ─── START ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
