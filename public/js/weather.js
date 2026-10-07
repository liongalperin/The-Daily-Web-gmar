/**
 * Sidebar weather widget (Vanilla JS + Ajax).
 *
 * Data source: Open-Meteo (https://open-meteo.com): free, no API key and no credit card,
 * so no secret ever ships to the browser or the Git repository.
 *
 * Caching (the spec allows data up to 15 minutes old, for thousands of concurrent readers):
 *   - The widget asks our server first (GET /api/weather?city=). The server keeps one reading
 *     per city for 15 minutes, so Open-Meteo gets at most one call per city every 15 minutes,
 *     however many readers there are.
 *   - Only while that route doesn't exist yet (404) does the browser call Open-Meteo itself.
 *     A server error does NOT send browsers to Open-Meteo: with thousands of readers that would
 *     turn one failing call into thousands. The widget shows its last reading as stale instead.
 *   - If Open-Meteo is down, the server may answer with its last reading. Anything older than
 *     15 minutes is shown as stale, never as current.
 *   - Each reading is also stored in localStorage per city with its fetch time.
 *   - A cached reading younger than 15 minutes is shown without any network request, so one
 *     browser makes at most ~4 requests per hour, however many pages it opens.
 *   - If a refresh fails, the last cached reading stays visible, marked as stale.
 *   - While the tab stays open, it refreshes when the cache expires (only if the tab is visible).
 *
 * Depends on window.DW from main.js.
 */
(function () {
  'use strict';

  const DW = window.DW;
  const widget = document.getElementById('weather');
  if (!DW || !widget) return;

  const t = DW.t;
  const MAX_AGE_MS = 15 * 60 * 1000;
  const CITY_KEY = 'dw:weather:city';
  const API_URL = 'https://api.open-meteo.com/v1/forecast';

  const CITIES = {
    'tel-aviv': { lat: 32.0853, lon: 34.7818 },
    jerusalem: { lat: 31.7683, lon: 35.2137 },
    haifa: { lat: 32.794, lon: 34.9896 },
    'beer-sheva': { lat: 31.252, lon: 34.7915 }
  };

  const el = {
    city: document.getElementById('weather-city'),
    icon: document.getElementById('weather-icon'),
    temp: document.getElementById('weather-temp'),
    desc: document.getElementById('weather-desc'),
    wind: document.getElementById('weather-wind'),
    humidity: document.getElementById('weather-humidity'),
    status: document.getElementById('weather-status-text')
  };

  let refreshTimer = null;
  let controller = null;

  /** WMO weather code -> illustration + translation key. */
  function describe(code) {
    if (code === 0) return { icon: 'clear', key: 'wx.clear' };
    if (code === 1 || code === 2) return { icon: 'partly', key: 'wx.partly' };
    if (code === 3) return { icon: 'cloudy', key: 'wx.cloudy' };
    if (code === 45 || code === 48) return { icon: 'fog', key: 'wx.fog' };
    if (code >= 51 && code <= 57) return { icon: 'rain', key: 'wx.drizzle' };
    if (code >= 61 && code <= 67) return { icon: 'rain', key: 'wx.rain' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'snow', key: 'wx.snow' };
    if (code >= 80 && code <= 82) return { icon: 'rain', key: 'wx.showers' };
    if (code >= 95) return { icon: 'storm', key: 'wx.storm' };
    return { icon: 'cloudy', key: 'wx.cloudy' };
  }

  function cacheKey(city) {
    return 'dw:weather:' + city;
  }

  function setMode(mode) {
    widget.classList.toggle('is-loading', mode === 'loading');
    widget.classList.toggle('is-stale', mode === 'stale');
    widget.classList.toggle('is-error', mode === 'error');
    widget.setAttribute('aria-busy', String(mode === 'loading'));
  }

  function render(reading, mode) {
    const info = describe(reading.code);
    el.icon.setAttribute('href', '#wx-' + info.icon);
    el.temp.textContent = DW.fmt.number(Math.round(reading.temperature), {});
    el.desc.textContent = t(info.key);
    el.wind.textContent = DW.fmt.number(Math.round(reading.wind), {});
    el.humidity.textContent = DW.fmt.number(Math.round(reading.humidity), {});
    el.status.textContent = t(mode === 'stale' ? 'weather.stale' : 'weather.updated', { time: DW.fmt.time(reading.fetchedAt) });
    setMode(mode);
  }

  /** Our server's cached reading: { temperature, humidity, wind, code, fetchedAt }. */
  async function fetchFromServer(city, signal) {
    const data = await DW.api('/api/weather?city=' + encodeURIComponent(city), { signal: signal });
    if (!data || typeof data.temperature !== 'number') throw new Error('Unexpected weather payload');
    return {
      temperature: data.temperature,
      humidity: data.humidity,
      wind: data.wind,
      code: data.code,
      // The server's fetch time, so the "updated" label and the local cache age stay honest.
      fetchedAt: new Date(data.fetchedAt).getTime() || Date.now()
    };
  }

  async function fetchReading(city, signal) {
    try {
      return await fetchFromServer(city, signal);
    } catch (error) {
      if (error.status !== 404) throw error;
      return fetchFromOpenMeteo(city, signal);
    }
  }

  async function fetchFromOpenMeteo(city, signal) {
    const coords = CITIES[city];
    const params = new URLSearchParams({
      latitude: String(coords.lat),
      longitude: String(coords.lon),
      current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      wind_speed_unit: 'kmh',
      timezone: 'auto'
    });
    // Cross-origin call: no credentials, so plain fetch() rather than DW.api().
    const response = await fetch(API_URL + '?' + params.toString(), { signal: signal });
    if (!response.ok) throw new Error('Weather HTTP ' + response.status);
    const data = await response.json();
    const current = data && data.current;
    if (!current || typeof current.temperature_2m !== 'number') throw new Error('Unexpected weather payload');
    return {
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      code: current.weather_code,
      fetchedAt: Date.now()
    };
  }

  /** Show the cached reading if it's fresh enough; otherwise fetch a new one. */
  async function load(city) {
    clearTimeout(refreshTimer);
    if (controller) controller.abort();

    const cached = DW.storage.get(cacheKey(city), null);
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;

    if (cached && age < MAX_AGE_MS) {
      render(cached, 'live');
      scheduleRefresh(city, MAX_AGE_MS - age);
      return;
    }

    if (cached) render(cached, 'live');
    else setMode('loading');

    controller = new AbortController();
    try {
      const reading = await fetchReading(city, controller.signal);
      DW.storage.set(cacheKey(city), reading);
      // The server's reading can be old (it serves its last one while Open-Meteo is down).
      const readingAge = Date.now() - reading.fetchedAt;
      const fresh = readingAge < MAX_AGE_MS;
      if (el.city.value === city) render(reading, fresh ? 'live' : 'stale');
      scheduleRefresh(city, fresh ? MAX_AGE_MS - readingAge : 60 * 1000);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (cached) {
        render(cached, 'stale');
      } else {
        el.desc.textContent = t('weather.error');
        el.status.textContent = t('weather.error');
        setMode('error');
      }
      scheduleRefresh(city, 60 * 1000); // try again in a minute
    }
  }

  function scheduleRefresh(city, delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      if (document.visibilityState === 'visible') load(city);
      else document.addEventListener('visibilitychange', function onVisible() {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', onVisible);
        load(el.city.value);
      });
    }, Math.max(delay, 1000));
  }

  /* ---------- Start ---------- */
  const savedCity = DW.storage.get(CITY_KEY, 'tel-aviv');
  if (CITIES[savedCity]) el.city.value = savedCity;

  el.city.addEventListener('change', function () {
    DW.storage.set(CITY_KEY, el.city.value);
    load(el.city.value);
  });

  // The weather isn't urgent; let the article feed load first.
  const start = function () { load(el.city.value); };
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 2000 });
  else setTimeout(start, 300);
})();
