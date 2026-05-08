// Tracks and runs only unapplied migrations — works like EF Core's __EFMigrationsHistory.
import pool from '../libs/db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Create the history table if it doesn't exist — this is the only IF NOT EXISTS we need.
async function ensureHistoryTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migration_history (
            name        TEXT PRIMARY KEY,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `)
}

async function getApplied() {
    const { rows } = await pool.query(`SELECT name FROM _migration_history`)
    return new Set(rows.map(r => r.name))
}

async function markApplied(name) {
    await pool.query(`INSERT INTO _migration_history (name) VALUES ($1)`, [name])
}

export async function runMigrations() {
    await ensureHistoryTable()
    const applied = await getApplied()

    const files = fs.readdirSync(__dirname)
        .filter(f => f.endsWith('.sql'))
        .sort()

    let ran = 0
    for (const file of files) {
        if (applied.has(file)) {
            console.log(`[Migration] ${file} (already applied, skipped)`)
            continue
        }

        const sql = fs.readFileSync(path.join(__dirname, file), 'utf8')

        // Run the migration and record it atomically in one transaction.
        const client = await pool.connect()
        try {
            await client.query('BEGIN')
            await client.query(sql)
            await client.query(`INSERT INTO _migration_history (name) VALUES ($1)`, [file])
            await client.query('COMMIT')
            console.log(`[Migration] ${file} ✓`)
            ran++
        } catch (err) {
            await client.query('ROLLBACK')
            throw new Error(`[Migration] ${file} FAILED — rolled back. Reason: ${err.message}`)
        } finally {
            client.release()
        }
    }

    if (ran === 0) console.log('[Migration] Database is already up to date.')
    else console.log(`[Migration] ${ran} migration(s) applied.`)
}

