/**
 * Viewshed analysis — ray-casting along sunset bearing.
 * Elevation fetching runs on the main thread (needs DOM for terrain tiles).
 * Obstruction computation is delegated to a Web Worker for UI responsiveness.
 */
import { destinationPoint, curvatureDrop } from './utils.js';
import { fetchElevations } from './elevation.js';

const RAY_SAMPLE_SPACING = 300;  // meters between samples along ray
const RAY_MAX_DISTANCE = 8000;   // meters max ray distance
const CURVATURE_THRESHOLD = 2000; // apply curvature correction beyond this

/**
 * Generate sample points along a ray from an origin in a given bearing.
 */
export function generateRayPoints(originLat, originLng, bearingDeg, maxDist = RAY_MAX_DISTANCE, spacing = RAY_SAMPLE_SPACING) {
  const points = [];
  for (let d = spacing; d <= maxDist; d += spacing) {
    const pt = destinationPoint(originLat, originLng, bearingDeg, d);
    points.push({ ...pt, distance: d });
  }
  return points;
}

/**
 * Compute the obstruction angle for a candidate viewpoint along a bearing.
 * @param {object} candidate - {lat, lng, elevation}
 * @param {Array} raySamples - [{lat, lng, elevation, distance}]
 * @returns {object} {obstructionAngle, maxBlockerDistance, maxBlockerElevation, isClear}
 */
export function computeObstruction(candidate, raySamples) {
  let maxAngle = -90;
  let maxBlockerDistance = 0;
  let maxBlockerElevation = 0;

  for (const sample of raySamples) {
    const dist = sample.distance;
    let terrainElev = sample.elevation;

    // Apply earth curvature correction for distant points
    if (dist > CURVATURE_THRESHOLD) {
      terrainElev -= curvatureDrop(dist);
    }

    const elevDiff = terrainElev - candidate.elevation;
    const angle = Math.atan2(elevDiff, dist) * (180 / Math.PI);

    if (angle > maxAngle) {
      maxAngle = angle;
      maxBlockerDistance = dist;
      maxBlockerElevation = sample.elevation;
    }
  }

  return {
    obstructionAngle: maxAngle,
    maxBlockerDistance,
    maxBlockerElevation,
    isClear: maxAngle < 0.5 // sun center is ~0.25° radius, give small margin
  };
}

/**
 * Try to run obstruction computation in a Web Worker.
 * Falls back to main-thread computation if the worker fails.
 */
function computeInWorker(validCandidates, rayElevations, sunBearing, sunAltitude, onProgress) {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(
        new URL('./viewshed-worker.js', import.meta.url),
        { type: 'module' }
      );
    } catch {
      resolve(computeOnMainThread(validCandidates, rayElevations, sunBearing, sunAltitude, onProgress));
      return;
    }

    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        if (onProgress) onProgress(msg.completed, msg.total, 'analysis');
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve(msg.data);
      }
    };

    worker.onerror = () => {
      console.warn('Viewshed worker failed, falling back to main thread');
      worker.terminate();
      resolve(computeOnMainThread(validCandidates, rayElevations, sunBearing, sunAltitude, onProgress));
    };

    worker.postMessage({
      candidates: validCandidates.map(c => ({ lat: c.lat, lng: c.lng, elevation: c.elevation })),
      rayElevations,
      sunBearing,
      sunAltitude
    });
  });
}

/**
 * Main-thread fallback for obstruction computation.
 */
function computeOnMainThread(validCandidates, rayElevations, sunBearing, sunAltitude, onProgress) {
  const results = [];
  for (let i = 0; i < validCandidates.length; i++) {
    const obstruction = computeObstruction(validCandidates[i], rayElevations[i]);
    results.push({
      ...validCandidates[i],
      ...obstruction,
      sunAltitude,
      sunBearing,
      viewQuality: obstruction.isClear ? 'clear' : 'obstructed'
    });
    if (onProgress && (i % 100 === 0 || i === validCandidates.length - 1)) {
      onProgress(i + 1, validCandidates.length, 'analysis');
    }
  }
  return results;
}

/**
 * Run full viewshed analysis for a set of candidate points.
 * Elevation fetching on main thread, computation delegated to Web Worker.
 * @param {Array} candidates - [{lat, lng, elevation}] with elevations already fetched
 * @param {number} sunBearing - sunset azimuth in degrees
 * @param {number} sunAltitude - sun altitude at sunset in degrees
 * @param {function} onProgress - optional callback(completed, total, phase)
 * @returns {Array} candidates with viewshed results added
 */
export async function analyzeViewshed(candidates, sunBearing, sunAltitude, onProgress) {
  // Filter out candidates with null elevation
  const validCandidates = candidates.filter(c => c.elevation != null);

  // Generate all ray sample points (main thread — just math)
  const allRayPoints = [];
  const rayPointCounts = [];

  for (const c of validCandidates) {
    const rayPts = generateRayPoints(c.lat, c.lng, sunBearing);
    allRayPoints.push(...rayPts);
    rayPointCounts.push(rayPts.length);
  }

  // Fetch all ray elevations in bulk (main thread — needs DOM for terrain tiles)
  const elevatedPoints = await fetchElevations(allRayPoints, (done, total) => {
    if (onProgress) onProgress(done, total, 'elevation');
  });

  // Split into per-candidate ray arrays for the worker
  let offset = 0;
  const rayElevations = [];
  for (let i = 0; i < validCandidates.length; i++) {
    const count = rayPointCounts[i];
    const raySamples = elevatedPoints.slice(offset, offset + count)
      .filter(pt => pt.elevation != null)
      .map((pt, j) => ({
        lat: pt.lat,
        lng: pt.lng,
        elevation: pt.elevation,
        distance: (j + 1) * RAY_SAMPLE_SPACING
      }));
    offset += count;
    rayElevations.push(raySamples);
  }

  // Delegate obstruction computation to worker (or fallback)
  if (onProgress) onProgress(0, validCandidates.length, 'analysis');

  return computeInWorker(validCandidates, rayElevations, sunBearing, sunAltitude, onProgress);
}
