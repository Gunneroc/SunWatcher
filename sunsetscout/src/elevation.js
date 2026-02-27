/**
 * Elevation API with fallback providers, batching, and caching.
 * Primary: Open-Meteo Elevation API
 * Fallback: Open-Elevation API
 */
import { chunk, asyncPool, fetchWithRetry } from './utils.js';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation';
const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';
const BATCH_SIZE = 100;
const CONCURRENCY = 2;

// In-memory elevation cache (keyed by rounded coordinates)
const elevationCache = new Map();

function cacheKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Fetch a batch of elevations from Open-Meteo (GET with comma-separated coords).
 */
async function fetchBatchOpenMeteo(batch) {
  const lats = batch.map(p => p.lat.toFixed(5)).join(',');
  const lngs = batch.map(p => p.lng.toFixed(5)).join(',');

  const response = await fetchWithRetry(
    `${OPEN_METEO_URL}?latitude=${lats}&longitude=${lngs}`,
    {},
    2
  );
  const data = await response.json();
  return data.elevation || [];
}

/**
 * Fetch a batch of elevations from Open-Elevation (POST with JSON body).
 */
async function fetchBatchOpenElevation(batch) {
  const locations = batch.map(p => ({
    latitude: parseFloat(p.lat.toFixed(5)),
    longitude: parseFloat(p.lng.toFixed(5))
  }));

  const response = await fetchWithRetry(
    OPEN_ELEVATION_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations })
    },
    2
  );
  const data = await response.json();
  if (!data.results) throw new Error('No results from Open-Elevation');
  return data.results.map(r => r.elevation);
}

/**
 * Fetch a batch of elevations, trying Open-Meteo first then Open-Elevation.
 */
async function fetchBatchWithFallback(batch) {
  try {
    return await fetchBatchOpenMeteo(batch);
  } catch (err) {
    console.warn('Open-Meteo elevation failed, trying fallback:', err.message);
  }

  try {
    return await fetchBatchOpenElevation(batch);
  } catch (err) {
    console.warn('Open-Elevation fallback also failed:', err.message);
  }

  return batch.map(() => null);
}

/**
 * Fetch elevations for an array of {lat, lng} points.
 * Returns the same array with `elevation` property added.
 * Uses batching and concurrency limiting with automatic fallback.
 * @param {Array<{lat: number, lng: number}>} points
 * @param {function} onProgress - optional callback(completed, total)
 */
export async function fetchElevations(points, onProgress) {
  // Check cache first, separate cached vs uncached
  const results = new Array(points.length);
  const uncachedIndices = [];

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

  // Batch uncached points
  const uncachedPoints = uncachedIndices.map(i => points[i]);
  const batches = chunk(uncachedPoints, BATCH_SIZE);
  let completed = points.length - uncachedIndices.length;

  const batchResults = await asyncPool(CONCURRENCY, batches, async (batch) => {
    const elevations = await fetchBatchWithFallback(batch);
    completed += batch.length;
    if (onProgress) onProgress(completed, points.length);
    return elevations;
  });

  // Merge results back
  let batchIdx = 0;
  let withinBatch = 0;
  for (const originalIdx of uncachedIndices) {
    const elev = batchResults[batchIdx][withinBatch];
    const pt = points[originalIdx];
    if (elev != null) {
      const key = cacheKey(pt.lat, pt.lng);
      elevationCache.set(key, elev);
      results[originalIdx] = { ...pt, elevation: elev };
    } else {
      results[originalIdx] = { ...pt, elevation: null };
    }

    withinBatch++;
    if (withinBatch >= BATCH_SIZE) {
      batchIdx++;
      withinBatch = 0;
    }
  }

  // If all elevations failed, throw so the caller can show an error
  const validCount = results.filter(r => r && r.elevation != null).length;
  if (validCount === 0) {
    throw new Error('All elevation requests failed');
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

  // Re-structure back into rays
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
}
