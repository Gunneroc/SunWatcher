/**
 * Weather data from Open-Meteo forecast API.
 * Fetches hourly data to get conditions at the actual sunset hour.
 */
import { fetchWithRetry } from './utils.js';

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch weather forecast for a location, focused on the sunset hour.
 * @param {number} lat
 * @param {number} lng
 * @param {Date} sunsetTime - the sunset Date to extract the right hour
 */
export async function fetchWeather(lat, lng, sunsetTime) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: 'cloud_cover,precipitation_probability,visibility,wind_speed_10m',
    daily: 'cloud_cover_mean,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7'
  });

  const response = await fetchWithRetry(`${WEATHER_URL}?${params}`);
  const data = await response.json();

  if (!data.daily) {
    throw new Error('Weather data unavailable');
  }

  const sunsetHour = sunsetTime ? sunsetTime.getHours() : 19;

  return data.daily.time.map((date, i) => {
    // Try to get hourly data at sunset hour for this day
    const hourly = extractHourlyAtSunset(data.hourly, date, sunsetHour);

    const cloudCover = hourly ? hourly.cloudCover : data.daily.cloud_cover_mean[i];
    const precipProb = hourly ? hourly.precipProb : data.daily.precipitation_probability_max[i];
    const visibility = hourly ? hourly.visibility : null;
    const windSpeed = hourly ? hourly.windSpeed : null;

    return {
      date,
      cloudCover,
      precipProbability: precipProb,
      visibility,
      windSpeed,
      isHourly: !!hourly,
      quality: rateSunsetQuality(cloudCover, precipProb, visibility, windSpeed)
    };
  });
}

/**
 * Extract hourly weather values at the sunset hour for a given date.
 * @returns {{cloudCover, precipProb, visibility, windSpeed}} or null
 */
function extractHourlyAtSunset(hourly, dateStr, sunsetHour) {
  if (!hourly || !hourly.time) return null;

  // Find the index matching this date at the sunset hour
  const targetTime = `${dateStr}T${String(sunsetHour).padStart(2, '0')}:00`;
  const idx = hourly.time.indexOf(targetTime);
  if (idx === -1) return null;

  return {
    cloudCover: hourly.cloud_cover[idx],
    precipProb: hourly.precipitation_probability[idx],
    visibility: hourly.visibility ? hourly.visibility[idx] : null,
    windSpeed: hourly.wind_speed_10m ? hourly.wind_speed_10m[idx] : null
  };
}

/**
 * Rate the sunset quality based on weather conditions.
 */
export function rateSunsetQuality(cloudCover, precipProb, visibility, windSpeed) {
  // Heavy rain or very low visibility = poor
  if (precipProb > 60) return { label: 'Poor', class: 'poor', icon: '🌧', description: 'Rain likely — poor visibility' };
  if (visibility != null && visibility < 5000) return { label: 'Poor', class: 'poor', icon: '🌫', description: 'Low visibility — hazy conditions' };

  // Strong wind degrades experience
  if (windSpeed != null && windSpeed > 50) return { label: 'Fair', class: 'fair', icon: '💨', description: 'Very windy — uncomfortable viewing' };

  if (cloudCover < 15) return { label: 'Great', class: 'great', icon: '☀', description: 'Clear skies — excellent sunset' };
  if (cloudCover < 40) return { label: 'Amazing', class: 'amazing', icon: '🌅', description: 'Partial clouds — potentially stunning colors' };
  if (cloudCover < 70) return { label: 'Fair', class: 'fair', icon: '⛅', description: 'Moderate clouds — decent sunset possible' };
  return { label: 'Poor', class: 'poor', icon: '☁', description: 'Overcast — limited sunset visibility' };
}
