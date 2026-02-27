/**
 * Open-Meteo Elevation API with batching and caching.
 */
import { chunk, asyncPool, fetchWithRetry } from './utils.js';

const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const BATCH_SIZE = 250;
const CONCURRENCY = 2;

// In-memory elevation cache (keyed by rounded coordinates)
const elevationCache = new Map();

function cacheKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Fetch elevations for an array of {lat, lng} points.
 * Returns the same array with `elevation` property added.
 * Uses batching (100 per request) and concurrency limiting.
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
    const lats = batch.map(p => p.lat.toFixed(5)).join(',');
    const lngs = batch.map(p => p.lng.toFixed(5)).join(',');

    try {
      const response = await fetchWithRetry(
        `${ELEVATION_URL}?latitude=${lats}&longitude=${lngs}`
      );
      const data = await response.json();
      const elevations = data.elevation || [];

      completed += batch.length;
      if (onProgress) onProgress(completed, points.length);

      return elevations;
    } catch (err) {
      console.warn('Elevation batch failed, skipping:', err.message);
      completed += batch.length;
      if (onProgress) onProgress(completed, points.length);
      return batch.map(() => null);
    }
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
