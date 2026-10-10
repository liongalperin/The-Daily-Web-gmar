# The Daily Web (המהדורה הדיגיטלית) - News Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-brightgreen.svg)](https://mongoosejs.com/)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-success.svg)](#-automated-tests)

A responsive web application for writing, editing, approving and publishing news articles. Built for the Web Application Development course final project with **MVC architecture**, Node.js + Express, MongoDB + Mongoose, EJS server-side rendering, vanilla JavaScript Ajax, semantic HTML5 and Flexbox-only CSS. The interface is Hebrew (RTL) by default, with an English (LTR) toggle in the header.

---

## 🔑 Demo Accounts

`npm run seed` creates these accounts in your local database. All of them use the password `password123`. They are demo accounts only and aren't credentials to any real system.

| Role | Username | Password | After login | What they can do |
| :--- | :--- | :--- | :--- | :--- |
| **Editor (עורך)** | `editor` | `password123` | [`/editor`](http://localhost:3000/editor) | See and filter all articles, review pending articles with a side-by-side diff, edit them, approve and publish, return with a note, delete, Impact Analytics chart. |
| **Reporter (כתב)** | `reporter1` … `reporter5` | `password123` | [`/reporter`](http://localhost:3000/reporter) | Create articles, auto-saving editor, submit for approval, see the editor's note on returned articles, resubmit, edit published articles. |
| **Guest (אורח)** | *no login* | – | [`/`](http://localhost:3000/) | News feed with infinite scroll, search, filters and sorting, full article pages, comments (max 3 per minute per device). |

Editor accounts aren't created through the UI. The seeded `editor` account covers all Editor features. If another Editor is needed, a logged-in Editor can call `POST /api/auth/register` with `"role": "Editor"`.

---

## 🚀 Installation and Running

### Requirements
* **Node.js 18+**
* **MongoDB Community Server** running locally on port `27017`. See [Why MongoDB must be running](#why-mongodb-must-be-running).

### 1. Install MongoDB and start it
**macOS (Homebrew):**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Windows:** install [MongoDB Community Server](https://www.mongodb.com/try/download/community) with "Install MongoD as a Service" checked. It then runs in the background on startup. To start it manually: `net start MongoDB`.

**Linux:** follow the [MongoDB install guide](https://www.mongodb.com/docs/manual/administration/install-on-linux/), then `sudo systemctl start mongod`.

### 2. Install dependencies
```bash
git clone <repository-url>
cd The-Daily-Web-gmar
npm install
```

### 3. Load the demo data
```bash
npm run seed
```
This fills the `dailyweb` database with 523 articles in all four statuses and in every section, 6 staff accounts, comments, articles with several updates after publishing, and hourly view data for the analytics chart.

You only need to run this once, because the data stays in MongoDB. Running it again **deletes** all users, articles, comments and view data in `dailyweb` and recreates the demo set.

### 4. Start the server
```bash
npm start        # or: npm run dev  (restarts on file changes)
```
Open **[http://localhost:3000](http://localhost:3000)**.

### Configuration (optional)
No configuration is needed. To change a setting, copy `.env.example` to `.env` and edit it. `.env` is ignored by Git, and no secrets are stored in the repository.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port. |
| `MONGODB_URI` | `mongodb://localhost:27017/dailyweb` | Database. Can point to MongoDB Atlas instead (`mongodb+srv://...`). |
| `SESSION_SECRET` | *(generated)* | Signs the session cookie. If empty, a random secret is generated on first start and saved to `.session-secret` (ignored by Git), so logins still survive restarts. Required when `NODE_ENV=production`. |
| `ADMIN_SETUP_KEY` | *(off)* | Optional. Lets `POST /api/auth/register` create an Editor without being logged in, by sending the same value in an `X-Admin-Key` header. Choose any value yourself and restart the server after setting it. |

Weather uses [Open-Meteo](https://open-meteo.com/), which needs no API key or credit card.

### Why MongoDB must be running
Sessions are stored in MongoDB (`connect-mongo`), so **a logged-in user stays logged in after the server restarts**. That only works with a real MongoDB.

If no MongoDB is reachable at `localhost`, the server still starts, using a temporary in-memory database that it fills with the demo data automatically. That's convenient for a quick look, but **all data and logins are lost on every restart**. Check that MongoDB is running before demonstrating restart persistence or auto-save across sessions. The server log says `MongoDB connected successfully to localhost/dailyweb` when it's using the real database, and `Embedded MongoDB active` when it's using the temporary one.

---

## ✨ Main Features

### Public site (guests)
* **News feed** (`/`): published articles only. The first page is server-rendered, and the next 20 load automatically as you near the bottom (infinite scroll).
* **Search, filters and sorting without page reloads:** search headlines, summaries and article text, filter by section and by read / unread (articles you've opened in this session), sort by newest or most popular.
* **Article cards:** headline, image, summary, section, reporter and publish date.
* **Article page** (`/articles/:id`): fully server-rendered with EJS, so the complete text is in the initial HTML for search engines. Every visit is counted in the view statistics.
* **Comments:** a new comment appears in the list immediately via Ajax. The server allows at most **3 comments per minute per device**. A 4th returns HTTP `429` with `Retry-After`, and the page shows a message with a countdown.
* **Weather widget** in the sidebar (Open-Meteo, cached on the server for 15 minutes so thousands of readers share one upstream request; shows the last good data if a refresh fails).
* Hebrew / English toggle and day / night theme.

### Reporter area (`/reporter`)
* List of the reporter's own articles with their status: **בהכנה (Draft)**, **ממתינה לאישור (Pending)**, **פורסמה (Published)**, **הוחזרה לתיקונים (Returned)**.
* Create a new article, edit drafts and returned articles, submit for approval, see the editor's note, resubmit.
* **Auto-save:** changes are saved to the server while typing (`PUT /api/articles/:id/auto-save`), with no Save button needed. Closing the browser, refreshing or opening the article on another computer continues from the latest version. A local backup restores changes if the connection dropped before they reached the server.
* **Editing a published article:** changes go into a separate draft version. Readers keep seeing the approved version until an editor approves the update.

### Editor area (`/editor`)
* All articles in the system, filterable by status and searchable by headline.
* **Review page** for pending articles: shows the currently published version next to the new one with highlighted changes. The editor can approve and publish, return with a required note, edit the article directly, or delete it.
* **Impact Analytics** (`/editor/analytics`): pick a published article to see a Chart.js line chart of views per hour, with vertical markers at each moment an editor published an update, and a before / after comparison for every update.

### State machine
`Draft → Pending` (reporter, own article) · `Pending → Published` or `Pending → Returned` with a note (editor) · `Returned → Pending` (reporter). Editing a published article and submitting it is `Published → Pending`, while readers keep seeing the approved version. Any other transition is rejected by the server. While an article is Pending, the reporter can't edit it (`409 Conflict`).

### Security
* Passwords are hashed with bcrypt and never returned by the API.
* Roles come from the server-side session, never from data the browser can change. Every permission is checked on the server (`middleware/auth.js`): guests reach only public pages, reporters only their own articles, and only editors can publish, return or delete.
* Sessions are stored in MongoDB and survive server restarts. The session ID is regenerated on login.

### Scale, errors and logging
* Indexes for the feed, section filter and popularity sort, so the feed stays fast with thousands of articles (benchmarked in the Phase 4 tests).
* View statistics are stored in **hourly buckets** per article and incremented atomically, instead of one document per view. This keeps writes cheap under heavy traffic and makes the chart query small.
* Invalid input and unauthorized requests return clear `400` / `401` / `403` / `404` / `409` responses without crashing the server. Errors are handled centrally in `middleware/errorHandler.js`.
* Logs are written to `logs/app.log`, `logs/error.log` and `logs/audit.log` (logins, failed logins, status changes, blocked actions).

---

## 📂 Project Structure

```text
The-Daily-Web-gmar/
├── server.js                 # Entry point: connects to MongoDB, starts the HTTP server
├── app.js                    # Express app: middleware, sessions, routes, error handling
├── package.json
├── .env.example              # Optional settings (copy to .env)
│
├── config/
│   ├── db.js                 # Mongoose connection (+ in-memory fallback for quick local runs)
│   ├── logger.js             # App, error and audit logs in logs/
│   └── secrets.js            # Session secret (from .env, or generated into .session-secret)
│
├── models/                   # M – Mongoose schemas and data operations (full CRUD each)
│   ├── index.js
│   ├── User.js               # Staff users, bcrypt hashing, roles
│   ├── Article.js            # Draft/public versions, status state machine, feed queries
│   ├── Comment.js            # Comments and per-device rate checks
│   └── ViewStats.js          # Hourly view buckets and Impact Analytics data
│
├── controllers/              # C – request handling
│   ├── viewController.js     # Server-rendered pages (feed, article, login, reporter and editor areas)
│   ├── authController.js     # Login, logout, current user, register
│   ├── articleController.js  # Feed, search, create, auto-save, status changes, delete
│   ├── commentController.js  # Comments
│   ├── analyticsController.js# Chart data
│   └── weatherController.js  # Weather endpoint
│
├── routes/
│   ├── views.js              # HTML pages: /, /articles/:id, /login, /reporter/*, /editor/*
│   ├── auth.js               # /api/auth (login, logout, me, register)
│   └── api/
│       ├── index.js          # /api router; /api/reporter/articles, /api/admin/articles
│       ├── articles.js       # /api/articles
│       ├── comments.js       # /api/comments
│       ├── analytics.js      # /api/admin/analytics/:articleId
│       └── weather.js        # /api/weather
│
├── middleware/
│   ├── auth.js               # requireAuth, requireRole, article ownership checks
│   ├── rateLimiter.js        # 3 comments per minute per device
│   └── errorHandler.js       # Central error handler
│
├── services/
│   └── weatherService.js     # Open-Meteo client with 15-minute cache
│
├── utils/
│   ├── i18n.js               # Hebrew/English strings, RTL/LTR, date and number formatting
│   ├── categories.js         # Article sections
│   └── view-helpers.js       # Helpers shared by EJS templates
│
├── locales/                  # he.json, en.json
│
├── views/                    # V – EJS templates
│   ├── index.ejs             # Home feed
│   ├── article.ejs           # Article page
│   ├── login.ejs
│   ├── error.ejs
│   ├── reporter/             # dashboard.ejs (my articles), edit.ejs (auto-saving editor)
│   ├── editor/               # dashboard.ejs (all articles), review.ejs, analytics.ejs
│   ├── partials/             # head, header, footer, sidebar, article card, status badge, icons
│   ├── pages/                # Earlier desk pages, still served at /reporter/desk and /editor/desk
│   └── layout/               # Header/footer used by views/pages/
│
├── public/
│   ├── css/style.css         # Flexbox-only, responsive, RTL/LTR
│   ├── js/                   # main.js (feed, search, filters), article.js (comments),
│   │                         # reporter.js (auto-save), editor-desk.js, analytics.js, weather.js
│   ├── vendor/               # Chart.js
│   └── images/
│
├── scripts/
│   └── seed.js               # Demo data (npm run seed)
│
├── tests/                    # npm test – runs on an in-memory MongoDB
│
└── docs/                     # API contract, data schema, roles and work split
```

---

## 🧪 Automated Tests

```bash
npm test
```
The tests start their own in-memory MongoDB, so they don't touch your `dailyweb` database and don't need MongoDB running.

1. **`phase1-models.test.js`**: password hashing, full CRUD on all four models, draft/public versions, atomic view buckets, cleanup when an article is deleted.
2. **`phase2-auth-security.test.js`**: blocked privilege escalation on registration, session regeneration on login, sessions surviving a server restart, role and ownership checks, comment rate limit under concurrent requests.
3. **`phase3-api-endpoints.test.js`**: feed pagination, Hebrew search, auto-save, state machine transitions, `409` lock while pending, `Retry-After` header, weather caching.
4. **`phase4-seed-verification.test.js`**: full demo data set and query speed with 500+ articles.
5. **`phase5-views-integration.test.js`**: server-rendered pages, SEO content in the initial HTML, role redirects, error pages.
6. **`e2e-live-verification.js`**: guest, reporter and editor flows end to end.

---

## 📊 Walkthrough for Graders

Before starting, make sure MongoDB is running and `npm run seed` has been run (see [Installation and Running](#-installation-and-running)).

### 1. Public site
1. Open [http://localhost:3000](http://localhost:3000). View the page source: the first articles are already in the HTML.
2. Scroll down: 20 more articles load each time. Search for **"מחשב"** or **"רכבת"**, change the section, the read / unread filter and the sort order. None of this reloads the page.
3. Open an article. Its full text is in the page source.
4. Post comments: each appears immediately. The 4th within a minute is blocked with a message.
5. Check the weather widget in the sidebar.

### 2. Reporter
1. Log in at [/login](http://localhost:3000/login) as `reporter1` / `password123`.
2. Click **"כתבה חדשה"** (New article) and type. The status line shows the work saving automatically.
3. Refresh the page, or close the browser and come back: the latest text is still there.
4. Click **"הגשה לאישור עורך"** (Submit for approval). The article becomes Pending and is locked for editing.
5. Open a published article and edit it: the public page keeps showing the old version.

### 3. Editor
1. Log out and log in as `editor` / `password123`. You land on `/editor`.
2. Filter by **ממתינות לאישור עורך** (Awaiting approval) and open an update to a published article: the published and new versions are shown side by side, with changes highlighted.
3. Return it with a note (log in as the reporter to see the note), or approve it and check that the public page now shows the new version.
4. Open **ניתוח כתבות** (Impact Analytics), pick one of the multi-update articles, and see views per hour with markers at each published update.

### 4. Restart persistence
1. Log in as any user.
2. Stop the server (`Ctrl+C`) and run `npm start` again.
3. Refresh the page: you're still logged in, and unsubmitted drafts are still there.

### 5. Permissions
* Logged out, open `/reporter` or `/editor`: you're redirected to the login page.
* As a reporter, open `/editor`: access is denied (`403`).
* API calls are checked on the server too. For example, a reporter calling `PATCH /api/admin/articles/:id/status` gets `403`.

---

## 📜 Collaboration
* **Developer 1 (data layer, backend and architecture):** models, authentication, sessions, state machine, REST endpoints, seed data, tests, base server-rendered views.
* **Developer 2 (presentation layer, UI/UX):** reporter and editor areas, styling, infinite scroll, live search, comments, Chart.js analytics, Hebrew/English interface. See [`docs/dev2-guide.md`](docs/dev2-guide.md).

Work split details: [`docs/roles.md`](docs/roles.md).
