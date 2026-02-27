/**
 * Coordinate math utilities: haversine, bearing, destination point, grid generation.
 */

const R_EARTH = 6371000; // Earth radius in meters
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Haversine distance between two lat/lng points in meters.
 */
export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial bearing from point A to point B in degrees (0-360).
 */
export function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG2RAD;
  const φ2 = lat2 * DEG2RAD;
  const Δλ = (lng2 - lng1) * DEG2RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
}

/**
 * Destination point given start, bearing (degrees), and distance (meters).
 */
export function destinationPoint(lat, lng, bearingDeg, distanceM) {
  const δ = distanceM / R_EARTH;
  const θ = bearingDeg * DEG2RAD;
  const φ1 = lat * DEG2RAD;
  const λ1 = lng * DEG2RAD;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return {
    lat: φ2 * RAD2DEG,
    lng: ((λ2 * RAD2DEG) + 540) % 360 - 180 // normalize to -180..180
  };
}

/**
 * Earth curvature drop at a given distance (meters).
 */
export function curvatureDrop(distanceM) {
  return (distanceM * distanceM) / (2 * R_EARTH);
}

/**
 * Generate a hex grid of points within a radius (meters) of center.
 * Returns array of {lat, lng} objects.
 */
export function generateHexGrid(centerLat, centerLng, radiusM, spacingM) {
  const points = [];
  const rowSpacing = spacingM * Math.sqrt(3) / 2;
  const maxRows = Math.ceil(radiusM / rowSpacing);

  for (let row = -maxRows; row <= maxRows; row++) {
    const y = row * rowSpacing;
    if (Math.abs(y) > radiusM) continue;

    const maxCols = Math.ceil(radiusM / spacingM);
    const offset = (row % 2 !== 0) ? spacingM / 2 : 0;

    for (let col = -maxCols; col <= maxCols; col++) {
      const x = col * spacingM + offset;
      const dist = Math.sqrt(x * x + y * y);
      if (dist > radiusM) continue;

      // Convert x/y offsets to lat/lng
      const bearingToPoint = (Math.atan2(x, y) * RAD2DEG + 360) % 360;
      const pt = destinationPoint(centerLat, centerLng, bearingToPoint, dist);
      points.push(pt);
    }
  }

  return points;
}

/**
 * Chunk an array into groups of a given size.
 */
export function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Convert azimuth degrees to compass direction string.
 */
export function azimuthToCompass(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}

/**
 * Format a Date to local time string (HH:MM AM/PM).
 */
export function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Format distance in meters to human-readable string.
 */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Run async functions with a concurrency limit.
 */
export async function asyncPool(limit, items, fn) {
  const results = [];
  const executing = new Set();

  for (const [index, item] of items.entries()) {
    const p = Promise.resolve().then(() => fn(item, index));
    results.push(p);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean, clean);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * Fetch with retry and exponential backoff.
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}

export { R_EARTH, DEG2RAD, RAD2DEG };
