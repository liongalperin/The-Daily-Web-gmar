/**
 * The Daily Web — core client script (Vanilla JS, no libraries).
 *
 * Loaded on every page. Contains:
 *   1. Helpers: translations (t), formatting, safe localStorage, the api() Ajax wrapper
 *   2. Header behaviour: mobile menu, language switch, day/night theme, password show/hide
 *   3. FeedController: infinite scroll + live search / section filter / viewed filter / sort
 *   4. AutoSave: silent background saving of a reporter's draft (no "Save" button)
 *
 * Page-specific scripts (article.js, weather.js) use the shared helpers via window.DW.
 */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  /* ======================================================================
     1. Helpers
     ====================================================================== */

  const LANG = document.documentElement.lang || 'he';

  // Translations rendered by the server into <script id="i18n-data" type="application/json">.
  const STRINGS = (function () {
    const node = document.getElementById('i18n-data');
    try {
      return node ? JSON.parse(node.textContent) : {};
    } catch (error) {
      return {};
    }
  })();

  /** Translate a key, replacing {placeholders} with values from vars. */
  function t(key, vars) {
    const text = Object.prototype.hasOwnProperty.call(STRINGS, key) ? STRINGS[key] : key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
    });
  }

  // Same Intl options as the server (utils/i18n.js), so Ajax-rendered cards match server-rendered ones.
  const fmt = {
    date: function (value, options) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat(LANG, options || { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    },
    time: function (value) {
      return fmt.date(value, { hour: '2-digit', minute: '2-digit' });
    },
    iso: function (value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    },
    number: function (value, options) {
      return new Intl.NumberFormat(LANG, options || { notation: 'compact' }).format(Number(value) || 0);
    }
  };

  /** localStorage wrapper: never throws (private mode, full quota, corrupted JSON). */
  const storage = {
    get: function (key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },
    remove: function (key) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        /* storage unavailable: nothing to remove */
      }
    }
  };

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, wait);
    };
  }

  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax';
  }

  /** Error thrown by api(). status 0 means the request never reached the server (offline, DNS, CORS...). */
  class ApiError extends Error {
    constructor(status, message, data, retryAfter) {
      super(message || 'Request failed');
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
      this.retryAfter = retryAfter; // seconds, or null
    }
  }

  function parseRetryAfter(header) {
    if (!header) return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
    const date = Date.parse(header);
    return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000));
  }

  /**
   * Ajax helper around fetch(): sends/receives JSON, sends the session cookie,
   * and turns HTTP errors and network failures into an ApiError.
   * An AbortError (request cancelled on purpose) is re-thrown unchanged.
   */
  async function api(url, options) {
    const opts = options || {};
    const headers = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        credentials: 'same-origin',
        signal: opts.signal,
        keepalive: Boolean(opts.keepalive)
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError(0, 'Network error', null, null);
    }

    let data = null;
    const type = response.headers.get('Content-Type') || '';
    if (response.status !== 204 && type.indexOf('application/json') !== -1) {
      data = await response.json().catch(function () { return null; });
    }

    if (!response.ok) {
      const message = data && (data.error || data.message);
      throw new ApiError(response.status, message || response.statusText, data, parseRetryAfter(response.headers.get('Retry-After')));
    }
    return data;
  }

  /**
   * Articles this browser has opened. The server's per-session list is the source of truth
   * (it drives the viewed filter and sends `viewed` on each card); this local copy only covers
   * an article opened a moment ago, before the feed is fetched again (e.g. Back from the article).
   */
  const viewed = {
    KEY: 'dw:viewed',
    MAX: 1000,
    list: function () {
      const ids = storage.get(viewed.KEY, []);
      return Array.isArray(ids) ? ids : [];
    },
    has: function (id) {
      return viewed.list().indexOf(String(id)) !== -1;
    },
    add: function (id) {
      const ids = viewed.list().filter(function (existing) { return existing !== String(id); });
      ids.unshift(String(id));
      storage.set(viewed.KEY, ids.slice(0, viewed.MAX));
    }
  };

  /* ======================================================================
     2. Header: mobile menu, language, theme
     ====================================================================== */

  function initHeader() {
    const nav = document.querySelector('.sitenav');
    const toggle = document.getElementById('nav-toggle');

    function setMenu(open) {
      if (!nav || !toggle) return;
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? toggle.dataset.labelClose : toggle.dataset.labelOpen);
    }

    if (nav && toggle) {
      toggle.addEventListener('click', function () {
        setMenu(toggle.getAttribute('aria-expanded') !== 'true');
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && nav.classList.contains('is-open')) {
          setMenu(false);
          toggle.focus();
        }
      });
      document.addEventListener('click', function (event) {
        if (nav.classList.contains('is-open') && !nav.contains(event.target)) setMenu(false);
      });
      nav.addEventListener('click', function (event) {
        if (event.target.closest('a')) setMenu(false);
      });
      // Close the mobile panel if the window grows past the breakpoint.
      window.matchMedia('(min-width: 768px)').addEventListener('change', function () { setMenu(false); });
    }

    // Show / hide password buttons: <button data-password-toggle="input-id" data-label-show data-label-hide>
    document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      button.addEventListener('click', function () {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? button.dataset.labelHide : button.dataset.labelShow;
        button.setAttribute('aria-pressed', String(show));
        input.focus();
      });
    });

    // Language: stored in a cookie so the server renders the next page in that language.
    const langButton = document.getElementById('lang-toggle');
    if (langButton) {
      langButton.addEventListener('click', function () {
        setCookie('lang', langButton.dataset.lang);
        window.location.reload();
      });
    }

    // Theme: switches instantly, and the cookie lets the server render it on the next load (no flash).
    const themeButton = document.getElementById('theme-toggle');
    if (themeButton) {
      const root = document.documentElement;
      const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const label = themeButton.querySelector('.theme-toggle__label');
      const currentTheme = function () {
        return root.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');
      };
      const syncLabel = function () {
        // The button names the theme it switches *to*.
        const next = currentTheme() === 'dark' ? themeButton.dataset.labelLight : themeButton.dataset.labelDark;
        if (label) label.textContent = next;
        themeButton.setAttribute('aria-label', next);
      };
      themeButton.addEventListener('click', function () {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        setCookie('theme', next);
        syncLabel();
      });
      darkQuery.addEventListener('change', syncLabel);
      syncLabel();
    }
  }

  /* ======================================================================
     3. FeedController — infinite scroll, search, filter and sort
     ====================================================================== */

  const SCROLL_LEAD_PX = 600;  // start loading this far before the user reaches the bottom
  const SEARCH_DELAY_MS = 300; // wait for a pause in typing before searching
  const KEYBOARD_LEAD_CARDS = 3; // focus on one of the last N cards loads the next page

  class FeedController {
    constructor(root) {
      this.root = root;
      this.form = root.querySelector('#feed-controls');
      this.list = root.querySelector('#feed-list');
      this.template = document.getElementById('card-template');
      this.sentinel = root.querySelector('#feed-sentinel');
      this.heading = root.querySelector('#feed-title');
      this.searchInput = root.querySelector('#feed-q');
      this.ui = {
        loader: root.querySelector('#feed-loader'),
        empty: root.querySelector('#feed-empty'),
        end: root.querySelector('#feed-end'),
        error: root.querySelector('#feed-error'),
        retry: root.querySelector('#feed-retry')
      };

      this.pageSize = Number(root.dataset.pageSize) || 20;
      this.page = 1;
      this.hasMore = this.list.dataset.hasMore === 'true';
      this.loading = false;
      this.controller = null;  // AbortController of the request in flight
      this.requestId = 0;      // ignores responses that arrive after a newer request started
      this.failedMode = null;  // 'append' | 'replace': what Retry should repeat
      this.state = this.readForm();
      this.category = this.state.category;
      this.renderedIds = new Set();

      const self = this;
      this.list.querySelectorAll('.card').forEach(function (card) {
        self.renderedIds.add(card.dataset.id);
        self.markIfViewed(card);
      });

      // Tag the entry we arrived on, so Back from a filtered view can restore it.
      window.history.replaceState({ feed: this.state }, '');

      this.bindEvents();
      this.observe();
    }

    /** Current filter values from the controls. */
    readForm() {
      return {
        q: this.searchInput.value.trim(),
        category: this.category !== undefined ? this.category : this.pressedCategory(),
        viewed: this.form.elements.viewed.value,
        sort: this.form.elements.sort.value
      };
    }

    pressedCategory() {
      const pressed = this.form.querySelector('.chip-sec[aria-pressed="true"]');
      return pressed ? pressed.value : '';
    }

    bindEvents() {
      const self = this;

      // Enter in the search box or a click on a section chip: handled here instead of reloading the page.
      this.form.addEventListener('submit', function (event) {
        event.preventDefault();
        const submitter = event.submitter;
        if (submitter && submitter.name === 'category') {
          self.setCategory(submitter.value);
        } else {
          self.applyFilters();
        }
      });

      this.searchInput.addEventListener('input', debounce(function () { self.applyFilters(); }, SEARCH_DELAY_MS));
      this.form.elements.viewed.addEventListener('change', function () { self.applyFilters(); });
      this.form.elements.sort.addEventListener('change', function () { self.applyFilters(); });

      // Section links in the top navigation filter the feed in place while on the home page.
      document.querySelectorAll('.sitenav__link[data-category]').forEach(function (link) {
        link.addEventListener('click', function (event) {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          self.setCategory(link.dataset.category);
          self.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      // Keyboard users don't scroll the sentinel into view: start loading the next page as soon as
      // focus reaches one of the last cards, so Tab moves on to new articles, not to the sidebar.
      this.list.addEventListener('focusin', function (event) {
        const item = event.target.closest('li');
        if (!item || item.parentElement !== self.list) return;
        const items = self.list.children;
        if (Array.prototype.indexOf.call(items, item) >= items.length - KEYBOARD_LEAD_CARDS) self.loadMore();
      });

      // Back/Forward between filtered views: restore the controls and reload the feed, no new entry.
      window.addEventListener('popstate', function (event) {
        const saved = event.state && event.state.feed;
        if (!saved) return;
        self.searchInput.value = saved.q;
        self.form.elements.viewed.value = saved.viewed;
        self.form.elements.sort.value = saved.sort;
        self.category = saved.category;
        self.syncCategory(saved.category);
        self.state = self.readForm();
        self.fetchPage(1, 'replace');
      });

      this.ui.retry.addEventListener('click', function () {
        if (self.failedMode === 'replace') self.fetchPage(1, 'replace');
        else self.loadMore();
      });
    }

    /** IntersectionObserver fires once each time the sentinel enters the zone below the viewport. */
    observe() {
      const self = this;
      if (!('IntersectionObserver' in window)) {
        window.addEventListener('scroll', debounce(function () { self.checkSentinel(); }, 100), { passive: true });
        return;
      }
      this.observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) self.loadMore();
      }, { rootMargin: '0px 0px ' + SCROLL_LEAD_PX + 'px 0px' });
      this.observer.observe(this.sentinel);
    }

    /**
     * After a page is appended the sentinel may still be inside the zone (e.g. a very tall screen).
     * The observer won't fire again in that case, so check manually.
     */
    checkSentinel() {
      if (this.loading || !this.hasMore) return;
      const top = this.sentinel.getBoundingClientRect().top;
      if (top - window.innerHeight <= SCROLL_LEAD_PX) this.loadMore();
    }

    setCategory(slug) {
      this.category = slug;
      this.syncCategory(slug);
      this.applyFilters();
    }

    /** Show `slug` as the active section on the chips, the top navigation and the heading. */
    syncCategory(slug) {
      this.form.querySelectorAll('.chip-sec').forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.value === slug));
      });
      document.querySelectorAll('.sitenav__link[data-category]').forEach(function (link) {
        const active = link.dataset.category === slug;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      this.heading.textContent = slug ? t('cat.' + slug) : t('feed.title');
    }

    /** Re-read the controls; if anything changed, replace the feed with page 1 of the new results. */
    applyFilters() {
      const next = this.readForm();
      if (JSON.stringify(next) === JSON.stringify(this.state)) return;
      // Typing a search refines one entry instead of adding one per pause; any other change
      // (section, read filter, sort, or starting a new search) gets its own Back step.
      const onlySearch = ['category', 'viewed', 'sort'].every(function (key) { return next[key] === this.state[key]; }, this);
      const refining = onlySearch && window.history.state && window.history.state.typing;
      this.state = next;
      this.updateUrl(refining ? 'replace' : 'push', onlySearch);
      this.fetchPage(1, 'replace');
    }

    loadMore() {
      if (this.loading || !this.hasMore) return;
      this.fetchPage(this.page + 1, 'append');
    }

    buildQuery(page) {
      const params = new URLSearchParams({ page: String(page), limit: String(this.pageSize) });
      if (this.state.q) params.set('q', this.state.q);
      if (this.state.category) params.set('category', this.state.category);
      if (this.state.viewed !== 'all') params.set('viewed', this.state.viewed);
      params.set('sort', this.state.sort);
      return params;
    }

    /** Keep the address bar in sync, so the filtered view can be shared, reloaded and reached with Back. */
    updateUrl(how, typing) {
      const params = this.buildQuery(1);
      params.delete('page');
      params.delete('limit');
      if (params.get('sort') === 'date') params.delete('sort');
      const query = params.toString();
      const entry = { feed: this.state, typing: Boolean(typing) };
      const url = window.location.pathname + (query ? '?' + query : '');
      if (how === 'push') window.history.pushState(entry, '', url);
      else window.history.replaceState(entry, '', url);
    }

    /**
     * Fetch one page of articles.
     *   mode 'append'  - infinite scroll: add the cards below the existing ones
     *   mode 'replace' - new search/filter/sort: cancel any request in flight and swap the list
     */
    async fetchPage(page, mode) {
      if (this.controller) this.controller.abort();
      this.controller = new AbortController();
      const requestId = ++this.requestId;

      this.loading = true;
      this.showStatus('loading', mode);

      let succeeded = false;
      try {
        const data = await api('/api/articles?' + this.buildQuery(page).toString(), { signal: this.controller.signal });
        if (requestId !== this.requestId) return;

        const items = Array.isArray(data) ? data : ((data && (data.articles || data.items)) || []);
        this.hasMore = data && typeof data.hasMore === 'boolean' ? data.hasMore : items.length >= this.pageSize;
        this.page = page;

        if (mode === 'replace') {
          this.list.replaceChildren();
          this.renderedIds.clear();
          // If the user had scrolled deep into the old results, bring the top of the new ones into view.
          if (this.root.getBoundingClientRect().top < 0) this.root.scrollIntoView({ block: 'start' });
        }
        this.append(items);
        this.showStatus(this.list.children.length ? (this.hasMore ? 'idle' : 'end') : 'empty');
        succeeded = true;
      } catch (error) {
        if (error.name === 'AbortError' || requestId !== this.requestId) return;
        this.failedMode = mode;
        this.ui.error.querySelector('span').textContent = error.status >= 500 ? t('error.server') : t('feed.error');
        this.showStatus('error');
      } finally {
        if (requestId === this.requestId) {
          this.loading = false;
          this.controller = null;
          this.list.setAttribute('aria-busy', 'false');
          this.list.classList.remove('is-replacing');
        }
      }
      if (succeeded) window.requestAnimationFrame(this.checkSentinel.bind(this));
    }

    append(items) {
      const fragment = document.createDocumentFragment();
      for (const article of items) {
        const id = String(article._id || article.id);
        // Offset paging can repeat an article if new ones were published meanwhile; skip duplicates.
        if (this.renderedIds.has(id)) continue;
        this.renderedIds.add(id);
        fragment.appendChild(this.renderCard(article, id));
      }
      this.list.appendChild(fragment);
    }

    /** Fill the <template id="card-template"> clone. Only textContent/attributes are set, never innerHTML. */
    renderCard(article, id) {
      const node = this.template.content.firstElementChild.cloneNode(true);
      const card = node.querySelector('.card');
      card.dataset.id = id;
      card.dataset.section = article.category || '';
      card.classList.add('is-new');

      const img = node.querySelector('.card__media img');
      img.src = /^(https?:\/\/|\/(?!\/))/i.test(article.imageUrl || '') ? article.imageUrl : '/images/placeholder.svg';
      img.addEventListener('error', function () { img.src = '/images/placeholder.svg'; }, { once: true });

      node.querySelector('.kicker__sec').textContent = t('cat.' + article.category);
      const link = node.querySelector('.card__title a');
      link.href = '/articles/' + encodeURIComponent(id);
      link.textContent = article.title || '';
      node.querySelector('.card__summary').textContent = article.summary || '';
      node.querySelector('.byline__name').textContent = article.authorName || '';

      const time = node.querySelector('time');
      time.dateTime = fmt.iso(article.publishedAt);
      time.textContent = fmt.date(article.publishedAt);

      node.querySelector('.card__views').textContent = fmt.number(article.views);
      node.querySelector('.card__comments').textContent = fmt.number(article.commentsCount);

      if (typeof article.viewed === 'boolean') card.dataset.viewed = String(article.viewed);
      this.markIfViewed(card);
      return node;
    }

    markIfViewed(card) {
      const badge = card.querySelector('.card__read');
      if (badge) badge.hidden = !(card.dataset.viewed === 'true' || viewed.has(card.dataset.id));
    }

    showStatus(state, mode) {
      const ui = this.ui;
      ui.loader.hidden = state !== 'loading';
      ui.empty.hidden = state !== 'empty';
      ui.end.hidden = state !== 'end';
      ui.error.hidden = state !== 'error';
      if (state === 'loading') {
        this.list.setAttribute('aria-busy', 'true');
        if (mode === 'replace') this.list.classList.add('is-replacing');
      }
      if (state === 'error') {
        ui.error.classList.remove('is-shake');
        void ui.error.offsetWidth; // restart the animation
        ui.error.classList.add('is-shake');
      }
    }
  }

  /* ======================================================================
     4. AutoSave — background saving of the reporter's draft
     ======================================================================
     Usage (reporter editor page):
       <p class="save-status" id="save-status" role="status" aria-live="polite"></p>
       <form data-autosave data-article-id="<%= article._id %>" data-updated-at="<%= article.updatedAt %>"
             data-status-target="#save-status"> ...inputs named title / summary / content / category / imageUrl... </form>
     main.js finds such forms automatically. There is deliberately no Save button.

     Flow: input -> 1.5 s pause -> PUT /api/articles/:id/auto-save.
       - Only one request at a time; edits made during a save trigger one follow-up save.
       - Every change is also mirrored to localStorage, so a crash or a closed tab loses nothing.
       - Network failure / 5xx: "Connection lost – retrying save", exponential backoff 2 s -> 30 s,
         and an immediate retry when the browser comes back online.
       - 401: session expired (stop and ask to log in). 403/404: not allowed (stop).
  */

  const AUTOSAVE_FIELDS = ['title', 'summary', 'content', 'category', 'imageUrl'];
  const AUTOSAVE_DELAY_MS = 1500;
  const RETRY_MIN_MS = 2000;
  const RETRY_MAX_MS = 30000;

  class AutoSave {
    constructor(options) {
      this.form = options.form;
      this.articleId = options.articleId;
      this.statusEl = options.statusEl || null;
      this.endpoint = options.endpoint || '/api/articles/' + encodeURIComponent(this.articleId) + '/auto-save';
      this.delay = options.delay || AUTOSAVE_DELAY_MS;
      this.backupKey = 'dw:draft:' + this.articleId;
      this.serverUpdatedAt = options.serverUpdatedAt ? new Date(options.serverUpdatedAt).getTime() || 0 : 0;

      const form = this.form;
      this.fields = AUTOSAVE_FIELDS.filter(function (name) { return form.elements[name]; });

      this.dirty = false;
      this.inFlight = false;
      this.pending = false;
      this.stopped = false;
      this.debounceTimer = null;
      this.retryTimer = null;
      this.countdownTimer = null;
      this.retryDelay = RETRY_MIN_MS;
      this.lastSaved = this.snapshot();

      this.saveButton = options.saveButton || null;

      this.onInput = this.onInput.bind(this);
      this.form.addEventListener('input', this.onInput);
      // 'change' is what the category <select> fires -- 'input' alone would miss it.
      this.form.addEventListener('change', this.onInput);
      // Enter in a single-line field must not reload the page; it saves instead, which is
      // what a reader of the Save button expects Enter to do.
      const self0 = this;
      this.form.addEventListener('submit', function (event) {
        event.preventDefault();
        self0.saveNow();
      });
      if (this.saveButton) {
        this.saveButton.addEventListener('click', function () { self0.saveNow(); });
      }

      const self = this;
      window.addEventListener('online', function () {
        if (self.dirty && !self.stopped) self.saveNow();
      });
      // Last chance when the tab is hidden or closed: keepalive lets the request outlive the page.
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') self.flush();
      });
      window.addEventListener('pagehide', function () { self.flush(); });

      this.setStatus('idle');
      this.syncButton();
      this.offerRestore();
    }

    /**
     * Reflect the save state on the button: it is live only while there is something to
     * save. Autosave still runs on its timer, so the button is a way to commit a change
     * immediately and to SEE that one is outstanding -- never the only way to save.
     */
    syncButton() {
      if (!this.saveButton) return;
      const busy = this.inFlight || Boolean(this.retryTimer);
      this.saveButton.disabled = this.stopped || busy || !this.dirty;
      this.saveButton.dataset.dirty = this.dirty ? 'true' : 'false';
    }

    values() {
      const data = {};
      for (const name of this.fields) data[name] = this.form.elements[name].value;
      return data;
    }

    snapshot() {
      return JSON.stringify(this.values());
    }

    onInput() {
      if (this.stopped) return;
      if (this.snapshot() === this.lastSaved) return;
      this.dirty = true;
      this.syncButton();
      storage.set(this.backupKey, { values: this.values(), savedAt: Date.now() });
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(this.save.bind(this), this.delay);
    }

    /** Skip any waiting timer and save immediately. */
    saveNow() {
      clearTimeout(this.debounceTimer);
      this.clearRetry();
      this.save();
    }

    async save() {
      if (this.stopped || !this.dirty) return;
      if (this.inFlight) {
        this.pending = true;
        return;
      }

      const payload = this.values();
      const snapshot = JSON.stringify(payload);
      this.clearRetry();
      this.inFlight = true;
      this.dirty = false;
      this.setStatus('saving');
      this.syncButton();

      try {
        const data = await api(this.endpoint, { method: 'PUT', body: payload });
        this.lastSaved = snapshot;
        this.retryDelay = RETRY_MIN_MS;
        if (this.snapshot() === snapshot) storage.remove(this.backupKey);
        this.setStatus('saved', { time: fmt.time((data && data.updatedAt) || Date.now()) });
      } catch (error) {
        this.dirty = true;
        this.handleError(error);
      } finally {
        this.inFlight = false;
        this.syncButton();
        if (this.pending) {
          this.pending = false;
          if (this.dirty && !this.retryTimer) this.save();
        }
      }
    }

    handleError(error) {
      const status = error.status;
      if (status === 401) {
        this.stop('error', t('autosave.unauthorized'));
      } else if (status === 403 || status === 404) {
        this.stop('error', (error.data && error.data.error) || t('autosave.forbidden'));
      } else if (status === 0 || status === 408 || status === 429 || status >= 500) {
        this.scheduleRetry(error.retryAfter);
      } else {
        // Validation errors (400/409/422): show the server's message; the next edit tries again.
        this.setStatus('error', null, error.message);
      }
    }

    scheduleRetry(retryAfterSeconds) {
      const self = this;
      const wait = retryAfterSeconds ? retryAfterSeconds * 1000 : this.retryDelay;
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);

      let remaining = Math.ceil(wait / 1000);
      this.setStatus('offline', { seconds: remaining });
      this.countdownTimer = setInterval(function () {
        remaining -= 1;
        if (remaining > 0) self.setStatus('offline', { seconds: remaining });
      }, 1000);
      this.retryTimer = setTimeout(function () {
        self.clearRetry();
        self.save();
      }, wait);
    }

    clearRetry() {
      clearTimeout(this.retryTimer);
      clearInterval(this.countdownTimer);
      this.retryTimer = null;
      this.countdownTimer = null;
    }

    /**
     * Save now and resolve once the server has the latest text. Used before "Submit for approval",
     * so an article is never submitted with edits that are still only in the browser.
     * Rejects if the changes could not be saved (offline, session expired...).
     */
    async saveAndWait() {
      const idle = () => new Promise((resolve) => {
        const check = () => (this.inFlight ? setTimeout(check, 50) : resolve());
        check();
      });
      clearTimeout(this.debounceTimer);
      this.clearRetry();
      await idle();
      if (this.dirty) await this.save();
      await idle();
      if (this.dirty || this.stopped) throw new Error('Unsaved changes');
    }

    /** Send unsaved changes while the page is going away. The localStorage backup covers a failure. */
    flush() {
      if (!this.dirty || this.stopped || this.inFlight) return;
      clearTimeout(this.debounceTimer);
      api(this.endpoint, { method: 'PUT', body: this.values(), keepalive: true }).catch(function () {});
    }

    stop(state, message) {
      this.stopped = true;
      clearTimeout(this.debounceTimer);
      this.clearRetry();
      this.setStatus(state, null, message);
      this.syncButton();
    }

    setStatus(state, vars, message) {
      if (!this.statusEl) return;
      const texts = {
        idle: t('autosave.idle'),
        saving: t('autosave.saving'),
        saved: t('autosave.saved', vars),
        offline: vars && vars.seconds ? t('autosave.retrying', vars) : t('autosave.offline'),
        error: message || t('autosave.offline')
      };
      this.statusEl.dataset.state = state;
      this.statusEl.textContent = texts[state];
    }

    /**
     * If this browser holds a newer copy than the server, put it back in the form and save it.
     * This happens when the page reloads before the last save lands (refresh right after typing),
     * or after a crash while offline. It is applied automatically -- not just offered -- because
     * any typing on top of the older server text would overwrite the newer backup for good.
     * The notice lets the reporter go back to the server's copy instead.
     */
    offerRestore() {
      const backup = storage.get(this.backupKey, null);
      if (!backup || !backup.values || backup.savedAt <= this.serverUpdatedAt) return;
      if (JSON.stringify(backup.values) === this.lastSaved) {
        storage.remove(this.backupKey);
        return;
      }

      const self = this;
      const serverValues = this.values();
      const fill = function (values) {
        for (const name of self.fields) {
          if (name in values) self.form.elements[name].value = values[name];
        }
        // Let listeners (word count, image preview, section color) catch up with the new values.
        for (const name of self.fields) {
          self.form.elements[name].dispatchEvent(new Event('input', { bubbles: true }));
        }
        self.saveNow();
      };
      fill(backup.values);

      const box = document.createElement('div');
      box.className = 'alert alert--warning restore';
      box.setAttribute('role', 'status');

      const text = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'alert__title';
      title.textContent = t('autosave.restoreTitle');
      const body = document.createElement('p');
      body.textContent = t('autosave.restoreBody', { time: fmt.date(backup.savedAt) });
      text.append(title, body);

      const actions = document.createElement('div');
      actions.className = 'restore__actions';
      const keep = document.createElement('button');
      keep.type = 'button';
      keep.className = 'btn btn--primary';
      keep.textContent = t('autosave.restore');
      const revert = document.createElement('button');
      revert.type = 'button';
      revert.className = 'btn btn--ghost';
      revert.textContent = t('autosave.discard');
      actions.append(keep, revert);

      box.append(text, actions);
      this.form.prepend(box);

      keep.addEventListener('click', function () { box.remove(); });
      revert.addEventListener('click', function () {
        box.remove();
        fill(serverValues);
      });
    }

    /** Attach to every <form data-autosave> on the page. */
    static autoInit() {
      return Array.prototype.map.call(document.querySelectorAll('form[data-autosave]'), function (form) {
        return new AutoSave({
          form: form,
          articleId: form.dataset.articleId,
          serverUpdatedAt: form.dataset.updatedAt,
          statusEl: form.dataset.statusTarget ? document.querySelector(form.dataset.statusTarget) : form.querySelector('.save-status'),
          saveButton: form.dataset.saveTarget ? document.querySelector(form.dataset.saveTarget) : form.querySelector('.save-now')
        });
      });
    }
  }

  /* ======================================================================
     Boot
     ====================================================================== */

  /**
   * User-facing text for a failed DW.api() call, so "the server failed" is never reported as
   * "check your connection":
   *   status 0 (no response)  -> the connection
   *   5xx                     -> a problem on our side, try again shortly
   *   4xx with { error }      -> the API's own message (it describes what's wrong)
   *   anything else           -> `fallback`, or a generic message
   */
  function errorText(error, fallback) {
    const status = error ? error.status : undefined;
    if (status === 0) return t('error.network');
    if (status >= 500) return t('error.server');
    if (status >= 400 && error.message) return error.message;
    return fallback || t('desk.actionFailed');
  }

  window.DW = {
    lang: LANG,
    errorText: errorText,
    t: t,
    fmt: fmt,
    storage: storage,
    debounce: debounce,
    api: api,
    ApiError: ApiError,
    viewed: viewed,
    FeedController: FeedController,
    AutoSave: AutoSave
  };

  initHeader();

  const feedRoot = document.getElementById('feed');
  if (feedRoot) window.DW.feed = new FeedController(feedRoot);

  window.DW.autosaves = AutoSave.autoInit();
})();
