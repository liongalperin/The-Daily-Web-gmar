# 🔌 REST API Contract

This contract defines the async Ajax routes required to update the UI without a full page refresh[cite: 8].

## Public Routes

### `GET /api/articles`
*   **Purpose:** Fetch articles for the infinite scroll feed[cite: 6].
*   **Query Params:** `?page=1&limit=20&category=sports&sort=date`[cite: 6]
*   **Response:** Array of up to 20 Article objects.

### `POST /api/comments`
*   **Purpose:** Post a new comment[cite: 6].
*   **Payload:** `{ "articleId": "...", "content": "..." }`
*   **Constraints:** Will return `429 Too Many Requests` if the user exceeds 3 comments per minute[cite: 6].
*   **Response:** The newly created Comment object (to be dynamically injected into the DOM).

## Reporter Routes

### `PUT /api/articles/:id/auto-save`
*   **Purpose:** Continuously save the reporter's draft while they type[cite: 7].
*   **Payload:** `{ "title": "...", "content": "..." }`
*   **Response:** `200 OK` (Silent background save).

### `PATCH /api/articles/:id/status`
*   **Purpose:** Submit a draft to the editor[cite: 7].
*   **Payload:** `{ "status": "Pending" }`

## Editor Routes

### `PATCH /api/admin/articles/:id/status`
*   **Purpose:** Approve or return an article[cite: 8].
*   **Payload:** `{ "status": "Published" }` OR `{ "status": "Returned", "editorNote": "Fix sources" }`

### `GET /api/admin/analytics/:articleId`
*   **Purpose:** Fetch timeseries data for the Impact Analytics graph[cite: 8].
*   **Response:** 
    ```json
    {
      "viewData": [{ "time": "10:00", "views": 150 }, { "time": "11:00", "views": 300 }],
      "updatePoints": ["10:30"] 
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
*   Response: an array of `{ _id, title, summary, imageUrl, category, authorName, publishedAt, views, commentsCount }`. `{ articles: [...], hasMore }` is also accepted.
*   The `viewed` filter needs the server to remember, per session, which articles were opened.

### `POST /api/comments`
*   Payload: `{ articleId, content, authorName }`. `authorName` is optional; an empty one is shown as "Guest".
*   `201` returns the created comment `{ _id, authorName, content, createdAt }`.
*   `429` returns `{ error }` with a **`Retry-After`** header (in seconds). The UI shows a countdown from it and falls back to 60 seconds.
*   `400` returns `{ error }` for empty or invalid input.

### `PUT /api/articles/:id/auto-save`
*   Payload: any of `{ title, summary, content, category, imageUrl }` (whatever fields the editor form has).
*   `200` returns `{ updatedAt }`.
*   `401` means the session expired (auto-save stops and asks the reporter to log in). `403`/`404` mean the reporter isn't allowed (auto-save stops).
*   For the reporter editor page: render the form as `<form data-autosave data-article-id data-updated-at>` (`updatedAt` of the draft), so `main.js` attaches auto-save and can detect a newer local backup.

### Weather
*   No backend work needed. The widget calls Open-Meteo directly from the browser (no API key) and caches each reading in `localStorage` for 15 minutes.
