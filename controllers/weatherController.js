/**
 * Weather Controller
 * Serves weather data cached to 15 minutes max for sidebar widget.
 */

const weatherService = require('../services/weatherService');

const weatherController = {
  async getWeather(req, res, next) {
    try {
      const city = req.query.city || 'Tel Aviv';
      const weather = await weatherService.getWeather(city);

      return res.json({
        success: true,
        weather
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = weatherController;
