# 🗄️ Database Schema & Models

The system utilizes MongoDB and Mongoose. Below is the architecture for the 4 mandatory models.

## 1. User Model
*   `_id`: ObjectId
*   `username`: String (Unique, Required)
*   `passwordHash`: String (Required, NEVER stored as plain text)
*   `role`: Enum `['Reporter', 'Editor']` (Guests do not have accounts)
*   `createdAt`: Date

## 2. Article Model
*   `_id`: ObjectId
*   `authorId`: ObjectId (Ref: 'User')
*   `category`: String
*   `status`: Enum `['Draft', 'Pending', 'Published', 'Returned']`
*   `publicVersion`: Object (Holds the currently visible data for the public)
    *   `title`: String
    *   `content`: String
    *   `imageUrl`: String
    *   `publishedAt`: Date
*   `draftVersion`: Object (Holds the ongoing work of the reporter)
    *   `title`: String
    *   `content`: String
    *   `imageUrl`: String
*   `editorNote`: String (Populated if status is 'Returned')
*   `publishHistory`: Array of Dates (Tracks exactly when the article was updated/published for the analytics graph)

## 3. Comment Model
*   `_id`: ObjectId
*   `articleId`: ObjectId (Ref: 'Article')
*   `content`: String
*   `ipAddress` / `deviceId`: String (Used to enforce the max 3 comments/minute rule)
*   `createdAt`: Date

## 4. ViewStats (Impact Analytics) Model
*   `_id`: ObjectId
*   `articleId`: ObjectId (Ref: 'Article')
*   `views`: Array of Objects (Hourly bucketed timeseries data)
    *   `timestamp`: Date
    *   `count`: Number