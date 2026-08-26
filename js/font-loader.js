/**
 * font-loader.js
 * Handles loading fonts from Google Fonts and user file uploads.
 * Parses fonts using opentype.js for glyph-level access.
 */

// Curated Google Fonts list (popular, diverse set for mixing)
const GOOGLE_FONTS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald',
  'Source Sans Pro', 'Slabo 27px', 'Raleway', 'PT Sans', 'Merriweather',
  'Roboto Condensed', 'Roboto Slab', 'Playfair Display', 'Ubuntu',
  'Noto Sans', 'Noto Serif', 'Poppins', 'Nunito', 'Rubik', 'Work Sans',
  'Fira Sans', 'Quicksand', 'Barlow', 'Mulish', 'Karla',
  'Inconsolata', 'Titillium Web', 'Libre Baskerville', 'Arimo',
  'Dosis', 'Oxygen', 'Alegreya', 'PT Serif', 'IBM Plex Sans',
  'Cabin', 'Comfortaa', 'Josefin Sans', 'Bitter', 'Anton',
  'Lobster', 'Pacifico', 'Dancing Script', 'Caveat', 'Shadows Into Light',
  'Bebas Neue', 'Abril Fatface', 'Righteous', 'Permanent Marker',
];

// Cache loaded font objects: { name: { opentype, family, url } }
const fontCache = {};

/**
 * Fetch the Google Fonts CSS with a TTF-compatible user-agent
 * and parse out the actual font file URLs.
 */
async function fetchGoogleFontUrls(fontName) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@100;300;400;500;700;900`;

  try {
    const resp = await fetch(cssUrl, {
      headers: {
        // Request TTF format (supported by opentype.js)
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
      },
    });
    if (!resp.ok) return null;

    const css = await resp.text();
    // Parse all url() references from the CSS
    const urlMatches = [...css.matchAll(/url\(([^)]+)\)/g)];
    const urls = urlMatches.map(m => m[1].replace(/['"]/g, ''));

    // Also extract weight info from the CSS
    const weightBlocks = [...css.matchAll(/@font-face\s*\{[^}]*font-weight:\s*(\d+)[^}]*url\(([^)]+)\)[^}]*\}/g)];
    const weightMap = {};
    weightBlocks.forEach(m => {
      weightMap[m[1]] = m[2].replace(/['"]/g, '');
    });

    return {
      urls,
      weightMap,
      // Prefer regular (400) weight, fallback to first available
      defaultUrl: weightMap['400'] || weightMap['300'] || weightMap['500'] || urls[0] || null,
    };
  } catch {
    return null;
  }
}

/**
 * Load a font by name. Checks cache first, then fetches from Google Fonts.
 * Returns an opentype.js Font object.
 */
async function loadGoogleFont(fontName) {
  if (fontCache[fontName]) return fontCache[fontName];

  const fontInfo = await fetchGoogleFontUrls(fontName);
  if (!fontInfo || !fontInfo.defaultUrl) {
    throw new Error(`Could not find font URL for: ${fontName}`);
  }

  // Fetch the actual font file
  const fontResp = await fetch(fontInfo.defaultUrl);
  if (!fontResp.ok) throw new Error(`Failed to download font: ${fontName}`);

  const buffer = await fontResp.arrayBuffer();

  // Parse with opentype.js
  if (typeof opentype === 'undefined') {
    throw new Error('opentype.js not loaded');
  }
  const font = opentype.parse(buffer);

  fontCache[fontName] = {
    opentype: font,
    family: fontName,
    url: fontInfo.defaultUrl,
    weightMap: fontInfo.weightMap,
  };

  return fontCache[fontName];
}

/**
 * Load a font from a user-uploaded file.
 * Returns { opentype, family, name }.
 */
async function loadFontFile(file) {
  const buffer = await file.arrayBuffer();

  if (typeof opentype === 'undefined') {
    throw new Error('opentype.js not loaded');
  }

  const font = opentype.parse(buffer);
  const family = font.names.fontFamily?.en || file.name.replace(/\.\w+$/, '');
  const cacheKey = `upload:${family}:${file.name}`;

  fontCache[cacheKey] = {
    opentype: font,
    family,
    url: null,
    fileName: file.name,
  };

  return fontCache[cacheKey];
}

/**
 * Populate a <select> element with Google Fonts options.
 */
function populateFontSelect(selectEl) {
  GOOGLE_FONTS.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });
}

/**
 * Add a custom uploaded font to a select element.
 */
function addUploadedFontToSelect(selectEl, cacheKey, displayName) {
  const opt = document.createElement('option');
  opt.value = cacheKey;
  opt.textContent = `${displayName} (uploaded)`;
  opt.selected = true;
  // Insert after the placeholder
  if (selectEl.options.length > 1) {
    selectEl.insertBefore(opt, selectEl.options[1]);
  } else {
    selectEl.appendChild(opt);
  }
}

/**
 * Get a loaded font by its cache key (Google Font name or upload key).
 */
function getFont(key) {
  return fontCache[key] || null;
}

/**
 * Render a preview of a font into a DOM element.
 * Uses Google Fonts CSS for display if available, else falls back to canvas.
 */
function renderPreview(fontData, element, text = 'AaBbCcDd') {
  if (!fontData) return;

  if (fontData.url) {
    // Google Font — load via CSS @font-face
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: "${fontData.family}-preview"; src: url("${fontData.url}"); }`;
    document.head.appendChild(style);
    element.style.fontFamily = `"${fontData.family}-preview", sans-serif`;
    element.textContent = text;
  } else if (fontData.opentype) {
    // Uploaded font — render via canvas
    // Clear previous content safely
    while (element.firstChild) element.removeChild(element.firstChild);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 40;
    const path = fontData.opentype.getPath(text, 0, fontSize, fontSize);
    const bbox = path.getBoundingBox();

    canvas.width = Math.max(bbox.x2 - bbox.x1 + 20, 200);
    canvas.height = fontSize + 20;
    canvas.style.maxWidth = '100%';

    const ctxBg = 'transparent';
    ctx.fillStyle = ctxBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#e8e8f0';
    const offsetX = -bbox.x1 + 10;
    const offsetY = -bbox.y1 + 5;

    // Re-render with offset
    const shiftedPath = fontData.opentype.getPath(text, offsetX, fontSize + offsetY - bbox.y2 + bbox.y1, fontSize);
    shiftedPath.fill = '#e8e8f0';
    shiftedPath.draw(ctx);

    element.appendChild(canvas);
  }
}

export {
  GOOGLE_FONTS,
  loadGoogleFont,
  loadFontFile,
  populateFontSelect,
  addUploadedFontToSelect,
  getFont,
  renderPreview,
  fontCache,
};
