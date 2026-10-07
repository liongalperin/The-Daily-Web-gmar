/**
 * Weather API Routes
 */

const express = require('express');
const router = express.Router();
const weatherController = require('../../controllers/weatherController');

// Public weather widget data
router.get('/', weatherController.getWeather);

module.exports = router;
