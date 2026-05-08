import { Kafka } from 'kafkajs'
import config from '../config/index.js'

const kafka = new Kafka({
    clientId: 'server',
    brokers: config.kafka.brokers,
})

export default kafka