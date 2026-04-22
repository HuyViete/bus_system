// Haversine distance in metres between two lat/lon points.
export function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6_371_000
    const toRad = deg => deg * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(a))
}
