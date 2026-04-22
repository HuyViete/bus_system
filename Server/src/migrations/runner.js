// Runs all numbered SQL migration files in order — idempotent via IF NOT EXISTS.
import pool from '../libs/db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runMigrations() {
    const files = fs.readdirSync(__dirname)
        .filter(f => f.endsWith('.sql'))
        .sort()

    for (const file of files) {
        const sql = fs.readFileSync(path.join(__dirname, file), 'utf8')
        await pool.query(sql)
        console.log(`[Migration] ${file} ✓`)
    }
    console.log('[Migration] All migrations complete.')
}
