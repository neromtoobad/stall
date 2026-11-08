import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data')
export const FILES_DIR = path.join(DATA_DIR, 'files')
export const COVERS_DIR = path.join(DATA_DIR, 'covers')
for (const d of [DATA_DIR, FILES_DIR, COVERS_DIR]) fs.mkdirSync(d, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'stall.db'))
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  evm_address TEXT,
  name TEXT NOT NULL DEFAULT '',
  handle TEXT UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS challenges (
  nonce TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'file',
  price_amount REAL NOT NULL,
  price_currency TEXT NOT NULL DEFAULT 'USD',
  accept_usdt INTEGER NOT NULL DEFAULT 0,
  file_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_mime TEXT,
  cover_path TEXT,
  hue INTEGER NOT NULL DEFAULT 40,
  active INTEGER NOT NULL DEFAULT 1,
  network TEXT NOT NULL DEFAULT 'mainnet',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet',
  amount_luna INTEGER,
  amount_usdt INTEGER,
  usd_value REAL NOT NULL DEFAULT 0,
  memo TEXT NOT NULL,
  pay_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT UNIQUE,
  buyer_address TEXT,
  receipt_key TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_product ON orders(product_id, status);
CREATE INDEX IF NOT EXISTS orders_creator ON orders(creator_id, status);
CREATE INDEX IF NOT EXISTS products_creator ON products(creator_id, active);
`)

export const one = (sql, ...a) => db.prepare(sql).get(...a)
export const all = (sql, ...a) => db.prepare(sql).all(...a)
export const run = (sql, ...a) => db.prepare(sql).run(...a)
