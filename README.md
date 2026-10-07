# The Daily Web - News Management System

## 📌 Project Overview
"The Daily Web" is a modern, responsive web application for managing, editing, and publishing news articles[cite: 4]. Built specifically to meet strict academic requirements, the system features a public-facing infinite-scroll news feed and a secure, role-based backend for Reporters and Editors, featuring complex version control and analytics capabilities[cite: 6, 7, 8].

This document serves as the complete project documentation, including the Data Schema, API Contract, and the **Strict Shared Context** for the Developer Agents building this system.

---

## 🏗️ Architecture & Tech Stack
The project strictly follows the **MVC (Model-View-Controller)** design pattern[cite: 8]. 

* **Backend:** Node.js, Express, MongoDB, Mongoose[cite: 8].
* **Frontend:** HTML5, CSS3 (Flexbox), Vanilla JavaScript, EJS Templating[cite: 8].
* **External APIs:** Chart.js (for analytics)[cite: 8], OpenWeatherMap (for sidebar widget)[cite: 9].
* **⛔ STRICT CONSTRAINTS:** Absolutely NO external frontend frameworks (React, Angular, Vue, Bootstrap) and NO CSS Grid[cite: 8].
* **SEO & Rendering:** Public article pages MUST be Server-Side Rendered (SSR) via EJS so full content is in the initial HTML for SEO[cite: 8].

---

## 👨‍💻 Developer Work Division (Agent Protocol)
To prevent code conflicts and maintain clean architecture, responsibilities are strictly divided:

### Developer 1: Backend, Data & Architecture (Data Layer)
* **Database & Models:** Design the 4 core Mongoose models with full CRUD support[cite: 9].
* **Auth & Security:** Implement secure login (hashed passwords) and session persistence across server restarts[cite: 9]. Enforce a strict server-side limit blocking guests from posting more than 3 comments per minute[cite: 6].
* **State Machine:** Build the logic for article transitions (Draft -> Pending -> Published -> Returned)[cite: 7].
* **Seed Script:** Create a script to generate 500 demo articles, users, and historical view data[cite: 10].

### Developer 2: Frontend, Views & UI/UX (Presentation Layer)
* **UI & Styling:** Build a fully responsive interface using strict semantic HTML5 and Flexbox[cite: 8].
* **Ajax Interactions:** Implement asynchronous Javascript (no page refresh) for infinite scrolling (20 articles at a time), live search, and dynamic comment injection[cite: 6, 8].
* **Background Tasks:** Develop the client-side `auto-save` background script that saves the reporter's work without requiring a manual "Save" button click[cite: 7].
* **Data Visualization:** Integrate `Chart.js` in the Editor's dashboard to plot view counts over time, explicitly marking timestamps when articles were updated[cite: 8].

---

## 🗄️ Database Schema & Models
The system utilizes MongoDB and Mongoose. Below is the architecture for the 4 mandatory models[cite: 9].

### 1. User Model
* `_id`: ObjectId
* `username`: String (Unique, Required)
* `passwordHash`: String (Required, NEVER stored as plain text)[cite: 9]
* `role`: Enum `['Reporter', 'Editor']` (Guests do not have accounts)[cite: 9]
* `createdAt`: Date

### 2. Article Model
* `_id`: ObjectId
* `authorId`: ObjectId (Ref: 'User')
* `category`: String
* `status`: Enum `['Draft', 'Pending', 'Published', 'Returned']`[cite: 7]
* `publicVersion`: Object (Holds the currently visible data for the public)[cite: 7]
* `draftVersion`: Object (Holds the ongoing work of the reporter)[cite: 7]
* `editorNote`: String (Populated if status is 'Returned')[cite: 7]
* `publishHistory`: Array of Dates (Tracks exact update/publish times for analytics)[cite: 8]

### 3. Comment Model
* `_id`: ObjectId
* `articleId`: ObjectId (Ref: 'Article')
* `content`: String
* `ipAddress` / `deviceId`: String (Enforces the max 3 comments/minute rule)[cite: 6]
* `createdAt`: Date

### 4. ViewStats (Impact Analytics) Model
* `_id`: ObjectId
* `articleId`: ObjectId (Ref: 'Article')[cite: 8]
* `views`: Array of Objects `{ timestamp: Date, count: Number }`

---

## 🔌 REST API Contract
This contract defines the async Ajax routes required to update the UI without a full page refresh[cite: 8].

### Public Routes
* **GET /api/articles**: Fetch articles for the infinite scroll feed[cite: 6]. (QueryParams: `page`, `limit`, `category`, `sort`).
* **POST /api/comments**: Post a new comment[cite: 6]. Returns `429 Too Many Requests` if the user exceeds 3 comments per minute[cite: 6].

### Reporter Routes
* **PUT /api/articles/:id/auto-save**: Continuously save the reporter's draft while they type (Silent background save)[cite: 7].
* **PATCH /api/articles/:id/status**: Submit a draft to the editor (`{ "status": "Pending" }`)[cite: 7].

### Editor Routes
* **PATCH /api/admin/articles/:id/status**: Approve or return an article (`{ "status": "Published" }` OR `{ "status": "Returned", "editorNote": "..." }`)[cite: 8].
* **GET /api/admin/analytics/:articleId**: Fetch timeseries data and update points for the Impact Analytics graph[cite: 8].

---

## 🔄 Core System Mechanics

### 1. Version Control & Auto-Save
Reporters' ongoing work is saved automatically in the background[cite: 7]. When a reporter edits a previously published article, the public continues to see the old version[cite: 7]. The new version only replaces the public version after an Editor explicitly reviews and approves it[cite: 7, 8].

### 2. Impact Analytics (Chart.js)
The system tracks article views and provides Editors with a visual timeline[cite: 8]. The graph must display the exact timestamps when an Editor approved/published updates, allowing the staff to see how edits affect traffic[cite: 8].

---

## 🚀 Installation & Setup

1. **Clone the repository:**
   
       git clone <repository_url>
       cd the-daily-web

2. **Install Dependencies:**
   
       npm install

3. **Environment Configuration (.env):**
   
       PORT=3000
       MONGODB_URI=mongodb://localhost:27017/dailyweb
       SESSION_SECRET=your_secure_secret
       WEATHER_API_KEY=your_openweathermap_key

4. **Seed the Database (Mandatory for evaluation)[cite: 10]:**
   
       npm run seed

5. **Start the Application:**
   
       npm start
   
   The application will be running at http://localhost:3000.