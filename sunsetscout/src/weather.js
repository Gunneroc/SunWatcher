/**
 * Weather data from Open-Meteo forecast API.
 */
import { fetchWithRetry } from './utils.js';

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch weather forecast for a location.
 * Returns daily cloud cover and precipitation data.
 */
export async function fetchWeather(lat, lng) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: 'cloud_cover_mean,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7'
  });

  const response = await fetchWithRetry(`${WEATHER_URL}?${params}`);
  const data = await response.json();

  if (!data.daily) {
    throw new Error('Weather data unavailable');
  }

  return data.daily.time.map((date, i) => ({
    date,
    cloudCover: data.daily.cloud_cover_mean[i],
    precipProbability: data.daily.precipitation_probability_max[i],
    quality: rateSunsetQuality(data.daily.cloud_cover_mean[i], data.daily.precipitation_probability_max[i])
  }));
}

/**
 * Rate the sunset quality based on weather conditions.
 */
export function rateSunsetQuality(cloudCover, precipProb) {
  if (precipProb > 60) return { label: 'Poor', class: 'poor', icon: '🌧', description: 'Rain likely — poor visibility' };
  if (cloudCover < 15) return { label: 'Great', class: 'great', icon: '☀', description: 'Clear skies — excellent sunset' };
  if (cloudCover < 40) return { label: 'Amazing', class: 'amazing', icon: '🌅', description: 'Partial clouds — potentially stunning colors' };
  if (cloudCover < 70) return { label: 'Fair', class: 'fair', icon: '⛅', description: 'Moderate clouds — decent sunset possible' };
  return { label: 'Poor', class: 'poor', icon: '☁', description: 'Overcast — limited sunset visibility' };
}
