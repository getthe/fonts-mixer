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

async function handleFontSelectChange(side) {
  const select = side === 'a' ? fontASelect : fontBSelect;
  const preview = side === 'a' ? previewA : previewB;
  const value = select.value;

  if (!value) {
    if (side === 'a') state.fontA = null; else state.fontB = null;
    updateMixButton();
    return;
  }

  showStatus(`Loading ${value}...`);
  try {
    const fontData = await loadGoogleFont(value);
    if (side === 'a') {
      state.fontA = fontData;
      state.fontAKey = value;
    } else {
      state.fontB = fontData;
      state.fontBKey = value;
    }

    // Render preview
    renderPreview(fontData, preview);

    // Also load the font for CSS rendering via a link tag
    loadGoogleFontCSS(value);

    showStatus(`Loaded: ${value}`);
    setTimeout(hideStatus, 2000);
  } catch (err) {
    showStatus(`Error loading ${value}: ${err.message}`);
  }
  updateMixButton();
}

/**
 * Load a Google Font via CSS <link> for rendering in DOM elements.
 */
function loadGoogleFontCSS(fontName) {
  const id = `gfont-${fontName.replace(/\s/g, '-')}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@100;300;400;500;700;900&display=swap`;
  document.head.appendChild(link);
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

    } else if (mode === 'canvas-blend') {
      // Canvas pixel blending
      const canvas = canvasBlendText(state.fontA, state.fontB, text, fontSize, ratio, options);
      canvas.style.maxWidth = '100%';
      outputPreview.appendChild(canvas);

    } else {
      // Glyph interpolation mode
      const canvas = renderInterpolatedText(state.fontA, state.fontB, text, fontSize, ratio, options);
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
    showStatus(`Mix complete: ${state.fontA.family} + ${state.fontB.family} (${Math.round(ratio * 100)}% blend)`);
    setTimeout(hideStatus, 3000);

  } catch (err) {
    showStatus(`Mixing error: ${err.message}`);
    console.error('Mix error:', err);
  }

  state.isMixing = false;
  document.body.classList.remove('mixing');
}

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
