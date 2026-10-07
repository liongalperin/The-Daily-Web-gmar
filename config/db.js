/**
 * MongoDB connection setup using Mongoose.
 */

const mongoose = require('mongoose');
const logger = require('./logger');

let isConnected = false;
let listenersAttached = false;

async function connectDB(customUri) {
  const uri = customUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/dailyweb';

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
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
}

module.exports = {
  connectDB,
  disconnectDB,
  getConnection: () => mongoose.connection
};
