# 🔌 REST API Contract

This contract defines the async Ajax routes required to update the UI without a full page refresh.

All successful responses follow the standard API envelope: `{ "success": true, ... }`.
All error responses return `{ "success": false, "error": "...", "details": [...] }` with standard HTTP error codes.

---

## Public Routes

### `GET /api/articles`
*   **Purpose:** Fetch articles for the infinite scroll feed and live search.
*   **Query Params:** `?page=1&limit=20&category=transport&sort=date&q=keyword`
    *   `page`: Number (default: 1)
    *   `limit`: Number (default: 20)
    *   `category`: String (optional filter: 'news', 'politics', 'business', 'tech', 'sports', 'culture', 'transport', 'all', 'הכל')
    *   `sort`: 'date' | 'popularity' (default: 'date')
    *   `q` or `search`: String (case-insensitive substring/regex search across titles and summaries)
*   **Response (`200 OK`):**
    ```json
    {
      "success": true,
      "page": 1,
      "limit": 20,
      "hasMore": true,
      "articles": [
        {
          "id": "6ac...",
          "_id": "6ac...",
          "title": "כותרת הכתבה",
          "summary": "תקציר הכתבה לכרטיסייה...",
          "snippet": "תקציר הכתבה לכרטיסייה...",
          "imageUrl": "/images/news.jpg",
          "category": "tech",
          "publishedAt": "2026-10-07T12:00:00.000Z",
          "author": {
            "id": "6ac...",
            "username": "reporter1",
            "fullName": "ישראל ישראלי"
          },
          "views": 250,
          "totalViews": 250
        }
      ]
    }
    ```

### `GET /api/articles/:id`
*   **Purpose:** Fetch full article details for reading and SSR. Increments view statistics asynchronously.
*   **Response (`200 OK`):**
    ```json
    {
      "success": true,
      "article": {
        "id": "6ac...",
        "title": "כותרת הכתבה המלאה",
        "content": "<p>תוכן הכתבה המלא...</p>",
        "summary": "תקציר...",
        "imageUrl": "/images/news.jpg",
        "category": "tech",
        "publishedAt": "2026-10-07T12:00:00.000Z",
        "author": { "username": "reporter1", "fullName": "ישראל ישראלי" },
        "views": 251,
        "totalViews": 251,
        "comments": [...]
      }
    }
    ```

### `POST /api/comments`
*   **Purpose:** Post a new comment.
*   **Payload:** `{ "articleId": "...", "content": "...", "authorName": "ישראל", "deviceId": "user-uuid" }`
*   **Constraints:** Will return `429 Too Many Requests` with a `Retry-After: <seconds>` header if the user exceeds 3 comments per minute from the same device/IP.
*   **Response (`201 Created`):**
    ```json
    {
      "success": true,
      "message": "Comment posted successfully",
      "comment": {
        "_id": "6ac...",
        "articleId": "6ac...",
        "authorName": "ישראל",
        "content": "יופי של כתבה!",
        "createdAt": "2026-10-07T14:30:00.000Z"
      }
    }
    ```

### `GET /api/weather`
*   **Purpose:** Fetch cached weather data for the sidebar widget.
*   **Query Params:** `?city=Tel+Aviv` (default: 'Tel Aviv')
*   **Cache:** Server caches response up to 15 minutes to support thousands of concurrent users.
*   **Response (`200 OK`):**
    ```json
    {
      "success": true,
      "weather": {
        "city": "Tel Aviv",
        "temperature": 25,
        "condition": "מעונן חלקית",
        "icon": "🌤️",
        "updatedAt": "2026-10-07T14:00:00.000Z",
        "cached": true
      }
    }
    ```

---

## Reporter Routes

### `POST /api/articles`
*   **Purpose:** Create a new draft article.
*   **Headers:** Requires authenticated session (`Reporter` role).
*   **Payload:** `{ "title": "...", "content": "...", "summary": "...", "category": "tech", "imageUrl": "..." }`
*   **Response (`201 Created`):** `{ "success": true, "article": { "_id": "...", "status": "Draft", ... } }`

### `PUT /api/articles/:id/auto-save`
*   **Purpose:** Continuously save the reporter's ongoing draft silently while they type.
*   **Headers:** Requires authenticated session and ownership of the article.
*   **Payload:** `{ "title": "...", "content": "...", "summary": "...", "category": "tech", "imageUrl": "..." }`
*   **Response (`200 OK`):**
    ```json
    {
      "success": true,
      "message": "Draft auto-saved successfully",
      "updatedAt": "2026-10-07T14:32:05.123Z"
    }
    ```
*   **Note:** If the article is currently in `Pending` review, returns `409 Conflict` until review completes.

### `PATCH /api/articles/:id/status`
*   **Purpose:** Submit a draft to the editor.
*   **Payload:** `{ "status": "Pending" }`
*   **Response (`200 OK`):** `{ "success": true, "status": "Pending", "article": ... }`

### `GET /api/reporter/articles`
*   **Purpose:** Fetch the reporter's own articles and statuses for the Reporter Desk.
*   **Response (`200 OK`):** `{ "success": true, "articles": [...] }`

---

## Editor Routes

### `GET /api/admin/articles`
*   **Purpose:** Fetch all articles for the Editor Desk.
*   **Query Params:** `?status=Pending&page=1&limit=50`
*   **Response (`200 OK`):** `{ "success": true, "articles": [...] }`

### `GET /api/admin/articles/:id`
*   **Purpose:** Fetch single article with diff comparison between `publicVersion` and `draftVersion`.
*   **Response (`200 OK`):**
    ```json
    {
      "success": true,
      "article": { ... },
      "comparison": {
        "isPublished": true,
        "hasDraftChanges": true,
        "public": { "title": "Old Title", "content": "Old Content..." },
        "draft": { "title": "New Title", "content": "New Content..." },
        "editorNote": "..."
      }
    }
    ```

### `PATCH /api/admin/articles/:id/status`
*   **Purpose:** Approve or return an article.
*   **Payload for Approval:** `{ "status": "Published" }`
*   **Payload for Return:** `{ "status": "Returned", "editorNote": "נא לאמת מקורות" }`
*   **Response (`200 OK`):** `{ "success": true, "status": "Published", "article": ... }`

### `DELETE /api/admin/articles/:id`
*   **Purpose:** Delete an article and cascade delete its comments and stats.
*   **Response (`200 OK`):** `{ "success": true, "message": "Article and associated comments/stats deleted successfully." }`

### `GET /api/admin/analytics/:articleId`
*   **Purpose:** Fetch timeseries data and update points for the Chart.js Impact Analytics graph.
*   **Response (`200 OK`):**
    ```json
    {
      "success": true,
      "articleId": "6ac...",
      "title": "כותרת הכתבה",
      "viewData": [
        { "time": "2026-10-07T10:00:00.000Z", "views": 150 },
        { "time": "2026-10-07T11:00:00.000Z", "views": 320 }
      ],
      "updatePoints": [
        "2026-10-07T10:30:00.000Z"
      ],
      "totalViews": 470
    }
    ```
---

## Frontend expectations (Developer 2)

These are what the views and client scripts in `views/` and `public/js/` rely on. Please flag anything that doesn't fit the backend.

### Setup in `app.js`
*   `app.set('view engine', 'ejs')`, `express.static('public')`.
*   `app.use(require('./utils/i18n'))` **before** the routes. It reads the `lang` / `theme` cookies and provides `t`, `lang`, `dir`, `theme`, `formatDate`, `formatNumber`, `isoDate`, `categories` and `clientI18n` to every view.
*   Set `res.locals.user = { username, role }` from the session (or `null`) so the header shows the right links.
*   Category values stored in `Article.category` are the slugs in `utils/categories.js`: `news, politics, business, tech, sports, culture, transport`.

### `GET /` → `res.render('index', locals)`
*   `articles`: the first page (20) of **published** articles, in the same item shape as `GET /api/articles`.
*   `filters`: `{ q, category, viewed, sort }` from the query string, so the page also works without JavaScript.
*   `hasMore` (optional): defaults to `articles.length === 20`.
*   Should accept `?page=N` too (the no-JavaScript "load more" link uses it).

### `GET /articles/:id` → `res.render('article', locals)`
*   `article`: `{ _id, category, views, authorName, publicVersion: { title, summary, content, imageUrl, publishedAt } }`. Only `publicVersion` is shown. `content` is plain text; each line becomes a `<p>`.
*   `comments`: `[{ _id, authorName, content, createdAt }]`, newest first.
*   `canonical` (optional): absolute URL of the page.
*   Every request counts a view and adds the article id to the session's viewed list.

### `GET /api/articles`
*   Query: `page`, `limit` (20), `q` (title search), `category` (slug), `viewed` (`viewed` | `unviewed`, omitted = all), `sort` (`date` | `popular`).
*   Response: an array of `{ _id, title, summary, imageUrl, category, authorName, publishedAt, views, commentsCount, viewed }`. `{ articles: [...], hasMore }` is also accepted.
*   `viewed` (boolean) says whether this session opened the article. It drives the "Read" badge, so the badge and the `viewed` filter always agree. Send it on the SSR feed's articles too.
*   The `viewed` filter needs the server to remember, per session, which articles were opened.

### `POST /api/comments`
*   Payload: `{ articleId, content, authorName }`. `authorName` is optional; an empty one is shown as "Guest".
*   `201` returns the created comment `{ _id, authorName, content, createdAt }`.
*   `429` returns `{ error }` with a **`Retry-After`** header (in seconds). The UI shows a countdown from it and falls back to 60 seconds.
*   `400` returns `{ error }` for empty or invalid input.

### `PUT /api/articles/:id/auto-save`
*   Payload: any of `{ title, summary, content, category, imageUrl }` (whatever fields the editor form has).
*   `200` returns `{ updatedAt }`.
*   `imageUrl` may be saved as typed (it's a draft), but **submitting** (`PATCH .../status` → `Pending`) and publishing must reject an `imageUrl` that isn't empty, a full `http://` / `https://` link, or a path on this site starting with a single `/` (e.g. seeded `/images/...`): `400 { error }`. The editor page already blocks this, but the server must not trust the browser.
*   `401` means the session expired (auto-save stops and asks the reporter to log in). `403`/`404` mean the reporter isn't allowed (auto-save stops).
*   For the reporter editor page: render the form as `<form data-autosave data-article-id data-updated-at>` (`updatedAt` of the draft), so `main.js` attaches auto-save and can detect a newer local backup.

### `GET /api/weather?city=`
*   `city` is one of `tel-aviv`, `jerusalem`, `haifa`, `beer-sheva` (coordinates in `public/js/weather.js`). Anything else returns `400 { error }`.
*   Response: `{ city, temperature, humidity, wind, code, fetchedAt }`. `code` is the WMO weather code and `fetchedAt` is an ISO time.
*   **Cache on the server:** keep one reading per city in memory for 15 minutes and call Open-Meteo only when it is older. Thousands of readers then cost at most 4 Open-Meteo calls every 15 minutes. If Open-Meteo fails, return the last reading you have (with its old `fetchedAt`), or `502 { error }` if there is none.
*   Open-Meteo call (no API key): `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&wind_speed_unit=kmh&timezone=auto`, then map `current.temperature_2m` → `temperature`, `relative_humidity_2m` → `humidity`, `wind_speed_10m` → `wind`, `weather_code` → `code`.
*   Until this route exists, the widget calls Open-Meteo directly from the browser, so it works either way. It also caches each reading in `localStorage` for 15 minutes.

### `GET /api/articles/:id`
*   The published article as JSON: `{ _id, title, summary, content, imageUrl, category, authorName, publishedAt, views, commentsCount }` (from `publicVersion`). An unpublished or unknown id returns `404 { error }`.
*   The site's pages don't call it (article pages are rendered on the server for SEO). It completes the REST API.

### Errors under `/api`
*   Every `/api/*` response is JSON, errors included: `{ error: "message" }` with the right status. That covers unknown `/api` routes (`404`) and crashes (`500`). Mount these after the API routes and before the HTML 404 page:
    ```js
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
    app.use((err, req, res, next) => {
      if (!req.originalUrl.startsWith('/api')) return next(err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
    });
    ```
*   `public/js/main.js` reads `error` from these bodies to show the message. An HTML error page there shows only the generic status text.

---

## Frontend expectations: newsroom pages (Developer 2, deliverable 2)

### Setup in `app.js`
*   Also mount `app.use(require('./utils/view-helpers'))` after `utils/i18n`. It provides `articleView()`, `paragraphs()` and `STATUSES` to the views. `articleView()` accepts a Mongoose document or a plain object.
*   Unknown page routes: `res.status(404).render('error', { status: 404 })`. Forbidden: `render('error', { status: 403 })`. Under `/api`, answer with JSON instead (see "Errors under `/api`").
*   `Article` needs `summary` in both `draftVersion` and `publicVersion` (the PDF requires a summary on every card), plus timestamps (`updatedAt`).

### Pages (render calls)
| Route | View | Locals |
|---|---|---|
| `GET /login` | `login` | `error` (bool, after a failed attempt), `username`, `next` (optional) |
| `POST /login` | – | form fields `username`, `password`. Success: redirect to `/reporter` or `/editor`. Failure: re-render `login` with `error: true` (status 401) |
| `POST /logout` | – | destroy the session, redirect to `/` |
| `GET /reporter` | `reporter/dashboard` | `articles`: all of the reporter's Article documents |
| `GET /reporter/articles/:id/edit` | `reporter/edit` | `article` (must belong to the reporter) |
| `GET /editor` | `editor/dashboard` | `articles` (page 1), `counts: { all, Draft, Pending, Published, Returned }`, `filters: { status, q }` (status defaults to `Pending`), `hasMore` |
| `GET /editor/articles/:id` | `editor/review` | `article` |
| `GET /editor/articles/:id/edit` | `reporter/edit` | `article` (same editor view, opened by an editor) |
| `GET /editor/analytics` | `editor/analytics` | `selected`: the Article for `?article=<id>`, or null |

### Ajax endpoints
*   `POST /api/articles`: the reporter creates an empty Draft. Returns `201 { _id }`.
*   `PATCH /api/articles/:id/status` with `{ "status": "Pending" }`. Allowed from Draft, Returned, or Published with unsubmitted changes. Returns `409 { error }` otherwise.
*   `PUT /api/articles/:id/auto-save`: the same endpoint is used when an **editor** edits an article. Allow role Editor for any article.
*   `GET /api/admin/articles?status=&q=&page=&limit=`: items `{ _id, status, category, title, authorName, updatedAt, publishedAt, isLive }`. `isLive` means a public version exists. Also used by the analytics picker with `q=&limit=30` (no status); it keeps only items with `isLive`, so live articles with a Pending update can be found.
*   `PATCH /api/admin/articles/:id/status` with `{ "status": "Published" }` or `{ "status": "Returned", "editorNote": "..." }`. Publishing copies `draftVersion` into `publicVersion`, sets `publishedAt` and appends to `publishHistory`. Returns `409` if the article isn't Pending, `400` if the note is missing.
*   `DELETE /api/admin/articles/:id`: returns `204`.
*   `GET /api/admin/analytics/:articleId` returns **hourly** buckets with ISO timestamps (replaces the `"10:00"` example above, which has no date):
    ```json
    {
      "viewData": [{ "time": "2026-10-04T06:00:00.000Z", "views": 150 }],
      "updatePoints": ["2026-10-05T12:00:00.000Z"]
    }
    ```
    `updatePoints` should hold the times in `publishHistory`.

### Chart.js
*   `public/vendor/chart.umd.min.js` is Chart.js 4.4.1 (MIT, license next to it). The PDF explicitly allows Chart.js for the Impact Analytics graph. It's stored locally so the graph works without internet.
