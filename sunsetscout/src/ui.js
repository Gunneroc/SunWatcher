/**
 * UI module: sidebar, controls, state management.
 */
import { formatTime, azimuthToCompass, formatDistance, haversine } from './utils.js';
import { getScoreColor, getVerdict } from './scorer.js';

/**
 * Application state.
 */
export const state = {
  location: null,
  date: new Date(),
  radius: 10000,
  mode: 'sunset',
  sunData: null,
  weather: null,
  candidates: [],
  isLoading: false,
  weatherEnabled: true
};

/**
 * Initialize UI controls and event listeners.
 */
export function initUI(callbacks) {
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const dateInput = document.getElementById('date-input');
  const radiusSlider = document.getElementById('radius-slider');
  const radiusValue = document.getElementById('radius-value');
  const modeToggle = document.getElementById('mode-toggle');
  const weatherToggle = document.getElementById('weather-toggle');

  // Set default date to today
  dateInput.value = formatDateInput(state.date);

  // Radius slider
  radiusSlider.addEventListener('input', () => {
    state.radius = parseInt(radiusSlider.value) * 1000;
    radiusValue.textContent = `${radiusSlider.value} km`;
  });

  // Date change
  dateInput.addEventListener('change', () => {
    const parts = dateInput.value.split('-');
    state.date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  });

  // Mode toggle
  modeToggle.addEventListener('click', () => {
    state.mode = state.mode === 'sunset' ? 'sunrise' : 'sunset';
    modeToggle.textContent = state.mode === 'sunset' ? '🌅 Sunset' : '🌄 Sunrise';
    modeToggle.classList.toggle('sunrise-mode', state.mode === 'sunrise');
    if (state.location && callbacks.onSearch) {
      callbacks.onSearch(null, state.location.lat, state.location.lng);
    }
  });

  // Weather toggle
  weatherToggle.addEventListener('change', () => {
    state.weatherEnabled = weatherToggle.checked;
    const weatherCard = document.getElementById('weather-card');
    weatherCard.style.display = state.weatherEnabled ? 'block' : 'none';
  });

  // Search
  const doSearch = () => {
    const query = searchInput.value.trim();
    if (!query) return;
    if (callbacks.onSearch) callbacks.onSearch(query);
  };

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // Handle URL hash for sharing
  loadFromHash(callbacks);
}

/**
 * Show location disambiguation results.
 */
export function showLocationPicker(results, onSelect) {
  const container = document.getElementById('location-results');
  container.innerHTML = '';
  container.style.display = 'block';

  for (const result of results) {
    const item = document.createElement('div');
    item.className = 'location-result-item';
    item.textContent = result.displayName;
    item.addEventListener('click', () => {
      container.style.display = 'none';
      document.getElementById('search-input').value = result.displayName.split(',')[0];
      onSelect(result);
    });
    container.appendChild(item);
  }
}

/**
 * Hide location picker.
 */
export function hideLocationPicker() {
  document.getElementById('location-results').style.display = 'none';
}

/**
 * Update the sunset info card.
 */
export function updateSunCard(sunData) {
  state.sunData = sunData;
  const card = document.getElementById('sun-card');

  const timeStr = formatTime(sunData.targetTime);
  const azStr = `${Math.round(sunData.azimuth)}°`;
  const compass = azimuthToCompass(sunData.azimuth);
  const goldenStart = formatTime(sunData.goldenHourStart);
  const goldenEnd = formatTime(sunData.goldenHourEnd);
  const label = sunData.mode === 'sunset' ? 'Sunset' : 'Sunrise';

  card.innerHTML = `
    <h3>${label} Info</h3>
    <div class="sun-info-grid">
      <div class="sun-info-item">
        <span class="sun-label">${label}</span>
        <span class="sun-value">${timeStr}</span>
      </div>
      <div class="sun-info-item">
        <span class="sun-label">Bearing</span>
        <span class="sun-value">${azStr} ${compass}</span>
      </div>
      <div class="sun-info-item">
        <span class="sun-label">Golden Hour</span>
        <span class="sun-value">${goldenStart} – ${goldenEnd}</span>
      </div>
    </div>
    <div class="compass-graphic">
      <div class="compass-ring">
        <div class="compass-needle" style="transform: rotate(${sunData.azimuth}deg)">
          <div class="needle-tip"></div>
        </div>
        <span class="compass-n">N</span>
        <span class="compass-e">E</span>
        <span class="compass-s">S</span>
        <span class="compass-w">W</span>
      </div>
    </div>
  `;
  card.style.display = 'block';
}

/**
 * Update the weather card.
 */
export function updateWeatherCard(weatherData, targetDate) {
  state.weather = weatherData;
  const card = document.getElementById('weather-card');

  if (!state.weatherEnabled || !weatherData) {
    card.style.display = 'none';
    return;
  }

  const dateStr = formatDateInput(targetDate);
  const dayData = weatherData.find(d => d.date === dateStr) || weatherData[0];

  if (!dayData) {
    card.style.display = 'none';
    return;
  }

  const q = dayData.quality;
  const timeLabel = dayData.isHourly ? 'At sunset' : 'Daily avg';
  const visStr = dayData.visibility != null
    ? `${(dayData.visibility / 1000).toFixed(0)} km`
    : '—';
  const windStr = dayData.windSpeed != null
    ? `${Math.round(dayData.windSpeed)} km/h`
    : '—';

  card.innerHTML = `
    <h3>Weather <span class="weather-time-label">${timeLabel}</span></h3>
    <div class="weather-badge ${q.class}">
      <span class="weather-icon">${q.icon}</span>
      <span class="weather-label">${q.label}</span>
    </div>
    <p class="weather-desc">${q.description}</p>
    <div class="weather-details">
      <div class="weather-stat">
        <span>Cloud Cover</span>
        <span>${dayData.cloudCover}%</span>
      </div>
      <div class="weather-stat">
        <span>Rain Chance</span>
        <span>${dayData.precipProbability}%</span>
      </div>
      <div class="weather-stat">
        <span>Visibility</span>
        <span>${visStr}</span>
      </div>
      <div class="weather-stat">
        <span>Wind</span>
        <span>${windStr}</span>
      </div>
    </div>
  `;
  card.style.display = 'block';
}

/**
 * Update the ranked results list.
 */
export function updateResultsList(candidates, onItemClick) {
  state.candidates = candidates;
  const list = document.getElementById('results-list');
  const top10 = candidates.slice(0, 10);

  if (top10.length === 0) {
    list.innerHTML = '<p class="no-results">No viewpoints analyzed yet.</p>';
    return;
  }

  list.innerHTML = `<h3>Top Spots</h3>` + top10.map((c, i) => {
    const color = getScoreColor(c.score);
    const verdict = getVerdict(c);
    const distance = state.location
      ? formatDistance(haversine(state.location.lat, state.location.lng, c.lat, c.lng))
      : '';

    return `
      <div class="result-item" data-index="${i}">
        <div class="result-rank" style="background:${color}">${i + 1}</div>
        <div class="result-info">
          <div class="result-elev">${Math.round(c.elevation)}m · ${distance}</div>
          <div class="result-verdict">${verdict}</div>
          <div class="result-score">Score: ${c.score}</div>
        </div>
      </div>
    `;
  }).join('');

  // Click handlers
  list.querySelectorAll('.result-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      if (onItemClick) onItemClick(top10[idx]);
    });
  });
}

/**
 * Show/hide loading state.
 */
export function setLoading(loading, message = 'Analyzing viewpoints...') {
  state.isLoading = loading;
  const overlay = document.getElementById('loading-overlay');
  const loadingMsg = document.getElementById('loading-message');

  if (loading) {
    overlay.style.display = 'flex';
    loadingMsg.textContent = message;
  } else {
    overlay.style.display = 'none';
  }
}

/**
 * Update loading progress.
 */
export function setProgress(percent, message) {
  const bar = document.getElementById('progress-bar');
  const loadingMsg = document.getElementById('loading-message');
  if (bar) bar.style.width = `${percent}%`;
  if (message && loadingMsg) loadingMsg.textContent = message;
}

/**
 * Show an error message.
 */
export function showError(message) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
}

/**
 * Update URL hash for sharing.
 */
export function updateHash() {
  if (!state.location) return;
  const params = new URLSearchParams({
    lat: state.location.lat.toFixed(5),
    lng: state.location.lng.toFixed(5),
    r: (state.radius / 1000).toString(),
    d: formatDateInput(state.date),
    m: state.mode
  });
  window.location.hash = params.toString();
}

/**
 * Load state from URL hash.
 */
function loadFromHash(callbacks) {
  if (!window.location.hash) return;
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));
    if (isNaN(lat) || isNaN(lng)) return;

    const radius = parseInt(params.get('r')) || 10;
    const dateStr = params.get('d');
    const mode = params.get('m') || 'sunset';

    state.radius = radius * 1000;
    state.mode = mode;

    const slider = document.getElementById('radius-slider');
    if (slider) slider.value = radius;
    const rv = document.getElementById('radius-value');
    if (rv) rv.textContent = `${radius} km`;

    if (dateStr) {
      const dateInput = document.getElementById('date-input');
      if (dateInput) dateInput.value = dateStr;
      const parts = dateStr.split('-');
      state.date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }

    if (callbacks.onSearch) {
      callbacks.onSearch(null, lat, lng);
    }
  } catch (e) {
    // Ignore invalid hash
  }
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
