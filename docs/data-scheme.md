# 🗄️ Database Schema & Models

The system utilizes MongoDB and Mongoose. Below is the architecture for the 4 mandatory models[cite: 9].

## 1. User Model
*   `_id`: ObjectId
*   `username`: String (Unique, Required)
*   `passwordHash`: String (Required, NEVER stored as plain text)[cite: 9]
*   `role`: Enum `['Reporter', 'Editor']` (Guests do not have accounts)[cite: 9]
*   `createdAt`: Date

## 2. Article Model
*   `_id`: ObjectId
*   `authorId`: ObjectId (Ref: 'User')
*   `category`: String
*   `status`: Enum `['Draft', 'Pending', 'Published', 'Returned']`[cite: 7]
*   `publicVersion`: Object (Holds the currently visible data for the public)[cite: 7]
    *   `title`: String
    *   `content`: String
    *   `imageUrl`: String
    *   `publishedAt`: Date
*   `draftVersion`: Object (Holds the ongoing work of the reporter)[cite: 7]
    *   `title`: String
    *   `content`: String
    *   `imageUrl`: String
*   `editorNote`: String (Populated if status is 'Returned')[cite: 7]
*   `publishHistory`: Array of Dates (Tracks exactly when the article was updated/published for the analytics graph)[cite: 8]

## 3. Comment Model
*   `_id`: ObjectId
*   `articleId`: ObjectId (Ref: 'Article')
*   `content`: String
*   `ipAddress` / `deviceId`: String (Used to enforce the max 3 comments/minute rule)[cite: 6]
*   `createdAt`: Date

## 4. ViewStats (Impact Analytics) Model
*   `_id`: ObjectId
*   `articleId`: ObjectId (Ref: 'Article')[cite: 8]
*   `views`: Array of Objects (or aggregated timeseries data)
    *   `timestamp`: Date
    *   `count`: Number