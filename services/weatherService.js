/**
 * Weather Service
 * Weather for the sidebar widget, from Open-Meteo (free, no API key).
 * If Open-Meteo fails, the last reading is served.
 *
 * Contract (docs/api-contract.md, GET /api/weather?city=):
 *   { city, temperature, humidity, wind, code, fetchedAt }
 * One reading per city is kept for 15 minutes, so thousands of readers cost at most
 * 4 Open-Meteo calls every 15 minutes.
 */

const logger = require('../config/logger');

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FETCH_TIMEOUT_MS = 5000;

// Same cities and coordinates as the widget (public/js/weather.js)
const CITIES = {
  'tel-aviv': { lat: 32.0853, lon: 34.7818 },
  jerusalem: { lat: 31.7683, lon: 35.2137 },
  haifa: { lat: 32.794, lon: 34.9896 },
  'beer-sheva': { lat: 31.252, lon: 34.7915 }
};

// city -> { reading, timestamp }
let weatherCache = {};
// city -> Promise of the Open-Meteo call in progress, so a burst of readers shares one call
let pending = {};

async function fetchFromOpenMeteo(city) {
  const { lat, lon } = CITIES[city];
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    wind_speed_unit: 'kmh',
    timezone: 'auto'
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Weather API responded with status ${response.status}`);
    }

    const data = await response.json();
    const current = data && data.current;
    if (!current || typeof current.temperature_2m !== 'number') {
      throw new Error('Unexpected Open-Meteo payload');
    }

    return {
      city,
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      code: current.weather_code,
      fetchedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

const weatherService = {
  CITIES,

  isKnownCity(city) {
    return Object.prototype.hasOwnProperty.call(CITIES, city);
  },

  /**
   * Current weather for one of CITIES, cached for 15 minutes.
   * If Open-Meteo fails, returns the last reading (with its old fetchedAt).
   * Throws only when there is no reading at all.
   */
  async getWeather(city = 'tel-aviv') {
    if (!this.isKnownCity(city)) {
      throw new Error(`Unknown city: ${city}`);
    }

    const cached = weatherCache[city];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.reading;
    }

    if (!pending[city]) {
      pending[city] = fetchFromOpenMeteo(city)
        .then((reading) => {
          weatherCache[city] = { reading, timestamp: Date.now() };
          logger.info('Weather cache updated from Open-Meteo', { city, temp: reading.temperature });
          return reading;
        })
        .finally(() => {
          delete pending[city];
        });
    }

    try {
      return await pending[city];
    } catch (error) {
      if (cached) {
        logger.warn('Failed to fetch external weather, serving last reading:', error.message);
        return cached.reading;
      }
      logger.warn('Failed to fetch external weather, no reading to serve:', error.message);
      throw error;
    }
  },

  // Helper for tests to reset cache
  clearCache() {
    weatherCache = {};
    pending = {};
  }
};

module.exports = weatherService;
