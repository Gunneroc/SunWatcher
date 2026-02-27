/**
 * Composite scoring algorithm for ranking sunset viewpoints.
 */
import { haversine } from './utils.js';

/**
 * Score a single candidate viewpoint.
 * Higher score = better sunset spot.
 * @param {object} candidate - viewshed-analyzed candidate point
 * @param {object} options - {centerLat, centerLng, maxRadius}
 * @returns {number} composite score 0-100
 */
export function scoreCandidate(candidate, options = {}) {
  let score = 0;

  // 1. Obstruction score (0-40 points): lower obstruction angle = better
  if (candidate.isClear) {
    // Negative obstruction angle means horizon is below — great
    const obstructionBonus = Math.min(40, 40 + candidate.obstructionAngle * (-4));
    score += Math.max(0, Math.min(40, obstructionBonus));
  } else {
    // Obstructed: score drops based on how bad it is
    score += Math.max(0, 20 - candidate.obstructionAngle * 4);
  }

  // 2. Elevation advantage (0-30 points): higher is generally better
  const elevNormalized = Math.min(candidate.elevation / 1000, 1); // normalize to 0-1 over 1000m
  score += elevNormalized * 30;

  // 3. Distance penalty (0-15 points): closer to center is more convenient
  if (options.centerLat !== undefined && options.maxRadius) {
    const dist = haversine(options.centerLat, options.centerLng, candidate.lat, candidate.lng);
    const distRatio = 1 - Math.min(dist / options.maxRadius, 1);
    score += distRatio * 15;
  } else {
    score += 10;
  }

  // 4. View clearance margin (0-15 points): how far below horizon is the obstruction
  if (candidate.obstructionAngle < 0) {
    score += Math.min(15, Math.abs(candidate.obstructionAngle) * 5);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score and rank all candidate points.
 * @param {Array} candidates - viewshed-analyzed candidates
 * @param {object} options - scoring options
 * @returns {Array} sorted candidates with score added, best first
 */
export function rankCandidates(candidates, options = {}) {
  const scored = candidates.map(c => ({
    ...c,
    score: scoreCandidate(c, options)
  }));

  scored.sort((a, b) => b.score - a.score);

  // Assign rank
  scored.forEach((c, i) => { c.rank = i + 1; });

  return scored;
}

/**
 * Get a human-readable verdict for a candidate.
 */
export function getVerdict(candidate) {
  if (candidate.isClear) {
    return `Unobstructed sunset view from ${Math.round(candidate.elevation)}m elevation`;
  }

  const blockerDist = candidate.maxBlockerDistance;
  const distStr = blockerDist < 1000
    ? `${Math.round(blockerDist)}m`
    : `${(blockerDist / 1000).toFixed(1)}km`;

  return `Blocked by terrain ${distStr} away (${candidate.obstructionAngle.toFixed(1)}° obstruction)`;
}

/**
 * Get score color for map display.
 * @returns {string} hex color
 */
export function getScoreColor(score) {
  if (score >= 70) return '#22c55e'; // green
  if (score >= 50) return '#eab308'; // yellow
  if (score >= 30) return '#f97316'; // orange
  return '#ef4444'; // red
}

/**
 * Get marker radius based on score and elevation.
 */
export function getMarkerRadius(score, elevation) {
  const base = 5;
  const scoreBonus = (score / 100) * 5;
  const elevBonus = Math.min(3, elevation / 500);
  return base + scoreBonus + elevBonus;
}
