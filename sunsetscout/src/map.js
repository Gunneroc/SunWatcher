/**
 * Leaflet map setup, layers, popups, and markers.
 */
import L from 'leaflet';
import 'leaflet.heat';
import { getScoreColor, getMarkerRadius, getVerdict } from './scorer.js';
import { azimuthToCompass, formatDistance, destinationPoint } from './utils.js';

let map = null;
let candidateLayer = null;
let topSpotsLayer = null;
let azimuthLineLayer = null;
let searchCircleLayer = null;
let pulseLayer = null;
let heatmapLayer = null;
let heatmapVisible = false;

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

/**
 * Initialize the Leaflet map.
 */
export function initMap(containerId) {
  map = L.map(containerId, {
    center: [40, -100],
    zoom: 4,
    zoomControl: false
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  candidateLayer = L.layerGroup().addTo(map);
  topSpotsLayer = L.layerGroup().addTo(map);
  azimuthLineLayer = L.layerGroup().addTo(map);
  searchCircleLayer = L.layerGroup().addTo(map);
  pulseLayer = L.layerGroup().addTo(map);

  return map;
}

/**
 * Clear all overlay layers.
 */
export function clearLayers() {
  if (candidateLayer) candidateLayer.clearLayers();
  if (topSpotsLayer) topSpotsLayer.clearLayers();
  if (azimuthLineLayer) azimuthLineLayer.clearLayers();
  if (searchCircleLayer) searchCircleLayer.clearLayers();
  if (pulseLayer) pulseLayer.clearLayers();
  if (heatmapLayer) {
    map.removeLayer(heatmapLayer);
    heatmapLayer = null;
  }
  heatmapVisible = false;
}

/**
 * Zoom to a location with a radius circle.
 */
export function zoomToLocation(lat, lng, radiusM) {
  if (!map) return;
  clearLayers();

  const circle = L.circle([lat, lng], {
    radius: radiusM,
    color: '#f97316',
    fillColor: '#f97316',
    fillOpacity: 0.05,
    weight: 1,
    dashArray: '5,5'
  });
  searchCircleLayer.addLayer(circle);

  // Center marker
  const centerMarker = L.circleMarker([lat, lng], {
    radius: 6,
    color: '#fff',
    fillColor: '#f97316',
    fillOpacity: 1,
    weight: 2
  });
  searchCircleLayer.addLayer(centerMarker);

  map.fitBounds(circle.getBounds(), { padding: [30, 30] });
}

/**
 * Draw the sunset azimuth line from center.
 */
export function drawAzimuthLine(centerLat, centerLng, azimuth, radiusM) {
  azimuthLineLayer.clearLayers();

  const endpoint = destinationPoint(centerLat, centerLng, azimuth, radiusM * 1.5);

  const line = L.polyline(
    [[centerLat, centerLng], [endpoint.lat, endpoint.lng]],
    {
      color: '#ff6b35',
      weight: 3,
      opacity: 0.8,
      dashArray: '10,6'
    }
  );
  azimuthLineLayer.addLayer(line);

  // Sun icon at the end of the azimuth line
  const sunIcon = L.divIcon({
    className: 'sun-icon',
    html: '<div class="sun-marker">☀</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  const sunMarker = L.marker([endpoint.lat, endpoint.lng], { icon: sunIcon });
  azimuthLineLayer.addLayer(sunMarker);
}

/**
 * Add candidate points to the map.
 */
export function plotCandidates(candidates, onCandidateClick) {
  candidateLayer.clearLayers();

  for (const c of candidates) {
    const color = getScoreColor(c.score);
    const radius = getMarkerRadius(c.score, c.elevation);

    const marker = L.circleMarker([c.lat, c.lng], {
      radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.6,
      weight: 1
    });

    const verdict = getVerdict(c);
    const compass = azimuthToCompass(c.sunBearing);
    const popupContent = `
      <div class="spot-popup">
        <div class="popup-score" style="background:${color}">${c.score}</div>
        <div class="popup-details">
          <strong>${Math.round(c.elevation)}m elevation</strong>
          <p>${verdict}</p>
          <p>Obstruction: ${c.obstructionAngle.toFixed(1)}° | Sun: ${c.sunAltitude.toFixed(1)}°</p>
          <p>Bearing: ${Math.round(c.sunBearing)}° ${compass}</p>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}"
             target="_blank" class="directions-link">Get Directions →</a>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, { className: 'dark-popup', maxWidth: 280 });

    if (onCandidateClick) {
      marker.on('click', () => onCandidateClick(c));
    }

    candidateLayer.addLayer(marker);
  }
}

/**
 * Highlight the top N spots with gold numbered markers.
 */
export function highlightTopSpots(candidates, count = 5) {
  topSpotsLayer.clearLayers();

  const topN = candidates.slice(0, count);

  for (let i = 0; i < topN.length; i++) {
    const c = topN[i];
    const icon = L.divIcon({
      className: 'top-spot-icon',
      html: `<div class="top-marker">${i + 1}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const marker = L.marker([c.lat, c.lng], { icon, zIndexOffset: 1000 });

    const verdict = getVerdict(c);
    marker.bindPopup(`
      <div class="spot-popup top-spot-popup">
        <div class="popup-rank">#${i + 1}</div>
        <div class="popup-details">
          <strong>${Math.round(c.elevation)}m elevation</strong>
          <p>${verdict}</p>
          <p>Score: ${c.score}/100</p>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}"
             target="_blank" class="directions-link">Get Directions →</a>
        </div>
      </div>
    `, { className: 'dark-popup', maxWidth: 280 });

    topSpotsLayer.addLayer(marker);
  }
}

/**
 * Show a pulsing animation ring expanding from center.
 */
export function showPulseAnimation(lat, lng, radiusM) {
  pulseLayer.clearLayers();

  const pulseCircle = L.circle([lat, lng], {
    radius: 0,
    color: '#ff6b35',
    fillColor: '#ff6b35',
    fillOpacity: 0.2,
    weight: 2,
    className: 'pulse-ring'
  });
  pulseLayer.addLayer(pulseCircle);

  let currentRadius = 0;
  const step = radiusM / 60;
  const interval = setInterval(() => {
    currentRadius += step;
    if (currentRadius >= radiusM) {
      clearInterval(interval);
      pulseLayer.clearLayers();
      return;
    }
    pulseCircle.setRadius(currentRadius);
    pulseCircle.setStyle({ fillOpacity: 0.2 * (1 - currentRadius / radiusM) });
  }, 30);

  return () => {
    clearInterval(interval);
    pulseLayer.clearLayers();
  };
}

/**
 * Pan to a specific location on the map.
 */
export function panTo(lat, lng, zoom) {
  if (!map) return;
  if (zoom) {
    map.setView([lat, lng], zoom);
  } else {
    map.panTo([lat, lng]);
  }
}

/**
 * Plot a heatmap layer from scored candidates.
 */
export function plotHeatmap(candidates) {
  if (heatmapLayer) {
    map.removeLayer(heatmapLayer);
    heatmapLayer = null;
  }

  const maxScore = Math.max(...candidates.map(c => c.score), 1);
  const heatData = candidates.map(c => [c.lat, c.lng, c.score / maxScore]);

  heatmapLayer = L.heatLayer(heatData, {
    radius: 25,
    blur: 20,
    maxZoom: 17,
    gradient: {
      0.2: '#3b82f6',
      0.5: '#eab308',
      0.8: '#f97316',
      1.0: '#22c55e'
    }
  });

  // Start hidden (markers visible by default)
  if (heatmapVisible) {
    heatmapLayer.addTo(map);
  }
}

/**
 * Toggle between heatmap and marker views.
 * Returns true if heatmap is now visible.
 */
export function toggleHeatmap() {
  heatmapVisible = !heatmapVisible;

  if (heatmapVisible) {
    if (heatmapLayer) heatmapLayer.addTo(map);
    if (candidateLayer) map.removeLayer(candidateLayer);
  } else {
    if (heatmapLayer) map.removeLayer(heatmapLayer);
    if (candidateLayer) candidateLayer.addTo(map);
  }

  return heatmapVisible;
}

/**
 * Get the map instance.
 */
export function getMap() {
  return map;
}
