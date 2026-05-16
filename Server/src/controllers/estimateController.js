import { getEstimateTime, getTrafficStatus } from "../services/estimateService.js";
import { getNearestStop } from "../services/distanceService.js";

export async function getEstimate(req, res) {
    try {
        const { route, lat, lon, speed } = req.body;
        const distance = await getNearestStop(route, lat, lon);
        const time = await getEstimateTime(route, lat, lon, speed);
        const traffic = await getTrafficStatus(route, lat, lon);
        // res.json({ distance_to_next: distance, estimated_time: time, status: traffic })
        res.json({ distance_to_next: "123", estimated_time: "456", status: "none" })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}