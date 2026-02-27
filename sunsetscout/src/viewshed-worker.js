/**
 * Web Worker for CPU-intensive viewshed obstruction computation.
 * Receives candidates with pre-fetched ray elevations, computes obstruction angles.
 */

const CURVATURE_THRESHOLD = 2000;
const R_EARTH = 6371000;

function curvatureDrop(distanceM) {
  return (distanceM * distanceM) / (2 * R_EARTH);
}

function computeObstruction(candidate, raySamples) {
  let maxAngle = -90;
  let maxBlockerDistance = 0;
  let maxBlockerElevation = 0;

  for (const sample of raySamples) {
    const dist = sample.distance;
    let terrainElev = sample.elevation;
    if (dist > CURVATURE_THRESHOLD) terrainElev -= curvatureDrop(dist);
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
    isClear: maxAngle < 0.5
  };
}

self.onmessage = function(event) {
  const { candidates, rayElevations, sunBearing, sunAltitude } = event.data;
  const results = [];

  for (let i = 0; i < candidates.length; i++) {
    const obstruction = computeObstruction(candidates[i], rayElevations[i]);

    results.push({
      ...candidates[i],
      ...obstruction,
      sunAltitude,
      sunBearing,
      viewQuality: obstruction.isClear ? 'clear' : 'obstructed'
    });

    if (i % 100 === 0 || i === candidates.length - 1) {
      self.postMessage({ type: 'progress', completed: i + 1, total: candidates.length });
    }
  }

  self.postMessage({ type: 'result', data: results });
};
