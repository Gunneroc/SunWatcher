import { describe, it, expect } from 'vitest';
import { getSunData, getSunAltitude, getSunAzimuth } from '../src/solar.js';

describe('solar', () => {
  // Use a known location and date for predictable results
  const lat = 45.5231; // Portland, OR
  const lng = -122.6765;
  const date = new Date(2024, 5, 21, 12, 0, 0); // June 21 (summer solstice)

  describe('getSunData', () => {
    it('returns sunset data with valid times', () => {
      const data = getSunData(lat, lng, date, 'sunset');
      expect(data.mode).toBe('sunset');
      expect(data.targetTime).toBeInstanceOf(Date);
      expect(data.sunsetTime).toBeInstanceOf(Date);
      expect(data.sunriseTime).toBeInstanceOf(Date);
      expect(data.goldenHourStart).toBeInstanceOf(Date);
      expect(data.goldenHourEnd).toBeInstanceOf(Date);
    });

    it('computes sunset azimuth in the western half (180-360°)', () => {
      const data = getSunData(lat, lng, date, 'sunset');
      expect(data.azimuth).toBeGreaterThan(180);
      expect(data.azimuth).toBeLessThan(360);
    });

    it('sunset is after sunrise on the same day', () => {
      const data = getSunData(lat, lng, date, 'sunset');
      expect(data.sunsetTime.getTime()).toBeGreaterThan(data.sunriseTime.getTime());
    });

    it('returns sunrise data when mode is sunrise', () => {
      const data = getSunData(lat, lng, date, 'sunrise');
      expect(data.mode).toBe('sunrise');
      expect(data.targetTime).toEqual(data.sunriseTime);
    });

    it('sunrise azimuth is in the eastern half (0-180°)', () => {
      const data = getSunData(lat, lng, date, 'sunrise');
      expect(data.azimuth).toBeGreaterThan(0);
      expect(data.azimuth).toBeLessThan(180);
    });

    it('summer solstice sunset is further north than equinox', () => {
      const solstice = getSunData(lat, lng, new Date(2024, 5, 21, 12), 'sunset');
      const equinox = getSunData(lat, lng, new Date(2024, 2, 20, 12), 'sunset');
      // Summer sunset is further northwest (higher azimuth, closer to 300°)
      expect(solstice.azimuth).toBeGreaterThan(equinox.azimuth);
    });
  });

  describe('getSunAltitude', () => {
    it('sun altitude at solar noon is positive', () => {
      const noon = new Date(2024, 5, 21, 20, 0, 0); // ~12 PM UTC for Portland
      const alt = getSunAltitude(lat, lng, noon);
      expect(alt).toBeGreaterThan(0);
    });

    it('sun altitude at midnight is negative', () => {
      const midnight = new Date(2024, 5, 21, 8, 0, 0); // ~midnight UTC for Portland
      const alt = getSunAltitude(lat, lng, midnight);
      expect(alt).toBeLessThan(0);
    });
  });

  describe('getSunAzimuth', () => {
    it('returns a value between 0 and 360', () => {
      const az = getSunAzimuth(lat, lng, date);
      expect(az).toBeGreaterThanOrEqual(0);
      expect(az).toBeLessThan(360);
    });
  });
});
