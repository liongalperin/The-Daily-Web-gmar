/**
 * The Daily Web - HTTP Server Entry Point
 */

require('dotenv').config();
const { connectDB } = require('./config/db');
const logger = require('./config/logger');
const createApp = require('./app');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Instantiate Express App
    const app = createApp();

    // 3. Start listening
    const server = app.listen(PORT, () => {
      logger.info(`====================================================`);
      logger.info(`🚀 The Daily Web Server running on http://localhost:${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`====================================================`);
    });

    // Graceful Shutdown Handling
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        const { disconnectDB } = require('./config/db');
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return { app, server };
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = startServer;
