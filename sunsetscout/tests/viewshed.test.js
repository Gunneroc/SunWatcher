import { describe, it, expect } from 'vitest';
import { generateRayPoints, computeObstruction } from '../src/viewshed.js';

describe('viewshed', () => {
  describe('generateRayPoints', () => {
    it('generates points along a ray from the origin', () => {
      const points = generateRayPoints(45.0, -122.0, 270, 3000, 300);
      expect(points.length).toBe(10); // 300, 600, ..., 3000
      expect(points[0].distance).toBe(300);
      expect(points[9].distance).toBe(3000);
    });

    it('all points have lat/lng and distance properties', () => {
      const points = generateRayPoints(45.0, -122.0, 90, 2000, 500);
      for (const pt of points) {
        expect(pt).toHaveProperty('lat');
        expect(pt).toHaveProperty('lng');
        expect(pt).toHaveProperty('distance');
        expect(typeof pt.lat).toBe('number');
        expect(typeof pt.lng).toBe('number');
      }
    });

    it('bearing west (270°) moves points westward (lower lng)', () => {
      const points = generateRayPoints(45.0, -122.0, 270, 5000, 1000);
      for (const pt of points) {
        expect(pt.lng).toBeLessThan(-122.0);
      }
    });

    it('bearing east (90°) moves points eastward (higher lng)', () => {
      const points = generateRayPoints(45.0, -122.0, 90, 5000, 1000);
      for (const pt of points) {
        expect(pt.lng).toBeGreaterThan(-122.0);
      }
    });

    it('bearing north (0°) moves points northward (higher lat)', () => {
      const points = generateRayPoints(45.0, -122.0, 0, 5000, 1000);
      for (const pt of points) {
        expect(pt.lat).toBeGreaterThan(45.0);
      }
    });
  });

  describe('computeObstruction', () => {
    it('returns clear when all terrain is lower than candidate', () => {
      const candidate = { lat: 45, lng: -122, elevation: 500 };
      const raySamples = [
        { elevation: 400, distance: 300 },
        { elevation: 350, distance: 600 },
        { elevation: 300, distance: 900 },
        { elevation: 200, distance: 1200 },
      ];
      const result = computeObstruction(candidate, raySamples);
      expect(result.isClear).toBe(true);
      expect(result.obstructionAngle).toBeLessThan(0);
    });

    it('returns obstructed when terrain is higher than candidate', () => {
      const candidate = { lat: 45, lng: -122, elevation: 100 };
      const raySamples = [
        { elevation: 100, distance: 300 },
        { elevation: 500, distance: 600 }, // blocking ridge
        { elevation: 100, distance: 900 },
      ];
      const result = computeObstruction(candidate, raySamples);
      expect(result.isClear).toBe(false);
      expect(result.obstructionAngle).toBeGreaterThan(0);
      expect(result.maxBlockerDistance).toBe(600);
    });

    it('obstruction angle increases with higher blocking terrain', () => {
      const candidate = { lat: 45, lng: -122, elevation: 100 };

      const low = computeObstruction(candidate, [
        { elevation: 200, distance: 1000 },
      ]);
      const high = computeObstruction(candidate, [
        { elevation: 500, distance: 1000 },
      ]);

      expect(high.obstructionAngle).toBeGreaterThan(low.obstructionAngle);
    });

    it('applies earth curvature correction for distant points', () => {
      const candidate = { lat: 45, lng: -122, elevation: 100 };

      // At 5000m, curvature drop is ~1.96m
      // A sample at 101m at 5000m distance would be ~99m after curvature
      const result = computeObstruction(candidate, [
        { elevation: 101, distance: 5000 },
      ]);
      // After curvature correction, the effective elevation is lower than candidate
      expect(result.isClear).toBe(true);
    });

    it('flat terrain at short distance is clear', () => {
      const candidate = { lat: 45, lng: -122, elevation: 100 };
      const raySamples = [
        { elevation: 100, distance: 300 },
        { elevation: 100, distance: 600 },
        { elevation: 100, distance: 900 },
      ];
      const result = computeObstruction(candidate, raySamples);
      // Same elevation = ~0° angle, which is at the threshold
      expect(result.obstructionAngle).toBeCloseTo(0, 0);
    });
  });
});
