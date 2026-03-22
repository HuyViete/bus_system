import pool from './db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Runs schema.sql to create all event tables if they don't exist yet.
 * Safe to call on every server startup (all statements use IF NOT EXISTS).
 */
export async function initSchema() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    await pool.query(sql)
    console.log('[DB] Schema initialised.')
}
