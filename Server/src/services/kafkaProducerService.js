// Kafka producer — accepts validated GPS packets and streams them to the topic.
import kafka from '../libs/kafka.js'
import { Partitioners } from 'kafkajs'
import config from '../config/index.js'

const producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner })
let connected = false

export async function init() {
    const admin = kafka.admin()
    try {
        await admin.connect()
        const topics = await admin.listTopics()
        if (!topics.includes(config.kafka.topic)) {
            console.log(`[Kafka] Topic "${config.kafka.topic}" not found. Creating it...`)
            await admin.createTopics({
                topics: [{
                    topic: config.kafka.topic,
                    numPartitions: 3,
                    replicationFactor: 3,
                }]
            })
            console.log(`[Kafka] Topic "${config.kafka.topic}" created successfully.`)
        }
    } catch (err) {
        console.warn(`[Kafka] Admin client failed to ensure topic exists: ${err.message}`)
    } finally {
        try {
            await admin.disconnect()
        } catch (_) {}
    }

    await producer.connect()
    connected = true
    console.log('[Kafka] Producer connected')
}

export async function produceGPS(packet) {
    if (!connected) {
        console.warn('[Kafka] Producer not connected, dropping packet')
        return
    }

    await producer.send({
        topic: config.kafka.topic,
        messages: [
            {
                // Key by vehicle_id so all packets from the same bus
                // land on the same partition, preserving order per bus.
                key: String(packet.vehicle_id),
                value: JSON.stringify(packet),
            },
        ],
    })
}

export async function disconnect() {
    if (connected) {
        await producer.disconnect()
        connected = false
        console.log('[Kafka] Producer disconnected')
    }
}
