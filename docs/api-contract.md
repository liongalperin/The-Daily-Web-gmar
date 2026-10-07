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