/**
 * Web Worker for viewshed computation (reserved for future use with heavy grids).
 * Currently the main thread handles analysis, but this worker can be activated
 * for very large grids to keep the UI responsive.
 */

const R_EARTH = 6371000;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function destinationPoint(lat, lng, bearingDeg, distanceM) {
  const δ = distanceM / R_EARTH;
  const θ = bearingDeg * DEG2RAD;
  const φ1 = lat * DEG2RAD;
  const λ1 = lng * DEG2RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 * RAD2DEG, lng: ((λ2 * RAD2DEG) + 540) % 360 - 180 };
}

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
    if (dist > 2000) terrainElev -= curvatureDrop(dist);
    const elevDiff = terrainElev - candidate.elevation;
    const angle = Math.atan2(elevDiff, dist) * RAD2DEG;
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

self.onmessage = function(e) {
  const { candidates, elevationGrid, sunBearing, sunAltitude, raySpacing, rayMaxDist } = e.data;

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];

    // Generate ray points and look up elevations from grid
    const raySamples = [];
    for (let d = raySpacing; d <= rayMaxDist; d += raySpacing) {
      const pt = destinationPoint(c.lat, c.lng, sunBearing, d);
      const key = `${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}`;
      const elev = elevationGrid[key] || 0;
      raySamples.push({ ...pt, elevation: elev, distance: d });
    }

    const obstruction = computeObstruction(c, raySamples);
    results.push({
      ...c,
      ...obstruction,
      sunAltitude,
      sunBearing,
      viewQuality: obstruction.isClear ? 'clear' : 'obstructed'
    });

    if (i % 50 === 0) {
      self.postMessage({ type: 'progress', completed: i, total: candidates.length });
    }
  }

  self.postMessage({ type: 'result', data: results });
};
