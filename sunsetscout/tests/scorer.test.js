import { describe, it, expect } from 'vitest';
import { scoreCandidate, rankCandidates, getVerdict, getScoreColor, getMarkerRadius } from '../src/scorer.js';

describe('scorer', () => {
  describe('scoreCandidate', () => {
    it('gives higher score to clear viewpoints', () => {
      const clear = scoreCandidate({
        isClear: true,
        obstructionAngle: -2,
        elevation: 500,
        lat: 45, lng: -122
      });
      const obstructed = scoreCandidate({
        isClear: false,
        obstructionAngle: 5,
        elevation: 500,
        lat: 45, lng: -122
      });
      expect(clear).toBeGreaterThan(obstructed);
    });

    it('gives higher score to higher elevation points', () => {
      const high = scoreCandidate({
        isClear: true,
        obstructionAngle: -1,
        elevation: 800,
        lat: 45, lng: -122
      });
      const low = scoreCandidate({
        isClear: true,
        obstructionAngle: -1,
        elevation: 100,
        lat: 45, lng: -122
      });
      expect(high).toBeGreaterThan(low);
    });

    it('returns score between 0 and 100', () => {
      const score = scoreCandidate({
        isClear: true,
        obstructionAngle: -5,
        elevation: 1000,
        lat: 45, lng: -122
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('uses distance from center when options provided', () => {
      const near = scoreCandidate(
        { isClear: true, obstructionAngle: -1, elevation: 200, lat: 45.0, lng: -122.0 },
        { centerLat: 45.0, centerLng: -122.0, maxRadius: 10000 }
      );
      const far = scoreCandidate(
        { isClear: true, obstructionAngle: -1, elevation: 200, lat: 45.08, lng: -122.0 },
        { centerLat: 45.0, centerLng: -122.0, maxRadius: 10000 }
      );
      expect(near).toBeGreaterThan(far);
    });
  });

  describe('rankCandidates', () => {
    it('sorts candidates by score descending', () => {
      const candidates = [
        { isClear: false, obstructionAngle: 5, elevation: 100, lat: 45, lng: -122 },
        { isClear: true, obstructionAngle: -3, elevation: 800, lat: 45, lng: -122 },
        { isClear: true, obstructionAngle: -1, elevation: 300, lat: 45, lng: -122 },
      ];
      const ranked = rankCandidates(candidates);
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
      expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    });

    it('assigns rank starting from 1', () => {
      const candidates = [
        { isClear: true, obstructionAngle: -1, elevation: 500, lat: 45, lng: -122 },
        { isClear: true, obstructionAngle: -2, elevation: 200, lat: 45, lng: -122 },
      ];
      const ranked = rankCandidates(candidates);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
    });
  });

  describe('getVerdict', () => {
    it('returns unobstructed message for clear viewpoints', () => {
      const verdict = getVerdict({ isClear: true, elevation: 512 });
      expect(verdict).toContain('Unobstructed');
      expect(verdict).toContain('512m');
    });

    it('returns blocked message for obstructed viewpoints', () => {
      const verdict = getVerdict({
        isClear: false,
        elevation: 100,
        maxBlockerDistance: 3200,
        obstructionAngle: 2.5
      });
      expect(verdict).toContain('Blocked');
      expect(verdict).toContain('3.2km');
    });

    it('formats short distances in meters', () => {
      const verdict = getVerdict({
        isClear: false,
        elevation: 100,
        maxBlockerDistance: 500,
        obstructionAngle: 3.0
      });
      expect(verdict).toContain('500m');
    });
  });

  describe('getScoreColor', () => {
    it('returns green for high scores', () => {
      expect(getScoreColor(80)).toBe('#22c55e');
    });

    it('returns yellow for medium scores', () => {
      expect(getScoreColor(55)).toBe('#eab308');
    });

    it('returns orange for low-medium scores', () => {
      expect(getScoreColor(35)).toBe('#f97316');
    });

    it('returns red for low scores', () => {
      expect(getScoreColor(10)).toBe('#ef4444');
    });
  });

  describe('getMarkerRadius', () => {
    it('returns larger radius for higher scores', () => {
      const high = getMarkerRadius(90, 500);
      const low = getMarkerRadius(10, 500);
      expect(high).toBeGreaterThan(low);
    });

    it('returns larger radius for higher elevation', () => {
      const highElev = getMarkerRadius(50, 1000);
      const lowElev = getMarkerRadius(50, 100);
      expect(highElev).toBeGreaterThan(lowElev);
    });
  });
});
