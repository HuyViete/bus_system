import { getEstimateTime, getTrafficStatus } from "../services/estimateService";

export async function getEstimate(req, res) {
    try {
        const { id, route, lat, lon, speed } = req.body;
        const time = await getEstimateTime(route, lat, lon, speed);
        const traffic = await getTrafficStatus(route, lat, lon);
        res.json({ distance_to_next: "123", estimated_time: time, status: traffic })
    } catch (error) {
        console.log(error);
    }
}