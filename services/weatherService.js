/**
 * Weather Service
 * External API integration for sidebar weather widget.
 * Requirements:
 * - Free web service (no credit card).
 * - Weather data can lag up to 15 minutes max (cached to support thousands of concurrent users).
 * - Never crash the server if external service is down.
 */

const logger = require('../config/logger');

let weatherCache = {
  data: null,
  timestamp: 0
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const weatherService = {
  /**
   * Fetch current weather with 15-minute caching
   */
  async getWeather(city = 'Tel Aviv') {
    const now = Date.now();

    // Check if valid cache exists
    if (weatherCache.data && (now - weatherCache.timestamp < CACHE_TTL_MS)) {
      return {
        ...weatherCache.data,
        cached: true,
        ageMinutes: Math.floor((now - weatherCache.timestamp) / 60000)
      };
    }

    try {
      // Use Open-Meteo (completely free, no API key, no credit card required)
      // Tel Aviv coordinates: lat: 32.0853, lon: 34.7818
      const lat = 32.0853;
      const lon = 34.7818;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Weather API responded with status ${response.status}`);
      }

      const data = await response.json();
      const currentWeather = data.current_weather;

      // Map weathercode to human-readable condition and icon
      const { condition, icon } = this.mapWeatherCode(currentWeather.weathercode);

      const weatherData = {
        city: city || 'Tel Aviv',
        temperature: Math.round(currentWeather.temperature),
        windSpeed: currentWeather.windspeed,
        condition,
        icon,
        updatedAt: new Date().toISOString()
      };

      // Update cache
      weatherCache = {
        data: weatherData,
        timestamp: now
      };

      logger.info('Weather cache updated from Open-Meteo', { city, temp: weatherData.temperature });

      return {
        ...weatherData,
        cached: false,
        ageMinutes: 0
      };
    } catch (error) {
      logger.warn('Failed to fetch external weather, using fallback/cache:', error.message);

      // Return stale cache if available
      if (weatherCache.data) {
        return {
          ...weatherCache.data,
          cached: true,
          stale: true,
          ageMinutes: Math.floor((now - weatherCache.timestamp) / 60000)
        };
      }

      // Default safe fallback if network is completely offline
      return {
        city: city || 'Tel Aviv',
        temperature: 24,
        windSpeed: 12,
        condition: 'בהיר',
        icon: '☀️',
        updatedAt: new Date().toISOString(),
        cached: true,
        fallback: true,
        ageMinutes: 0
      };
    }
  },

  mapWeatherCode(code) {
    if (code === 0) return { condition: 'בהיר', icon: '☀️' };
    if (code === 1 || code === 2) return { condition: 'מעונן חלקית', icon: '🌤️' };
    if (code === 3) return { condition: 'מעונן', icon: '☁️' };
    if ([45, 48].includes(code)) return { condition: 'ערפילי', icon: '🌫️' };
    if ([51, 53, 55, 61, 63, 65].includes(code)) return { condition: 'גשום', icon: '🌧️' };
    if ([71, 73, 75].includes(code)) return { condition: 'שלג', icon: '❄️' };
    if ([80, 81, 82].includes(code)) return { condition: 'ממטרים', icon: '🌦️' };
    if ([95, 96, 99].includes(code)) return { condition: 'סוער', icon: '⛈️' };
    return { condition: 'נאה', icon: '🌤️' };
  },

  // Helper for tests to reset cache
  clearCache() {
    weatherCache = { data: null, timestamp: 0 };
  }
};

module.exports = weatherService;
