# 👨‍💻 Work Division & Academic Compliance: The Daily Web

This document outlines the strict division of responsibilities between **Developer 1** and **Developer 2** for the final project in Web Development. This split ensures total modularity, prevents Git conflicts, and guarantees 100% compliance with the academic syllabus requirements.

---

## 📋 Credentials Table for Defense & Testing

| Role | Username | Password | Desk URL | System Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Editor (עורך ראשי)** | `editor` | `password123` | [`/editor/desk`](http://localhost:3000/editor/desk) | Review pending articles, inspect side-by-side diffs, approve & publish, return with editorial notes, inspect Chart.js Impact Analytics. |
| **Reporter 1 (כתב טכנולוגיה)** | `reporter1` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Create drafts, background auto-save, submit to editor, view feedback notes. |
| **Reporter 2 (כתבת כלכלה)** | `reporter2` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for economics. |
| **Reporter 3 (כתב פוליטי)** | `reporter3` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for politics. |
| **Reporter 4 (כתבת תרבות)** | `reporter4` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for culture. |
| **Reporter 5 (כתב ספורט)** | `reporter5` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for sports. |
| **Guest / Public (קורא אורח)** | *No login needed* | *N/A* | [`/`](http://localhost:3000/) | Read articles, infinite scroll, Hebrew live search, post comments (rate limited: 3 comments / min per IP/device). |

---

## 🛠️ Developer 1: Backend, Data & Architecture (Data Layer)
**Scope:** Node.js, Express, MongoDB, Mongoose, Session Security, RESTful APIs, Base SSR Views & Integration Contracts.

### Completed & Verified Deliverables:
1. **Core Mongoose Models & CRUD (`models/`):**
   * `User.js`: Bcrypt hashing (salt rounds 10), username lowercase transformation, hidden password hash projection (`select: false`), CRUD methods (`createUser`, `getUserById`, `getUserByUsername`, `searchUsers`, `updateUserById`, `deleteUserById`).
   * `Article.js`: Dual versioning (`publicVersion` vs `draftVersion`), publish history tracking, Hebrew text search index, compound indexes, workflow state methods (`publishArticle`, `returnArticle`, `submitForReview`).
   * `Comment.js`: Sliding-window rate limit checker, compound indexes on `(articleId, createdAt)` and `(deviceId, createdAt)`, CRUD methods.
   * `ViewStats.js`: Hourly-bucketed time-series records, atomic `$inc` updates protected against race conditions, synchronized `Article.totalViews`, telemetry formatter for Chart.js.
2. **Authentication, RBAC & Security (`middleware/`, `controllers/authController.js`):**
   * Role-based access control middleware (`requireAuth`, `requireRole('Reporter', 'Editor')`, `checkArticleOwnership`).
   * Session fixation prevention via `req.session.regenerate`.
   * **Persistence across server restarts** via `connect-mongo` session store.
   * Privilege escalation guards preventing unauthenticated or non-admin clients from creating Editor accounts.
   * Comment spam protection enforcing max 3 comments/minute per IP/device with HTTP `429 Too Many Requests` and `Retry-After: 60` headers. In-memory synchronous reservations prevent concurrent burst bypasses.
3. **Core REST APIs & State Machine (`controllers/`, `routes/api/`):**
   * Public infinite-scroll feed (`GET /api/articles?page=1&limit=20&hasMore=true`).
   * Hebrew full-text search with regex fallback (`GET /api/articles?q=...`).
   * Silent background auto-save (`PUT /api/articles/:id/auto-save`) with a `409 Conflict` concurrency lock during `Pending` review.
   * Article state transitions (`Draft` ➔ `Pending` ➔ `Published` / `Returned`).
   * Chart.js telemetry endpoint (`GET /api/admin/analytics/:articleId`).
   * Weather endpoint (`GET /api/weather?city=Tel+Aviv`) with 15-minute in-memory caching.
4. **High-Volume Seed Dataset (`scripts/seed.js`):**
   * Generates 523 articles across all 4 categories and 4 statuses.
   * 6 pre-configured staff accounts (1 Editor, 5 Reporters).
   * 250 realistic comments and 400 ViewStats records.
   * Pre-configured flagship multi-update articles with 73 hourly view buckets and 3 update markers for immediate Chart.js graph demonstration.
5. **Base SSR Views & Integration Layer (`controllers/viewController.js`, `views/`):**
   * Fully functional SSR HTML pages for Homepage, Article, Login, Reporter Desk, and Editor Desk.
   * Pure CSS Flexbox responsive styling (`public/css/style.css`).
   * Working Vanilla JS client scripts demonstrating all Ajax interactions.
   * Comprehensive integration documentation in `docs/api-contract.md` and `docs/dev2-guide.md`.

---

## 🎨 Developer 2: Frontend, Views & UI/UX (Presentation Layer)
**Scope:** Semantic HTML5, Pure CSS Flexbox, Vanilla JavaScript, EJS Template Polishing, and Chart.js UI.

### Key Responsibilities & Integration Points:
1. **Strict Semantic HTML5 & Pure CSS Flexbox (`views/`, `public/css/style.css`):**
   * Maintain pure Flexbox layout (**NO CSS Grid**, **NO Bootstrap**, **NO React**).
   * Preserve RTL Hebrew styling (`dir="rtl"`, `lang="he"`).
   * Enhance responsive design for mobile, tablet, and desktop viewports.
2. **Client-Side Infinite Scroll & Live Search (`views/pages/home.ejs`):**
   * Connect `IntersectionObserver` or scroll event listener to `GET /api/articles?page=N&limit=20`.
   * Implement debounced live search calling `GET /api/articles?q=...` with instant DOM card rendering.
3. **Dynamic Comment Submission & Spam Notification (`views/pages/article.ejs`):**
   * Submit comments via Vanilla JS `fetch('/api/comments', { method: 'POST' })`.
   * Dynamically prepend new comment cards to the DOM without reloading the page.
   * Gracefully display the `429 Too Many Requests` warning alert when the guest exceeds 3 comments/minute.
4. **Reporter Workspace & Background Auto-Save (`views/pages/reporter-desk.ejs`):**
   * Bind `input` events on article title and content to debounced `PUT /api/articles/:id/auto-save`.
   * Display silent saving status indicators ("שומר...", "נשמר בהצלחה") without full page submits.
   * Provide "הגש לסקירת עורך" button triggering `PATCH /api/articles/:id/status`.
5. **Editor Dashboard & Chart.js Impact Analytics (`views/pages/editor-desk.ejs`):**
   * Render side-by-side comparison cards for articles in `Pending` review.
   * Implement "אשר ופרסם" and "החזר לתיקונים" action modals.
   * Fetch `GET /api/admin/analytics/:articleId` and render high-resolution line charts using **Chart.js**, highlighting vertical update markers.
6. **Weather Widget (`views/layout/header.ejs`):**
   * Fetch `GET /api/weather` and render current temperature and icon in the site header.

---

## 📖 Reference Documents
* [API Contract Specification](file:///d:/learn/The-Daily-Web-gmar/docs/api-contract.md)
* [Developer 2 Integration Guide](file:///d:/learn/The-Daily-Web-gmar/docs/dev2-guide.md)
* [Project README](file:///d:/learn/The-Daily-Web-gmar/README.md)