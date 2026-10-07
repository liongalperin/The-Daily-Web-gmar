/**
 * MongoDB connection setup using Mongoose.
 */

const mongoose = require('mongoose');
const logger = require('./logger');

let isConnected = false;
let listenersAttached = false;
let memoryServer = null;

async function connectDB(customUri) {
  const uri = customUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/dailyweb';

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2500,
      autoIndex: true,
      maxPoolSize: 50
    });

    isConnected = true;
    logger.info(`MongoDB connected successfully to ${conn.connection.host}/${conn.connection.name}`);

    if (!listenersAttached) {
      listenersAttached = true;
      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB runtime connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Retrying...');
        isConnected = false;
      });
    }

    return conn.connection;
  } catch (error) {
    // If local MongoDB daemon is not running in dev mode, start in-memory MongoDB
    if (process.env.NODE_ENV !== 'production' && !customUri && (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('localhost') || process.env.MONGODB_URI.includes('127.0.0.1'))) {
      try {
        logger.warn('Local MongoDB daemon not detected at localhost:27017. Initializing embedded database for local execution...');
        const { MongoMemoryServer } = require('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        const memUri = memoryServer.getUri();
        const conn = await mongoose.connect(memUri);
        isConnected = true;
        logger.info(`Embedded MongoDB active at ${memUri}`);

        // Seed demo data so the app has live articles and staff accounts immediately
        const seedDatabase = require('../scripts/seed');
        await seedDatabase();

        return conn.connection;
      } catch (memErr) {
        logger.error('Failed to initialize embedded MongoDB fallback:', memErr);
      }
    }

    logger.error('MongoDB connection failure:', error);
    throw error;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected cleanly');
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  getConnection: () => mongoose.connection
};
