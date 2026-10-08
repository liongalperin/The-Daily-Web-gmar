# The Daily Web (המהדורה הדיגיטלית) - News Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-brightgreen.svg)](https://mongoosejs.com/)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-success.svg)](#-automated-test-verification)

A modern, responsive, high-performance web application for managing, editing, and publishing news articles. Built specifically to fulfill Israeli university Web Development course requirements with strict adherence to **MVC Architecture**, semantic HTML5, pure CSS Flexbox (zero CSS Grid / zero Bootstrap / zero React), and Hebrew RTL support.

---

## 🔑 Demo Credentials Table

All pre-seeded staff accounts share the default password `password123`. These are demo accounts created by `npm run seed` on your local database only; they aren't credentials to any real system.

| Role | Username | Password | Desk URL | Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Editor (עורך ראשי)** | `editor` | `password123` | [`/editor/desk`](http://localhost:3000/editor/desk) | Review pending drafts, side-by-side diff inspection, publish/return with editorial feedback notes, Chart.js Impact Analytics with update markers. |
| **Reporter 1 (כתב טכנולוגיה)** | `reporter1` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Create new drafts, background auto-save, submit for review, view editor notes on returned articles. |
| **Reporter 2 (כתבת כלכלה)** | `reporter2` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for economic news. |
| **Reporter 3 (כתב פוליטי)** | `reporter3` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for political reporting. |
| **Reporter 4 (כתבת תרבות)** | `reporter4` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for culture & entertainment. |
| **Reporter 5 (כתב ספורט)** | `reporter5` | `password123` | [`/reporter/desk`](http://localhost:3000/reporter/desk) | Dedicated reporter workspace for sports coverage. |
| **Guest / Public (קורא אורח)** | *No login needed* | *N/A* | [`/`](http://localhost:3000/) | Infinite-scroll news feed (20/page), Hebrew live search, SSR SEO article pages, post comments (rate limited: 3 comments / min per IP/device). |

---

## 🏗️ Architecture & Strict Constraints

The system adheres strictly to the academic syllabus boundaries:
* **MVC Pattern:** Models encapsulate schemas & DB operations, Controllers handle HTTP logic, Views render semantic EJS templates.
* **Database (MongoDB + Mongoose):** 4 core models (`User`, `Article`, `Comment`, `ViewStats`), each supporting full CRUD operations.
* **Session Persistence:** Persistent login across server restarts using `express-session` with `connect-mongo`.
* **State Machine & Dual Versioning:**
  * Status lifecycle: `Draft` ➔ `Pending` ➔ `Published` ➔ `Returned`.
  * Dual versioning: When a reporter edits a published article, updates are stored in `draftVersion` while the public continues viewing `publicVersion` until an Editor explicitly approves the update.
  * Concurrency safety: Auto-save is locked (`409 Conflict`) while an article is undergoing `Pending` editorial review.
* **Rate Limiting & Spam Protection:** Sliding-window rate limiter enforcing max 3 comments/minute per IP/device with HTTP `429 Too Many Requests` and standard `Retry-After: 60` headers. Concurrency bursts are blocked via synchronous in-memory reservations.
* **Impact Analytics:** Hourly-bucketed view statistics with timestamps of editorial update approvals for Chart.js rendering.
* **Strict Frontend Constraints:**
  * Pure CSS Flexbox only (**NO CSS Grid**, **NO Bootstrap**, **NO Tailwind**, **NO React/Vue/Angular**).
  * Vanilla JavaScript Ajax (no jQuery, no Axios on frontend).
  * RTL Hebrew first (`dir="rtl"`, `lang="he"`).
  * Public article pages are Server-Side Rendered (SSR) with EJS for search engine indexing (SEO).

---

## 📂 Project Directory Structure

```text
The-Daily-Web-gmar/
├── app.js                          # Express application factory & middleware setup
├── server.js                       # HTTP server entrypoint
├── package.json                    # Dependencies and npm scripts
├── .env.example                    # Optional settings; copy to .env (never committed)
│
├── config/
│   ├── db.js                       # Resilient Mongoose connection & pool config
│   └── logger.js                   # Operational, error, and security audit logger
│
├── models/
│   ├── index.js                    # Model barrel export
│   ├── User.js                     # User model (Bcrypt hashing, RBAC, full CRUD)
│   ├── Article.js                  # Article model (Dual versioning, state machine, full CRUD)
│   ├── Comment.js                  # Comment model (Sliding-window rate check, full CRUD)
│   └── ViewStats.js                # ViewStats model (Bucketed time series, Chart.js formatter)
│
├── controllers/
│   ├── authController.js           # Login, logout, registration, session me
│   ├── articleController.js        # Feed, search, auto-save, status transitions
│   ├── commentController.js        # Dynamic comment creation & retrieval
│   ├── analyticsController.js      # Telemetry for Chart.js dashboard
│   ├── weatherController.js        # Weather endpoint (Open-Meteo with fallback)
│   └── viewController.js          # SSR HTML page controllers (Home, Article, Desks)
│
├── middleware/
│   ├── auth.js                     # requireAuth, requireRole, checkArticleOwnership
│   ├── rateLimiter.js              # Max 3/min per IP/device sliding-window limiter
│   └── errorHandler.js             # Centralized error handler & Mongoose formatter
│
├── routes/
│   ├── views.js                    # SSR page routes (/, /articles/:id, /login, /reporter/desk, /editor/desk)
│   └── api/
│       ├── index.js                # API router aggregator (/api)
│       ├── auth.js                 # /api/auth routes
│       ├── articles.js             # /api/articles & /api/admin/articles routes
│       ├── comments.js             # /api/comments routes
│       ├── analytics.js            # /api/admin/analytics routes
│       └── weather.js              # /api/weather routes
│
├── services/
│   └── weatherService.js           # 15-minute cached weather service
│
├── scripts/
│   └── seed.js                     # 523 articles, 6 staff users, 250 comments, 400 ViewStats
│
├── views/
│   ├── layout/
│   │   ├── header.ejs              # Shared Hebrew header & navigation
│   │   └── footer.ejs              # Shared footer
│   └── pages/
│       ├── home.ejs                # SSR homepage + infinite scroll feed & live search
│       ├── article.ejs             # SSR SEO-compliant article page + dynamic comments
│       ├── login.ejs               # Login form with tabbed demo account switcher
│       ├── reporter-desk.ejs       # Reporter workspace with auto-save & status submit
│       ├── editor-desk.ejs         # Editor dashboard with diff view, status controls & Chart.js
│       └── error.ejs               # Semantic error page (404 / 500)
│
├── public/
│   ├── css/
│   │   └── style.css               # Semantic Flexbox-only stylesheet (RTL, responsive)
│   └── js/                         # Static assets & scripts
│
├── tests/
│   ├── run-tests.js                # Unified test runner
│   ├── phase1-models.test.js       # Phase 1: Mongoose models & CRUD test suite
│   ├── phase2-auth-security.test.js# Phase 2: Auth, sessions, RBAC & rate limiter
│   ├── phase3-api-endpoints.test.js# Phase 3: REST API & State Machine test suite
│   └── phase4-seed-verification.test.js # Phase 4: High-volume seed & query performance
│
└── docs/
    ├── api-contract.md             # Developer 2 API integration specification
    ├── dev2-guide.md               # Developer 2 frontend implementation guide
    └── roles.md                    # Work division & academic compliance matrix
```

---

## 🚀 Quick Start Guide

### 1. Installation
Clone the repository and install all npm dependencies:
```bash
git clone <repository-url>
cd The-Daily-Web-gmar
npm install
```

### 2. Configuration (optional)
No configuration is needed to run the project locally, and no secrets are stored in the repository:
* **Session secret:** if `SESSION_SECRET` isn't set, the server generates a random one on first start and keeps it in `.session-secret` (ignored by Git), so logins still survive a restart. Production refuses to start without `SESSION_SECRET`.
* **Database:** uses MongoDB at `mongodb://localhost:27017/dailyweb`. If no MongoDB is running, the server starts an embedded in-memory database and fills it with the demo data automatically (its data and logins reset on every restart).
* **Weather:** uses Open-Meteo, which needs no API key.

To change a setting, copy the example file and edit it:
```bash
cp .env.example .env
```

### 3. Seed High-Volume Dataset (500+ Articles)
Populate your MongoDB database with the full dataset (523 articles across 4 statuses, 6 staff accounts, comments, and hourly analytics):
```bash
npm run seed
```

### 4. Start the Application
Run in production or development mode:
```bash
# Standard start:
npm start

# Development mode (with live watch):
npm run dev
```
Open your browser and navigate to: **[http://localhost:3000](http://localhost:3000)**.

---

## 🧪 Automated Test Verification

A comprehensive automated test suite covers all four backend layers using an isolated in-memory MongoDB server:

```bash
npm test
```

### Verified Test Suites:
1. **`phase1-models.test.js`**:
   * Bcrypt password hashing and `passwordHash` hidden projection security.
   * Full CRUD on `User`, `Article`, `Comment`, and `ViewStats`.
   * Dual versioning initial state (`draftVersion` vs `publicVersion`).
   * Hourly bucket atomic upserts and view synchronization.
   * Cascade cleanup on article deletion.
2. **`phase2-auth-security.test.js`**:
   * Privilege escalation prevention on public registration (403).
   * Session regeneration upon login to prevent session fixation.
   * **Persistence across server restarts** (MongoDB session store survival).
   * Role-Based Access Control (`requireAuth`, `requireRole('Editor')`).
   * Ownership enforcement preventing foreign draft modification (403).
   * Concurrency burst rate limiting (3 allowed, remaining 2 instantly throttled with HTTP 429).
3. **`phase3-api-endpoints.test.js`**:
   * Infinite-scroll pagination (`page`, `limit=20`, `hasMore`).
   * Hebrew full-text search with regex fallback.
   * Background silent auto-save (`PUT /api/articles/:id/auto-save`).
   * State machine transitions (`Draft` ➔ `Pending` ➔ `Returned` / `Published`).
   * Concurrency lock (409 Conflict during editorial review).
   * Comment rate limit headers (`Retry-After: 60`).
   * Weather widget endpoint with in-memory 15-minute caching.
4. **`phase4-seed-verification.test.js`**:
   * High-volume generation of 523 articles (398 Published, 50 Pending, 45 Draft, 30 Returned).
   * Query latency benchmarks at scale (<10ms for feed pagination, <30ms for Hebrew search).
   * Flagship multi-update articles with 73 hourly buckets for Chart.js impact curves.

---

## 📊 Evaluation Walkthrough for Course Graders

### 1. Public Portal & SSR SEO
1. Open [`http://localhost:3000`](http://localhost:3000).
2. Inspect page source: all initial articles are Server-Side Rendered in Hebrew (`dir="rtl"`).
3. Scroll down or select a category tag to trigger infinite scroll via Ajax.
4. Search for keywords like **"מחשב"** or **"רכבת"** to test live search.
5. Click on an article card to view its SSR page ([`http://localhost:3000/articles/<id>`](http://localhost:3000/articles/<id>)).
6. Add a comment. Submit 4 comments rapidly from the same browser to verify the HTTP 429 spam block banner.

### 2. Reporter Workspace & Silent Auto-Save
1. Log in at [`http://localhost:3000/login`](http://localhost:3000/login) using `reporter1` / `password123`.
2. You will be redirected to [`/reporter/desk`](http://localhost:3000/reporter/desk).
3. Click **"צור כתבה חדשה"** (Create New Article) or edit an existing draft.
4. Type in the title and content fields — notice the indicator **"נשמר אוטומטית ברקע"** updating silently via Ajax without page refreshes.
5. Click **"הגש לסקירת עורך"** (Submit for Review) to transition status to `Pending`.

### 3. Editor Dashboard & Impact Analytics
1. Log out and log in as `editor` / `password123`.
2. Navigate to [`http://localhost:3000/editor/desk`](http://localhost:3000/editor/desk).
3. Under **"כתבות הממתינות לאישור (Pending Review)"**, inspect the pre-seeded flagship articles with side-by-side diffs showing the public version vs. reporter draft.
4. Click **"החזר לתיקונים"** (Return for Revisions) to provide feedback, or **"אשר ופרסם"** (Approve & Publish).
5. Open an article's Impact Analytics to inspect the dynamic **Chart.js** curve showing hourly views and vertical update markers indicating when editorial changes were published.

---

## 📜 Academic Integrity & Collaboration Notice
* **Developer 1 (Data Layer, Backend & Architecture):** Models, Auth, Sessions, State Machine, REST Endpoints, Seed Data, Test Suites, Base SSR views & Developer 2 integration layer.
* **Developer 2 (Presentation Layer, UI/UX & Interactions):** Semantic CSS styling enhancements, infinite scroll intersection observer, live search autocomplete, Chart.js visual polish, dynamic comment DOM append. Detailed instructions can be found in [`docs/dev2-guide.md`](file:///d:/learn/The-Daily-Web-gmar/docs/dev2-guide.md).