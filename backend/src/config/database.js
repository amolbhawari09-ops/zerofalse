const { MongoClient, ServerApiVersion } = require('mongodb');

let client = null;
let db = null;

const DB_NAME = 'zerofalse';

// In-memory fallback (used if MongoDB fails)
const memoryStore = {
  scans: [],
  patterns: [],
  stats: {
    totalScans: 0,
    totalVulns: 0,
    accuracy: 0,
    falsePositivesPrevented: 0,
    avgScanDuration: 0,
    lastUpdated: new Date()
  }
};

async function connectDatabase() {

  if (db) {
    return db;
  }

  if (!process.env.MONGODB_URI) {
    console.warn('⚠️ No MONGODB_URI found. Using memory storage.');
    return null;
  }

  try {

    console.log('🔄 Connecting to MongoDB...');

    client = new MongoClient(process.env.MONGODB_URI, {

      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },

      tls: true,

      retryWrites: true,

      w: 'majority',

      connectTimeoutMS: 15000,

      socketTimeoutMS: 30000,

      maxPoolSize: 10,

    });

    await client.connect();

    db = client.db(DB_NAME);

    console.log('✅ MongoDB connected successfully');

    return db;

  } catch (error) {

    console.error('❌ MongoDB connection failed:', error.message);

    console.warn('⚠️ Falling back to in-memory storage');

    db = null;

    return null;

  }
}

function getDb() {
  return db;
}

async function closeDatabase() {
  try {
    if (client) {
      await client.close();
      console.log('🔒 MongoDB connection closed');
    }
  } catch (error) {
    console.error('Error closing MongoDB:', error.message);
  }
}

module.exports = {
  connectDatabase,
  getDb,
  closeDatabase,
  memoryStore
};