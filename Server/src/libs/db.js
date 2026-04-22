// PostgreSQL connection pool singleton.
import { Pool } from 'pg'
import config from '../config/index.js'

const pool = new Pool(config.db)

export default pool
