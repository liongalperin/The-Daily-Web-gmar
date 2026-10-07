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