/**
 * SunsetScout — Main entry point.
 * Wires together all modules: geocoding, solar, elevation, viewshed, weather, map, UI.
 */
import { initMap, clearLayers, zoomToLocation, drawAzimuthLine, plotCandidates, highlightTopSpots, showPulseAnimation, panTo } from './map.js';
import { initUI, showLocationPicker, hideLocationPicker, updateSunCard, updateWeatherCard, updateResultsList, setLoading, setProgress, showError, state, updateHash } from './ui.js';
import { geocode } from './geocoder.js';
import { getSunData } from './solar.js';
import { fetchElevations } from './elevation.js';
import { analyzeViewshed } from './viewshed.js';
import { fetchWeather } from './weather.js';
import { rankCandidates } from './scorer.js';
import { generateHexGrid } from './utils.js';

// Initialize map
initMap('map');

// Initialize UI with callbacks
initUI({
  onSearch: handleSearch
});

/**
 * Main search handler — orchestrates the full pipeline.
 */
async function handleSearch(query, directLat, directLng) {
  try {
    if (query) {
      // Step 1: Geocode
      setLoading(true, 'Searching location...');
      const results = await geocode(query);

      if (results.length === 1 || directLat !== undefined) {
        const loc = directLat !== undefined
          ? { lat: directLat, lng: directLng }
          : results[0];
        await runAnalysis(loc.lat, loc.lng);
      } else {
        setLoading(false);
        showLocationPicker(results, async (selected) => {
          await runAnalysis(selected.lat, selected.lng);
        });
      }
    } else if (directLat !== undefined) {
      await runAnalysis(directLat, directLng);
    }
  } catch (err) {
    setLoading(false);
    showError(err.message || 'An error occurred');
    console.error(err);
  }
}

/**
 * Run the full analysis pipeline for a given lat/lng.
 */
async function runAnalysis(lat, lng) {
  hideLocationPicker();
  state.location = { lat, lng };

  const radiusM = state.radius;
  const date = state.date;
  const mode = state.mode;

  setLoading(true, 'Getting sun data...');

  // Step 2 & 3: Get sun data
  const sunData = getSunData(lat, lng, date, mode);
  updateSunCard(sunData);

  // Zoom map
  zoomToLocation(lat, lng, radiusM);
  drawAzimuthLine(lat, lng, sunData.azimuth, radiusM);

  // Start pulse animation
  const stopPulse = showPulseAnimation(lat, lng, radiusM);

  // Step 4: Generate grid and fetch elevations
  setLoading(true, 'Sampling elevation grid...');
  const gridPoints = generateHexGrid(lat, lng, radiusM, 350);
  setProgress(10, `Fetching elevations for ${gridPoints.length} points...`);

  let elevatedPoints;
  try {
    elevatedPoints = await fetchElevations(gridPoints, (done, total) => {
      const pct = 10 + (done / total) * 40;
      setProgress(pct, `Elevations: ${done}/${total}`);
    });
  } catch (err) {
    stopPulse();
    setLoading(false);
    showError('Elevation data unavailable. Please try again.');
    return;
  }

  // Step 5: Viewshed analysis
  setProgress(50, 'Analyzing viewshed...');
  let viewshedResults;
  try {
    viewshedResults = await analyzeViewshed(
      elevatedPoints,
      sunData.azimuth,
      sunData.altitude,
      (done, total, phase) => {
        if (phase === 'elevation') {
          const pct = 50 + (done / total) * 30;
          setProgress(pct, `Ray elevations: ${done}/${total}`);
        } else {
          const pct = 80 + (done / total) * 15;
          setProgress(pct, `Scoring: ${done}/${total}`);
        }
      }
    );
  } catch (err) {
    stopPulse();
    setLoading(false);
    showError('Viewshed analysis failed. Try a smaller radius.');
    return;
  }

  // Step 6: Rank candidates
  setProgress(95, 'Ranking results...');
  const ranked = rankCandidates(viewshedResults, {
    centerLat: lat,
    centerLng: lng,
    maxRadius: radiusM
  });

  // Step 7: Display results
  plotCandidates(ranked, (c) => {
    panTo(c.lat, c.lng);
  });
  highlightTopSpots(ranked, 5);
  updateResultsList(ranked, (c) => {
    panTo(c.lat, c.lng, 14);
  });

  // Step 8: Weather (optional)
  if (state.weatherEnabled) {
    try {
      const weather = await fetchWeather(lat, lng);
      updateWeatherCard(weather, date);
    } catch (err) {
      console.warn('Weather data unavailable:', err);
    }
  }

  stopPulse();
  setLoading(false);
  updateHash();

  setProgress(100, 'Done!');
}
