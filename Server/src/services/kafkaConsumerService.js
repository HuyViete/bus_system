// Kafka consumer — pulls GPS packets from the topic and processes them into PostgreSQL.
import kafka from '../libs/kafka.js'
import config from '../config/index.js'
import { processGPS } from './gpsIngestionService.js'
import { recordProcessingResult } from './ingestionMetricsService.js'

const consumer = kafka.consumer({ groupId: config.kafka.groupId })
let running = false

// Throughput tracking
let messagesProcessed = 0
let lastLogTime = Date.now()
const LOG_INTERVAL_MS = 10_000

export async function start() {
    await consumer.connect()
    console.log('[Kafka] Consumer connected')

    await consumer.subscribe({
        topic: config.kafka.topic,
        fromBeginning: false,
    })

    running = true

    await consumer.run({
        // Use eachBatch for higher throughput — process multiple messages per pull.
        eachBatchAutoResolve: false,
        eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
            const messages = batch.messages

            for (const message of messages) {
                if (!isRunning() || isStale()) break

                const startedAt = Date.now()
                try {
                    const packet = JSON.parse(message.value.toString())
                    await processGPS(packet)
                    recordProcessingResult(true, Date.now() - startedAt)

                    resolveOffset(message.offset)
                    messagesProcessed++
                } catch (err) {
                    recordProcessingResult(false, Date.now() - startedAt)
                    console.error(`[Kafka] processGPS error: ${err.message}`)
                    break
                }

                await heartbeat()
            }

            logThroughput()
        },
    })

    console.log(`[Kafka] Consumer subscribed to ${config.kafka.topic}`)
}

function logThroughput() {
    const now = Date.now()
    if (now - lastLogTime >= LOG_INTERVAL_MS) {
        const elapsed = (now - lastLogTime) / 1000
        const rate = (messagesProcessed / elapsed).toFixed(1)
        console.log(`[Kafka] Throughput: ${rate} msg/s (${messagesProcessed} in ${elapsed.toFixed(0)}s)`)
        messagesProcessed = 0
        lastLogTime = now
    }
}

export async function disconnect() {
    if (running) {
        running = false
        await consumer.disconnect()
        console.log('[Kafka] Consumer disconnected')
    }
}
