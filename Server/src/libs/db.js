import dotenv from 'dotenv'
import { Pool } from 'pg'
dotenv.config()

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
})

export default pool
