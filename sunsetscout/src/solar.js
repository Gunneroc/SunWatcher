/**
 * Solar calculations using suncalc library.
 * Computes sunset/sunrise times, azimuth, golden hour.
 */
import SunCalc from 'suncalc';
import { RAD2DEG } from './utils.js';

/**
 * Get comprehensive sun data for a location and date.
 * @param {number} lat
 * @param {number} lng
 * @param {Date} date
 * @param {string} mode - 'sunset' or 'sunrise'
 * @returns {object} Sun data including times and azimuth
 */
export function getSunData(lat, lng, date, mode = 'sunset') {
  const times = SunCalc.getTimes(date, lat, lng);

  const targetTime = mode === 'sunset' ? times.sunset : times.sunrise;
  const goldenHourStart = mode === 'sunset' ? times.goldenHour : times.sunrise;
  const goldenHourEnd = mode === 'sunset' ? times.sunset : times.goldenHourEnd;

  // Get sun position at the target event time
  const sunPosition = SunCalc.getPosition(targetTime, lat, lng);

  // suncalc azimuth: 0 = south, positive = west. Convert to compass bearing (0 = north).
  const azimuthDeg = ((sunPosition.azimuth * RAD2DEG) + 180 + 360) % 360;
  const altitudeDeg = sunPosition.altitude * RAD2DEG;

  return {
    mode,
    targetTime,
    sunriseTime: times.sunrise,
    sunsetTime: times.sunset,
    goldenHourStart,
    goldenHourEnd,
    solarNoon: times.solarNoon,
    azimuth: azimuthDeg,
    altitude: altitudeDeg,
    dawn: times.dawn,
    dusk: times.dusk,
    nauticalDawn: times.nauticalDawn,
    nauticalDusk: times.nauticalDusk
  };
}

/**
 * Get the sun altitude at a specific time and location.
 */
export function getSunAltitude(lat, lng, time) {
  const pos = SunCalc.getPosition(time, lat, lng);
  return pos.altitude * RAD2DEG;
}

/**
 * Get the sun azimuth (compass bearing) at a specific time.
 */
export function getSunAzimuth(lat, lng, time) {
  const pos = SunCalc.getPosition(time, lat, lng);
  return ((pos.azimuth * RAD2DEG) + 180 + 360) % 360;
}
