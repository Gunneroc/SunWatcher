/**
 * Nominatim geocoding with rate limiting.
 */
import { fetchWithRetry } from './utils.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
let lastRequestTime = 0;

/**
 * Rate-limit Nominatim requests to 1 per second.
 */
async function rateLimitWait() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await new Promise(r => setTimeout(r, 1100 - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Geocode a location string to lat/lng candidates.
 * Returns array of {lat, lng, displayName, type, importance}.
 */
export async function geocode(query) {
  await rateLimitWait();

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    addressdetails: '1'
  });

  const response = await fetchWithRetry(`${NOMINATIM_URL}?${params}`, {
    headers: {
      'User-Agent': 'SunsetScout/1.0 (sunset-viewpoint-finder)',
      'Accept': 'application/json'
    }
  });

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error('Location not found. Try being more specific.');
  }

  return data.map(item => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: item.display_name,
    type: item.type,
    importance: item.importance
  }));
}
