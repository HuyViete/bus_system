// Standalone migration runner — can be called from npm run migrate.
import { runMigrations } from './migrations/runner.js'
import pool from './libs/db.js'

async function main() {
    try {
        await runMigrations()
        console.log('[Migrate] Done.')
    } catch (err) {
        console.error('[Migrate] Failed:', err.message)
        process.exit(1)
    } finally {
        await pool.end()
    }
}

main()
