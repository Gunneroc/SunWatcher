/**
 * Viewshed analysis — ray-casting along sunset bearing.
 * Determines which candidate viewpoints have clear sunset views.
 */
import { destinationPoint, curvatureDrop, haversine } from './utils.js';
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
 * Run full viewshed analysis for a set of candidate points.
 * Fetches ray elevation data and computes obstruction for each candidate.
 * @param {Array} candidates - [{lat, lng, elevation}] with elevations already fetched
 * @param {number} sunBearing - sunset azimuth in degrees
 * @param {number} sunAltitude - sun altitude at sunset in degrees
 * @param {function} onProgress - optional callback(completed, total)
 * @returns {Array} candidates with viewshed results added
 */
export async function analyzeViewshed(candidates, sunBearing, sunAltitude, onProgress) {
  // Generate all ray sample points
  const allRayPoints = [];
  const rayPointCounts = [];

  for (const c of candidates) {
    const rayPts = generateRayPoints(c.lat, c.lng, sunBearing);
    allRayPoints.push(...rayPts);
    rayPointCounts.push(rayPts.length);
  }

  // Fetch all ray elevations in bulk
  const elevatedPoints = await fetchElevations(allRayPoints, (done, total) => {
    if (onProgress) onProgress(done, total, 'elevation');
  });

  // Split back into per-candidate rays and compute obstruction
  let offset = 0;
  const results = [];

  for (let i = 0; i < candidates.length; i++) {
    const count = rayPointCounts[i];
    const raySamples = elevatedPoints.slice(offset, offset + count).map((pt, j) => ({
      ...pt,
      distance: (j + 1) * RAY_SAMPLE_SPACING
    }));
    offset += count;

    const obstruction = computeObstruction(candidates[i], raySamples);

    results.push({
      ...candidates[i],
      ...obstruction,
      sunAltitude,
      sunBearing,
      viewQuality: obstruction.isClear ? 'clear' : 'obstructed'
    });

    if (onProgress) onProgress(i + 1, candidates.length, 'analysis');
  }

  return results;
}
