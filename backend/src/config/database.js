const { MongoClient } = require('mongodb');

let db = null;

async function connectDatabase() {
  if (db) return db;
  
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db('zerofalse');
    console.log('✅ Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    // Fallback to in-memory for MVP
    console.log('⚠️  Using in-memory storage');
    return null;
  }
}

function getDb() {
  return db;
}

// In-memory fallback
const memoryStore = {
  scans: [],
  patterns: [],
  stats: { totalScans: 0, totalVulns: 0, accuracy: 0 }
};

module.exports = { connectDatabase, getDb, memoryStore };
