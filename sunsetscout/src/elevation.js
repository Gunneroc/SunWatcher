/**
 * Elevation lookup using AWS Terrain Tiles (Terrarium format).
 * Loads PNG tiles where elevation is encoded in RGB values.
 * ~15 tiles cover a 10km radius — orders of magnitude faster than per-point APIs.
 *
 * Tile source: Amazon/Mapzen open terrain data (public domain, no API key).
 * Terrarium encoding: elevation = (R * 256 + G + B / 256) - 32768
 */
// No external dependencies — all tile math is self-contained

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TILE_ZOOM = 12;

// Cache: tile key -> ImageData
const tileImageCache = new Map();
// Cache: coordinate key -> elevation
const elevationCache = new Map();

function cacheKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Convert lat/lng to tile x/y at a given zoom level. */
function getTileCoords(lat, lng, zoom) {
  const n = 1 << zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
  );
  return { tileX: x, tileY: y };
}

/** Convert lat/lng to pixel position within a specific tile. */
function getPixelInTile(lat, lng, zoom, tileX, tileY) {
  const n = 1 << zoom;
  const px = Math.floor(((lng + 180) / 360 * n - tileX) * 256);
  const latRad = lat * Math.PI / 180;
  const py = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - tileY) * 256
  );
  return {
    px: Math.max(0, Math.min(255, px)),
    py: Math.max(0, Math.min(255, py))
  };
}

/** Decode Terrarium RGB to elevation in meters. */
function decodeTerrarium(r, g, b) {
  return (r * 256 + g + b / 256) - 32768;
}

/** Load a terrain tile and return its ImageData. */
function loadTileImage(tileX, tileY, zoom) {
  const key = `${zoom}/${tileX}/${tileY}`;
  if (tileImageCache.has(key)) return tileImageCache.get(key);

  const url = TILE_URL
    .replace('{z}', zoom)
    .replace('{x}', tileX)
    .replace('{y}', tileY);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, 256, 256));
    };
    img.onerror = () => reject(new Error(`Failed to load tile ${key}`));
    img.src = url;
  });

  tileImageCache.set(key, promise);
  return promise;
}

/** Read elevation from an ImageData at a pixel coordinate. */
function readElevation(imageData, px, py) {
  const idx = (py * 256 + px) * 4;
  return decodeTerrarium(
    imageData.data[idx],
    imageData.data[idx + 1],
    imageData.data[idx + 2]
  );
}

/**
 * Fetch elevations for an array of {lat, lng} points.
 * Loads terrain tiles from AWS, decodes elevation client-side.
 * Returns the same array with `elevation` property added.
 * @param {Array<{lat: number, lng: number}>} points
 * @param {function} onProgress - optional callback(completed, total)
 */
export async function fetchElevations(points, onProgress) {
  const results = new Array(points.length);
  const uncachedIndices = [];

  // Check point-level cache
  for (let i = 0; i < points.length; i++) {
    const key = cacheKey(points[i].lat, points[i].lng);
    if (elevationCache.has(key)) {
      results[i] = { ...points[i], elevation: elevationCache.get(key) };
    } else {
      uncachedIndices.push(i);
    }
  }

  if (uncachedIndices.length === 0) {
    if (onProgress) onProgress(points.length, points.length);
    return results;
  }

  // Determine which tiles we need and map points to tiles
  const tilesNeeded = new Map();
  const pointMappings = [];

  for (const idx of uncachedIndices) {
    const pt = points[idx];
    const { tileX, tileY } = getTileCoords(pt.lat, pt.lng, TILE_ZOOM);
    const tileKey = `${TILE_ZOOM}/${tileX}/${tileY}`;
    if (!tilesNeeded.has(tileKey)) {
      tilesNeeded.set(tileKey, { tileX, tileY });
    }
    const { px, py } = getPixelInTile(pt.lat, pt.lng, TILE_ZOOM, tileX, tileY);
    pointMappings.push({ idx, tileKey, px, py });
  }

  if (onProgress) onProgress(0, points.length);

  // Load all needed tiles in parallel
  const tileEntries = [...tilesNeeded.entries()];
  const tileDataMap = new Map();

  const loadPromises = tileEntries.map(async ([key, { tileX, tileY }]) => {
    try {
      const imageData = await loadTileImage(tileX, tileY, TILE_ZOOM);
      tileDataMap.set(key, imageData);
    } catch (err) {
      console.warn(`Tile load failed for ${key}:`, err.message);
    }
  });

  await Promise.all(loadPromises);

  // Look up elevation for each point from loaded tile data
  let completed = points.length - uncachedIndices.length;
  for (const { idx, tileKey, px, py } of pointMappings) {
    const pt = points[idx];
    const imageData = tileDataMap.get(tileKey);

    if (imageData) {
      const elevation = readElevation(imageData, px, py);
      const key = cacheKey(pt.lat, pt.lng);
      elevationCache.set(key, elevation);
      results[idx] = { ...pt, elevation };
    } else {
      results[idx] = { ...pt, elevation: null };
    }

    completed++;
    // Report progress in chunks to avoid overwhelming the UI
    if (completed % 500 === 0 || completed === points.length) {
      if (onProgress) onProgress(completed, points.length);
    }
  }

  if (onProgress) onProgress(points.length, points.length);

  // If no tiles loaded at all, throw
  if (tileDataMap.size === 0) {
    throw new Error('Failed to load any elevation tiles');
  }

  return results;
}

/**
 * Fetch elevations for a list of ray sample points.
 * Optimized for viewshed analysis — flat array in, flat array out.
 */
export async function fetchRayElevations(rayPoints) {
  const allPoints = rayPoints.flat();
  const elevated = await fetchElevations(allPoints);

  let idx = 0;
  return rayPoints.map(ray => {
    const result = elevated.slice(idx, idx + ray.length);
    idx += ray.length;
    return result;
  });
}

/**
 * Clear the elevation cache.
 */
export function clearElevationCache() {
  elevationCache.clear();
  tileImageCache.clear();
}
