const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false
    });
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });
  }
  return pool;
}

async function initSchema() {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        nickname TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT DEFAULT NULL,
        status TEXT DEFAULT 'offline',
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('private', 'group')),
        name TEXT,
        avatar TEXT,
        created_by TEXT,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at BIGINT NOT NULL,
        PRIMARY KEY (conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('text', 'image', 'video', 'voice', 'link')),
        content TEXT NOT NULL,
        file_url TEXT,
        file_size BIGINT,
        duration INTEGER,
        link_title TEXT,
        link_description TEXT,
        link_image TEXT,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS message_reads (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        read_at BIGINT NOT NULL,
        PRIMARY KEY (message_id, user_id)
      );

      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS mention_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);
    `);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

async function query(text, params) {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result;
}

module.exports = { getPool, initSchema, query };
