# 👨‍💻 Work Division: The Daily Web

This document outlines the strict division of responsibilities between the two developers to avoid Git conflicts and ensure all project requirements are met.

## Developer 1: Backend, Architecture & Database (Data Layer)
**Focus:** Node.js, Express, MongoDB, Mongoose, and Authentication[cite: 8].

*   **Database Architecture:** Design and implement the 4 core Mongoose models (Users, Articles, Comments, ViewStats) with full CRUD support[cite: 9].
*   **Authentication & Authorization:** Implement secure login for Reporters and Editors (hashed passwords) and ensure sessions persist after server restarts[cite: 9]. Enforce role-based access control on all routes[cite: 9].
*   **Article State Machine:** Develop the backend logic for article transitions (Draft -> Pending -> Published -> Returned)[cite: 7]. Implement the logic to serve the currently published version to users while a new version is being edited[cite: 7].
*   **API Development:** Build RESTful endpoints for infinite scroll pagination, live search, and auto-saving[cite: 8].
*   **Security & Rate Limiting:** Implement server-side validation to block users from posting more than 3 comments per minute[cite: 6].
*   **Seed Data Generation:** Create the script to populate the database with 500 articles, diverse users, and historical view data for the analytics graph[cite: 10].

## Developer 2: Frontend, Views & UI/UX (Presentation Layer)
**Focus:** HTML5, CSS3 (Flexbox), Vanilla JavaScript, and EJS Templates[cite: 8].

*   **UI & Responsive Design:** Build the entire user interface using strict semantic HTML5 and Flexbox (No CSS Grid, React, or Bootstrap allowed)[cite: 8]. Ensure compatibility across desktop, tablet, and mobile[cite: 8].
*   **EJS Templating & SEO:** Develop the Server-Side Rendering (SSR) views. Ensure the full article content is rendered in the initial HTML for SEO purposes[cite: 8].
*   **Ajax & Infinite Scroll:** Implement the frontend logic to fetch and render 20 new articles automatically when the user scrolls near the bottom, without refreshing the page[cite: 6].
*   **Live Interactivity:** Build the client-side logic for live search, category filtering, and instant comment injection using Vanilla JS Ajax[cite: 6].
*   **Auto-Save & Editor Experience:** Develop the background script that continuously saves the reporter's work without requiring a manual "Save" button click[cite: 7].
*   **Impact Analytics Dashboard:** Integrate `Chart.js` (or Canvas) in the Editor's dashboard to render the views-over-time graph, explicitly marking update timestamps[cite: 8].
*   **Weather Widget:** Integrate a free external weather API (e.g., OpenWeatherMap) into the sidebar[cite: 9].