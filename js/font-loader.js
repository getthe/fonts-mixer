/**
 * font-loader.js
 * Handles loading fonts from Google Fonts and user file uploads.
 *
 * Google Fonts are loaded via CSS <link> tag (no CORS issues).
 * Opentype.js parsing is used only for uploaded .ttf/.otf files
 * (enables glyph-level interpolation).
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

// Cache loaded font objects: { name: { opentype?, family, source } }
const fontCache = {};

/**
 * Load a Google Font by injecting a CSS <link> tag.
 * This avoids all CORS issues and makes the font available
 * for CSS font-family and canvas fillText immediately.
 * Returns synchronously so the mix button enables right away.
 */
function loadGoogleFont(fontName) {
  if (fontCache[fontName]) return fontCache[fontName];

  const id = `gfont-${fontName.replace(/\s/g, '-')}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@100;300;400;500;700;900&display=swap`;
    document.head.appendChild(link);
  }

  const fontData = {
    family: fontName,
    source: 'google',
    opentype: null, // no glyph-level data; canvas-blend & css-overlay work via CSS
  };

  fontCache[fontName] = fontData;
  return fontData;
}

/**
 * Load a font from a user-uploaded file.
 * Parses with opentype.js for full glyph-level access.
 */
async function loadFontFile(file) {
  const buffer = await file.arrayBuffer();

  if (typeof opentype === 'undefined') {
    throw new Error('opentype.js not loaded');
  }

  const font = opentype.parse(buffer);
  const family = font.names.fontFamily?.en || file.name.replace(/\.\w+$/, '');
  const cacheKey = `upload:${family}:${file.name}`;

  const fontData = {
    opentype: font,
    family,
    source: 'upload',
    fileName: file.name,
  };

  fontCache[cacheKey] = fontData;
  return fontData;
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
  if (selectEl.options.length > 1) {
    selectEl.insertBefore(opt, selectEl.options[1]);
  } else {
    selectEl.appendChild(opt);
  }
}

/**
 * Get a loaded font by its cache key.
 */
function getFont(key) {
  return fontCache[key] || null;
}

/**
 * Render a preview of a font into a DOM element.
 * Google Fonts use CSS font-family; uploaded fonts use canvas.
 */
function renderPreview(fontData, element, text = 'AaBbCcDd') {
  if (!fontData) return;

  if (fontData.source === 'google') {
    element.style.fontFamily = `"${fontData.family}", sans-serif`;
    element.textContent = text;
  } else if (fontData.opentype) {
    // Uploaded font — render via canvas
    while (element.firstChild) element.removeChild(element.firstChild);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 40;
    const path = fontData.opentype.getPath(text, 10, fontSize + 5, fontSize);
    const bbox = path.getBoundingBox();

    canvas.width = Math.max(bbox.x2 - bbox.x1 + 20, 200);
    canvas.height = fontSize + 20;
    canvas.style.maxWidth = '100%';

    ctx.fillStyle = '#e8e8f0';
    path.fill = '#e8e8f0';
    path.draw(ctx);

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
