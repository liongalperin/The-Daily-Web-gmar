# 🤝 Developer 2 Handoff & Frontend Integration Guide
**Project:** The Daily Web (News Management System)  
**Author:** Developer 1 (Backend, Architecture & Database)  
**Recipient:** Developer 2 (Frontend, UI/UX & Client Interactions)  

---

## 📌 Welcome Partner!
Everything on the backend, data architecture, security layer, and REST APIs is **100% built, tested, and ready for you**. All five test suites pass with zero errors, and a high-volume database seed script generates 525 articles, 6 staff accounts, and realistic telemetry.

This document contains everything you need to build, polish, and present the user interface with zero blockers.

---

## 🔑 Demo & Evaluation Credentials
Use these accounts to test and demonstrate the system during the defense:

| Role | Username | Password | Full Name / Beat | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Chief Editor** | `editor` | `password123` | שרה שפירא (עורכת ראשית) | View all articles, approve/publish, return for revisions with notes, delete articles, view Chart.js Impact Analytics. |
| **Reporter 1** | `reporter1` | `password123` | איתי לוי (טכנולוגיה ומדע) | Create drafts, auto-save while typing, submit drafts to Pending, revise returned articles. |
| **Reporter 2** | `reporter2` | `password123` | נועה כרמי (פוליטיקה וחדשות) | Same reporter permissions (isolated to own articles). |
| **Reporter 3** | `reporter3` | `password123` | דני רופ (תחבורה וסביבה) | Same reporter permissions. |
| **Reporter 4** | `reporter4` | `password123` | מיכל אברהם (כלכלה ועסקים) | Same reporter permissions. |
| **Reporter 5** | `reporter5` | `password123` | עומר שדה (ספורט ותרבות) | Same reporter permissions. |

---

## 🏛️ Academic Constraints Checklist for Dev 2
1. **Semantic HTML5:** `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`.
2. **Flexbox ONLY:** All layout must be implemented using CSS Flexbox (`display: flex`).  
   ⛔ **NO CSS Grid (`display: grid`)**, **NO Bootstrap**, **NO Tailwind**, **NO React / Vue / Angular**.
3. **Vanilla JavaScript:** All dynamic client operations must use pure Vanilla JavaScript with `fetch()`, `document.querySelector`, and `IntersectionObserver`.
4. **RTL & Hebrew:** The application is in Hebrew with `<html lang="he" dir="rtl">`.
5. **SEO Compliance:** Article pages (`/articles/:id`) are Server-Side Rendered (SSR) so the full article content is already in the initial HTML returned by Express.

---

## 🔌 API Quick Reference for Client Operations

### 1. Infinite Scroll & Live Search
* **Endpoint:** `GET /api/articles`
* **Query Parameters:**
  * `page`: Number (default: `1`)
  * `limit`: Number (default: `20`, max: `100`)
  * `category`: String (`news`, `tech`, `business`, `politics`, `sports`, `culture`, `transport`, `all`, `הכל`)
  * `sort`: `'date'` (default) or `'popularity'`
  * `q`: String (Hebrew search term, safely escaped by backend)
* **Response:**
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
        "summary": "תקציר הכתבה...",
        "snippet": "תקציר הכתבה...",
        "imageUrl": "https://...",
        "category": "tech",
        "publishedAt": "2026-10-07T12:00:00.000Z",
        "author": { "fullName": "איתי לוי", "username": "reporter1" },
        "views": 250,
        "totalViews": 250
      }
    ]
  }
  ```
* **Frontend Implementation Tip:**
  Use an `IntersectionObserver` on `#scroll-sentinel`. When triggered, fetch `page = currentPage + 1`. If `data.hasMore === false`, stop observing and show an end-of-feed message.

---

### 2. Comments with Rate Limiting (Spam Protection)
* **Endpoint:** `POST /api/comments`
* **Payload:**
  ```json
  {
    "articleId": "6ac...",
    "content": "תוכן התגובה",
    "authorName": "ישראל ישראלי",
    "deviceId": "dev_unique_client_id"
  }
  ```
* **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Comment posted successfully",
    "comment": {
      "_id": "6ac...",
      "articleId": "6ac...",
      "authorName": "ישראל ישראלי",
      "content": "תוכן התגובה",
      "createdAt": "2026-10-07T14:30:00.000Z"
    }
  }
  ```
* **Rate Limit Exceeded (`429 Too Many Requests`):**
  Triggered if a user posts more than 3 comments in a 60-second sliding window from the same device or IP.
  ```json
  {
    "success": false,
    "error": "חריגה ממגבלת התגובות: ניתן לפרסם לכל היותר 3 תגובות בדקה ממכשיר זה.",
    "retryAfter": 58
  }
  ```
* **Frontend Implementation Tip:**
  On HTTP 429, read `data.retryAfter` (or the HTTP header `Retry-After`) and start a countdown timer disabling the submit button.

---

### 3. Reporter Silent Background Auto-Save
* **Endpoint:** `PUT /api/articles/:id/auto-save`
* **Payload:**
  ```json
  {
    "title": "כותרת מעודכנת",
    "content": "תוכן חדש ומעודכן...",
    "summary": "תקציר חדש...",
    "category": "transport",
    "imageUrl": "/images/news.jpg"
  }
  ```
* **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Draft auto-saved successfully",
    "updatedAt": "2026-10-07T15:20:11.450Z"
  }
  ```
* **Lock Response (`409 Conflict`):**
  If the article was submitted to the editor and is in `Pending` review, auto-save will return `409 Conflict`: `"Article is currently pending editorial review and cannot be modified."`
* **Frontend Implementation Tip:**
  Debounce input events on editor fields by 1500ms. On success, update a status badge: `"נשמר לאחרונה: HH:MM:ss"`.

---

### 4. Reporter Submit for Review
* **Endpoint:** `PATCH /api/articles/:id/status`
* **Payload:** `{ "status": "Pending" }`
* **Response (`200 OK`):** `{ "success": true, "status": "Pending", "article": ... }`

---

### 5. Editor Inspection & Side-by-Side Diff
* **Endpoint:** `GET /api/admin/articles/:id`
* **Response:**
  ```json
  {
    "success": true,
    "article": { ... },
    "comparison": {
      "isPublished": true,
      "hasDraftChanges": true,
      "public": {
        "title": "כותרת מקורית שפורסמה",
        "summary": "תקציר מקורי",
        "content": "<p>תוכן מקורי...</p>"
      },
      "draft": {
        "title": "כותרת חדשה עם תוספות",
        "summary": "תקציר חדש",
        "content": "<p>תוכן חדש עם מידע עדכני...</p>"
      },
      "editorNote": "הערות קודמות"
    }
  }
  ```
* **Editorial Action Endpoints:**
  * **Approve & Publish:** `PATCH /api/admin/articles/:id/status` with `{ "status": "Published" }`
  * **Return for Revisions:** `PATCH /api/admin/articles/:id/status` with `{ "status": "Returned", "editorNote": "נא לתקן את המקורות" }`
  * **Delete Article:** `DELETE /api/admin/articles/:id`

---

### 6. Impact Analytics Graph (Chart.js)
* **Endpoint:** `GET /api/admin/analytics/:articleId`
* **Response:**
  ```json
  {
    "success": true,
    "articleId": "6ac...",
    "title": "פריצת דרך היסטורית: פותח מחשב קוונטי ישראלי ראשון",
    "totalViews": 4520,
    "viewData": [
      { "time": "2026-10-04T18:00:00.000Z", "views": 25 },
      { "time": "2026-10-05T18:00:00.000Z", "views": 240 },
      { "time": "2026-10-07T06:00:00.000Z", "views": 480 }
    ],
    "updatePoints": [
      "2026-10-04T18:00:00.000Z",
      "2026-10-05T18:00:00.000Z",
      "2026-10-07T06:00:00.000Z"
    ]
  }
  ```
* **Frontend Implementation Tip:**
  Map `viewData` to the line chart dataset. Highlight indices matching `updatePoints` using red point markers (`#e53e3e`) with custom tooltips indicating editorial update publication timestamps.

---

### 7. Sidebar Weather Widget
* **Endpoint:** `GET /api/weather?city=Tel+Aviv`
* **Cache:** Cached for 15 minutes on the server (handles thousands of concurrent users with zero external rate limit issues).
* **Response:**
  ```json
  {
    "success": true,
    "weather": {
      "city": "Tel Aviv",
      "temperature": 25,
      "condition": "מעונן חלקית",
      "icon": "🌤️",
      "updatedAt": "2026-10-07T15:30:00.000Z",
      "cached": true
    }
  }
  ```

---

## 🚀 How to Run and Test
```bash
# 1. Install dependencies
npm install

# 2. Seed database with 525 demo articles and users
npm run seed

# 3. Run all test suites
npm test

# 4. Start the server
npm start
# -> Access at http://localhost:3000
```
