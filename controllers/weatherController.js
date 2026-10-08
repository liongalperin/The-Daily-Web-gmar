/**
 * Weather Controller
 * Serves weather data cached to 15 minutes max for sidebar widget.
 */

const weatherService = require('../services/weatherService');

const weatherController = {
  async getWeather(req, res) {
    const city = req.query.city || 'tel-aviv';
    if (!weatherService.isKnownCity(city)) {
      return res.status(400).json({
        error: `Unknown city. Use one of: ${Object.keys(weatherService.CITIES).join(', ')}`
      });
    }

    try {
      const weather = await weatherService.getWeather(city);
      return res.json(weather);
    } catch (error) {
      // Open-Meteo is down and there is no earlier reading to fall back on
      return res.status(502).json({ error: 'Weather service unavailable' });
    }
  }
};

module.exports = weatherController;
