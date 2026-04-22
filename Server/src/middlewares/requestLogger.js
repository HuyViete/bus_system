// Logs incoming requests with method, URL, status, and response time.
export function requestLogger(req, res, next) {
    const start = Date.now()
    res.on('finish', () => {
        const ms = Date.now() - start
        if (req.originalUrl !== '/') {
            console.log(`[${req.method}] ${req.originalUrl} → ${res.statusCode} (${ms}ms)`)
        }
    })
    next()
}
