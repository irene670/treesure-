import { initialContent } from './content-seed.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function initializeDatabase(dbPath = process.env.MORI_DB_PATH || './mori.sqlite') {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS content (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','editor')), active INTEGER NOT NULL DEFAULT 1, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, time TEXT NOT NULL, kind TEXT, target_id TEXT, snapshot TEXT);
    CREATE TABLE IF NOT EXISTS subscribers (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, consented_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, token TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS sapling_events (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sapling_registrations (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, email TEXT NOT NULL, unsubscribe_token TEXT UNIQUE NOT NULL, json TEXT NOT NULL, UNIQUE(event_id,email));
  `);

  const settings = structuredClone(initialContent.settings);
  db.prepare('INSERT OR IGNORE INTO settings(id,json) VALUES(1,?)').run(JSON.stringify(settings));

  const posts = structuredClone(initialContent.posts);
  const ledger = structuredClone(initialContent.ledger);
  const reports = structuredClone(initialContent.reports);
  const insertContent = db.prepare('INSERT OR IGNORE INTO content(kind,id,json) VALUES(?,?,?)');
  for (const [kind, rows] of Object.entries({ posts, ledger, reports })) for (const row of rows) insertContent.run(kind, row.id, JSON.stringify(row));

  const insertSaplingEvent = db.prepare('INSERT OR IGNORE INTO sapling_events(id,json) VALUES(?,?)');
  for (const row of structuredClone(initialContent.saplingEvents || [])) insertSaplingEvent.run(row.id, JSON.stringify(row));

  const insertUser = db.prepare('INSERT OR IGNORE INTO users(id,email,name,role,active,password_hash) VALUES(?,?,?,?,1,?)');
  insertUser.run('admin-demo', 'admin@mori.local', '示範管理員', 'admin', hashPassword('MoriDemo2026!'));
  insertUser.run('editor-demo', 'editor@mori.local', '示範編輯者', 'editor', hashPassword('MoriDemo2026!'));
  return db;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = initializeDatabase();
  db.close();
  console.log('Database initialized.');
}
