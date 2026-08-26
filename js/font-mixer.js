/**
 * font-mixer.js
 * Core algorithms for blending two fonts together.
 *
 * Three mixing modes:
 *   1. glyph-interp  — Interpolate glyph path points between two fonts
 *   2. canvas-blend  — Render both fonts to canvas and blend pixels
 *   3. css-overlay    — Layer both fonts with opacity + blend modes
 */

// ─── GLYPH PATH INTERPOLATION ────────────────────────────────────

/**
 * Extract all numeric coordinates from an opentype.js path command.
 * Returns a flat array of numbers.
 */
function extractCmdValues(cmd) {
  const vals = [];
  const keys = ['x', 'y', 'x1', 'y1', 'x2', 'y2'];
  for (const k of keys) {
    if (cmd[k] !== undefined) vals.push(cmd[k]);
  }
  return vals;
}

/**
 * Set values back into a path command from a flat array (starting at index).
 */
function setCmdValues(cmd, vals, startIdx) {
  const keys = ['x', 'y', 'x1', 'y1', 'x2', 'y2'];
  let idx = startIdx;
  for (const k of keys) {
    if (cmd[k] !== undefined && idx < vals.length) {
      cmd[k] = vals[idx++];
    }
  }
  return idx;
}

/**
 * Flatten all numeric values from a path's commands into one array.
 */
function flattenPath(path) {
  const flat = [];
  for (const cmd of path.commands) {
    flat.push(...extractCmdValues(cmd));
  }
  return flat;
}

/**
 * Write interpolated values back into a path's commands.
 * Returns a new path object (doesn't mutate original).
 */
function applyValuesToPath(path, values) {
  const newCommands = path.commands.map(cmd => {
    const newCmd = { type: cmd.type };
    const keys = ['x', 'y', 'x1', 'y1', 'x2', 'y2'];
    for (const k of keys) {
      if (cmd[k] !== undefined) newCmd[k] = cmd[k];
    }
    return newCmd;
  });

  let idx = 0;
  for (const cmd of newCommands) {
    idx = setCmdValues(cmd, values, idx);
  }

  return { commands: newCommands, fill: path.fill, unitsPerEm: path.unitsPerEm };
}

/**
 * Resample a flat array to a target length using linear interpolation.
 */
function resampleArray(arr, targetLen) {
  if (arr.length === 0) return new Array(targetLen).fill(0);
  if (arr.length === targetLen) return [...arr];

  const result = new Array(targetLen);
  const ratio = (arr.length - 1) / (targetLen - 1 || 1);

  for (let i = 0; i < targetLen; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, arr.length - 1);
    const frac = srcIdx - lo;
    result[i] = arr[lo] * (1 - frac) + arr[hi] * frac;
  }
  return result;
}

/**
 * Interpolate two glyph paths point-by-point.
 * Works best when both fonts have similar glyph structures.
 * Falls back to resampling if command counts differ.
 */
function interpolatePaths(pathA, pathB, ratio) {
  const flatA = flattenPath(pathA);
  const flatB = flattenPath(pathB);

  // If different number of values, resample to common length
  const targetLen = Math.max(flatA.length, flatB.length);
  const resA = resampleArray(flatA, targetLen);
  const resB = resampleArray(flatB, targetLen);

  // Linear interpolation
  const mixed = new Array(targetLen);
  for (let i = 0; i < targetLen; i++) {
    mixed[i] = resA[i] * (1 - ratio) + resB[i] * ratio;
  }

  // Apply mixed values to the path with more commands (or pathA if equal)
  const basePath = flatA.length >= flatB.length ? pathA : pathB;
  return applyValuesToPath(basePath, mixed);
}

// ─── CANVAS PIXEL BLENDING ──────────────────────────────────────

/**
 * Render a character using both fonts and blend the pixel data.
 * Returns a canvas element with the blended result.
 */
function canvasBlendChar(fontA, fontB, char, fontSize, ratio, options = {}) {
  const { smoothness = 0, widthStretch = 1.0 } = options;
  const padding = 10;
  const w = Math.ceil(fontSize * widthStretch * 1.5) + padding * 2;
  const h = Math.ceil(fontSize * 1.5) + padding * 2;

  // Render font A
  const canvasA = document.createElement('canvas');
  canvasA.width = w; canvasA.height = h;
  const ctxA = canvasA.getContext('2d');

  // Render font B
  const canvasB = document.createElement('canvas');
  canvasB.width = w; canvasB.height = h;
  const ctxB = canvasB.getContext('2d');

  // Draw glyph A using opentype.js
  if (fontA && fontA.opentype) {
    ctxA.save();
    if (widthStretch !== 1.0) {
      ctxA.transform(widthStretch, 0, 0, 1, padding, 0);
    } else {
      ctxA.translate(padding, 0);
    }
    const pathA = fontA.opentype.getPath(char, 0, fontSize, fontSize);
    ctxA.fillStyle = '#ffffff';
    pathA.fill = '#ffffff';
    pathA.draw(ctxA);
    ctxA.restore();
  }

  // Draw glyph B
  if (fontB && fontB.opentype) {
    ctxB.save();
    if (widthStretch !== 1.0) {
      ctxB.transform(widthStretch, 0, 0, 1, padding, 0);
    } else {
      ctxB.translate(padding, 0);
    }
    const pathB = fontB.opentype.getPath(char, 0, fontSize, fontSize);
    ctxB.fillStyle = '#ffffff';
    pathB.fill = '#ffffff';
    pathB.draw(ctxB);
    ctxB.restore();
  }

  // Blend pixels
  const dataA = ctxA.getImageData(0, 0, w, h);
  const dataB = ctxB.getImageData(0, 0, w, h);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w; outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d');
  const outData = outCtx.createImageData(w, h);

  for (let i = 0; i < dataA.data.length; i += 4) {
    // Blend alpha channel (the main visible part for text)
    const alphaA = dataA.data[i + 3];
    const alphaB = dataB.data[i + 3];

    // Smooth interpolation with smoothness factor (sigmoid-like curve)
    let effectiveRatio = ratio;
    if (smoothness > 0) {
      const s = smoothness * 0.1;
      effectiveRatio = 0.5 + (ratio - 0.5) * (1 - s) + Math.tanh((ratio - 0.5) * 3) * s * 0.5;
    }

    const blendedAlpha = Math.round(alphaA * (1 - effectiveRatio) + alphaB * effectiveRatio);

    outData.data[i] = 255;     // R
    outData.data[i + 1] = 255; // G
    outData.data[i + 2] = 255; // B
    outData.data[i + 3] = blendedAlpha;
  }

  outCtx.putImageData(outData, 0, 0);

  // Apply Gaussian blur for smoothness
  if (smoothness > 20) {
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = w; blurCanvas.height = h;
    const blurCtx = blurCanvas.getContext('2d');
    const blurAmount = (smoothness - 20) / 80 * 2; // 0-2px
    blurCtx.filter = `blur(${blurAmount}px)`;
    blurCtx.drawImage(outCanvas, 0, 0);
    return blurCanvas;
  }

  return outCanvas;
}

/**
 * Blend an entire string of text using canvas blending.
 * Returns a canvas with the full text rendered.
 */
function canvasBlendText(fontA, fontB, text, fontSize, ratio, options = {}) {
  const { spacing = 0, widthStretch = 1.0 } = options;

  // First pass: measure total width
  const chars = [...text];
  const charCanvases = chars.map(ch => {
    if (ch === ' ') return null;
    return canvasBlendChar(fontA, fontB, ch, fontSize, ratio, { ...options, widthStretch });
  });

  const charWidth = Math.ceil(fontSize * widthStretch * 1.5) + 20;
  const totalWidth = charCanvases.length * (charWidth + spacing) + 40;
  const totalHeight = Math.ceil(fontSize * 1.5) + 40;

  const result = document.createElement('canvas');
  result.width = totalWidth;
  result.height = totalHeight;
  const ctx = result.getContext('2d');

  let x = 10;
  for (let i = 0; i < charCanvases.length; i++) {
    const cc = charCanvases[i];
    if (cc) {
      ctx.drawImage(cc, x, 5);
    }
    x += charWidth + spacing;
  }

  return result;
}

// ─── GLYPH INTERPOLATION MODE ───────────────────────────────────

/**
 * Interpolate a single glyph between two fonts.
 * Uses path-level interpolation when possible.
 */
function interpolateGlyph(fontA, fontB, char, fontSize, ratio) {
  const glyphA = fontA.opentype.charToGlyph(char);
  const glyphB = fontB.opentype.charToGlyph(char);

  const pathA = glyphA.getPath(0, 0, fontSize);
  const pathB = glyphB.getPath(0, 0, fontSize);

  if (pathA.commands.length === 0 && pathB.commands.length === 0) return null;
  if (pathA.commands.length === 0) return pathB;
  if (pathB.commands.length === 0) return pathA;

  return interpolatePaths(pathA, pathB, ratio);
}

/**
 * Render interpolated text to a canvas.
 */
function renderInterpolatedText(fontA, fontB, text, fontSize, ratio, options = {}) {
  const { spacing = 0, widthStretch = 1.0 } = options;
  const chars = [...text];

  // Interpolate each glyph
  const paths = chars.map(ch => {
    if (ch === ' ') return null;
    return interpolateGlyph(fontA, fontB, ch, fontSize, ratio);
  });

  // Measure total width
  const advanceWidth = fontSize * 0.6 * widthStretch;
  const totalWidth = chars.length * (advanceWidth + spacing) + 40;
  const totalHeight = fontSize * 2 + 40;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(totalWidth, 100);
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#e8e8f0';
  let x = 20;

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (path) {
      ctx.save();
      if (widthStretch !== 1.0) {
        ctx.transform(widthStretch, 0, 0, 1, x, 0);
      } else {
        ctx.translate(x, 0);
      }
      ctx.fillStyle = '#e8e8f0';
      path.fill = '#e8e8f0';

      // Shift path to correct baseline
      const shiftPath = {
        commands: path.commands.map(cmd => {
          const nc = { ...cmd };
          if (nc.y !== undefined) nc.y += fontSize;
          if (nc.y1 !== undefined) nc.y1 += fontSize;
          if (nc.y2 !== undefined) nc.y2 += fontSize;
          return nc;
        }),
      };
      // Draw using opentype path commands manually
      ctx.beginPath();
      for (const cmd of shiftPath.commands) {
        switch (cmd.type) {
          case 'M': ctx.moveTo(cmd.x, cmd.y); break;
          case 'L': ctx.lineTo(cmd.x, cmd.y); break;
          case 'Q': ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y); break;
          case 'C': ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y); break;
          case 'Z': ctx.closePath(); break;
        }
      }
      ctx.fill();
      ctx.restore();
    }
    x += advanceWidth + spacing;
  }

  return canvas;
}

// ─── INDIVIDUAL GLYPH CELLS ─────────────────────────────────────

/**
 * Render a single glyph cell (for the glyph grid display).
 * Returns a small canvas.
 */
function renderGlyphCell(fontA, fontB, char, size, ratio, mode) {
  const cellSize = size || 64;
  const fontSize = cellSize * 0.6;

  if (mode === 'canvas-blend') {
    return canvasBlendChar(fontA, fontB, char, fontSize, ratio, {});
  }

  // glyph-interp mode
  const canvas = document.createElement('canvas');
  canvas.width = cellSize;
  canvas.height = cellSize;
  const ctx = canvas.getContext('2d');

  const path = interpolateGlyph(fontA, fontB, char, fontSize, ratio);
  if (!path) return canvas;

  ctx.fillStyle = '#e8e8f0';
  ctx.save();
  ctx.translate((cellSize - fontSize * 0.6) / 2, 0);
  ctx.beginPath();
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M': ctx.moveTo(cmd.x, cmd.y + fontSize); break;
      case 'L': ctx.lineTo(cmd.x, cmd.y + fontSize); break;
      case 'Q': ctx.quadraticCurveTo(cmd.x1, cmd.y1 + fontSize, cmd.x, cmd.y + fontSize); break;
      case 'C': ctx.bezierCurveTo(cmd.x1, cmd.y1 + fontSize, cmd.x2, cmd.y2 + fontSize, cmd.x, cmd.y + fontSize); break;
      case 'Z': ctx.closePath(); break;
    }
  }
  ctx.fill();
  ctx.restore();

  return canvas;
}

// ─── CSS OVERLAY MODE ───────────────────────────────────────────

/**
 * Create a CSS overlay element that layers both fonts.
 * Returns a DOM element (not canvas).
 */
function createCssOverlay(text, familyA, familyB, ratio, fontSize) {
  const container = document.createElement('div');
  container.className = 'css-overlay-container';
  container.style.fontSize = fontSize + 'px';

  // Font B layer (underneath)
  const layerB = document.createElement('div');
  layerB.className = 'css-overlay-b';
  layerB.style.fontFamily = `"${familyB}", sans-serif`;
  layerB.style.color = `rgba(232, 232, 240, ${ratio})`;
  layerB.textContent = text;
  layerB.style.position = 'absolute';
  layerB.style.top = '0';
  layerB.style.left = '0';

  // Font A layer (on top)
  const layerA = document.createElement('div');
  layerA.className = 'css-overlay-a';
  layerA.style.fontFamily = `"${familyA}", sans-serif`;
  layerA.style.color = `rgba(232, 232, 240, ${1 - ratio})`;
  layerA.textContent = text;
  layerA.style.position = 'relative';

  container.appendChild(layerB);
  container.appendChild(layerA);

  return container;
}

export {
  interpolatePaths,
  canvasBlendChar,
  canvasBlendText,
  interpolateGlyph,
  renderInterpolatedText,
  renderGlyphCell,
  createCssOverlay,
};
