/**
 * ============================================================================
 * GEOGRAPHIC HELPERS & COORDINATE SYSTEM (js/geoUtils.js)
 * ============================================================================
 *
 * Professional GIS & Geodetic Utility Suite:
 * - Leaflet coordinate standard: [latitude, longitude] (WGS84).
 * - Exact Haversine metric distances (meters and kilometers).
 * - True spherical heading bearing angles [0, 360) degrees.
 * - Point-to-segment orthogonal projection for snap-to-road.
 * - Nearest point on route projection.
 * - Ray-casting Point-In-Polygon test (for lake/water boundary avoidance).
 */

class GeoUtils {
    /**
     * Standardize any coordinate representation to Leaflet [lat, lng] array
     */
    static toLeafletLatLng(coord) {
        if (!coord) return null;
        if (Array.isArray(coord)) {
            // Check if coordinates were inadvertently passed as [lng, lat]
            // For Hyderabad: Lat is ~17.3 to 17.5, Lng is ~78.4 to 78.6
            if (coord[0] > 70 && coord[1] < 30) {
                console.warn('[GeoUtils] Detected reversed [lng, lat] coordinate. Normalizing to [lat, lng]:', coord);
                return [Number(coord[1]), Number(coord[0])];
            }
            return [Number(coord[0]), Number(coord[1])];
        }
        if (typeof coord === 'object' && coord !== null) {
            const lat = coord.lat !== undefined ? coord.lat : coord.latitude;
            const lng = coord.lng !== undefined ? coord.lng : (coord.lon !== undefined ? coord.lon : coord.longitude);
            return [Number(lat), Number(lng)];
        }
        return null;
    }

    /**
     * Extract { lat, lng } object from [lat, lng] or Leaflet LatLng
     */
    static fromLeafletLatLng(latlng) {
        const standard = GeoUtils.toLeafletLatLng(latlng);
        if (!standard) return null;
        return { lat: standard[0], lng: standard[1] };
    }

    /**
     * High-Precision Haversine Distance in Meters between two [lat, lng] points
     */
    static distanceMeters(p1, p2) {
        const c1 = GeoUtils.toLeafletLatLng(p1);
        const c2 = GeoUtils.toLeafletLatLng(p2);
        if (!c1 || !c2) return 0;

        const R = 6371008.8; // Mean Earth radius in meters
        const lat1Rad = c1[0] * Math.PI / 180;
        const lat2Rad = c2[0] * Math.PI / 180;
        const dLat = (c2[0] - c1[0]) * Math.PI / 180;
        const dLon = (c2[1] - c1[1]) * Math.PI / 180;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Haversine Distance in Kilometers
     */
    static distanceKm(p1, p2) {
        return GeoUtils.distanceMeters(p1, p2) / 1000;
    }

    /**
     * Calculate true polyline cumulative distance in meters
     */
    static polylineDistanceMeters(coordinates) {
        if (!coordinates || coordinates.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < coordinates.length - 1; i++) {
            total += GeoUtils.distanceMeters(coordinates[i], coordinates[i + 1]);
        }
        return total;
    }

    /**
     * Spherical forward azimuth / bearing in degrees [0, 360) from p1 to p2
     */
    static calculateBearing(p1, p2) {
        const c1 = GeoUtils.toLeafletLatLng(p1);
        const c2 = GeoUtils.toLeafletLatLng(p2);
        if (!c1 || !c2) return 0;

        const lat1 = c1[0] * Math.PI / 180;
        const lon1 = c1[1] * Math.PI / 180;
        const lat2 = c2[0] * Math.PI / 180;
        const lon2 = c2[1] * Math.PI / 180;
        const dLon = lon2 - lon1;

        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

        const brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    /**
     * Orthogonal projection of Point P onto line segment AB.
     * Returns the projected [lat, lng] snapped point and parameter t (0 <= t <= 1).
     */
    static projectPointOnSegment(p, a, b) {
        const pt = GeoUtils.toLeafletLatLng(p);
        const p1 = GeoUtils.toLeafletLatLng(a);
        const p2 = GeoUtils.toLeafletLatLng(b);

        const dx = p2[1] - p1[1];
        const dy = p2[0] - p1[0];
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) {
            return { lat: p1[0], lng: p1[1], t: 0, point: [p1[0], p1[1]] };
        }

        let t = ((pt[1] - p1[1]) * dx + (pt[0] - p1[0]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projLat = p1[0] + t * dy;
        const projLng = p1[1] + t * dx;

        return {
            lat: projLat,
            lng: projLng,
            t,
            point: [projLat, projLng]
        };
    }

    /**
     * Project a point onto an entire polyline.
     * Returns closest segment index, snapped coordinates, and distance in meters.
     */
    static nearestPointOnRoute(point, coordinates) {
        if (!coordinates || coordinates.length < 2) {
            const first = coordinates && coordinates[0] ? GeoUtils.toLeafletLatLng(coordinates[0]) : null;
            return {
                point: first,
                segmentIndex: 0,
                distanceMeters: first ? GeoUtils.distanceMeters(point, first) : Infinity
            };
        }

        let minDistance = Infinity;
        let bestPoint = null;
        let bestSegmentIndex = 0;

        for (let i = 0; i < coordinates.length - 1; i++) {
            const p1 = coordinates[i];
            const p2 = coordinates[i + 1];
            const proj = GeoUtils.projectPointOnSegment(point, p1, p2);
            const dist = GeoUtils.distanceMeters(point, proj.point);

            if (dist < minDistance) {
                minDistance = dist;
                bestPoint = proj.point;
                bestSegmentIndex = i;
            }
        }

        return {
            point: bestPoint,
            segmentIndex: bestSegmentIndex,
            distanceMeters: minDistance
        };
    }

    /**
     * Ray-Casting algorithm to test if a [lat, lng] point lies inside a polygon.
     * polygon is an array of [lng, lat] (GeoJSON format) or [lat, lng] points.
     */
    static pointInPolygon(point, polygonPoints, isGeoJsonFormat = false) {
        const pt = GeoUtils.toLeafletLatLng(point);
        if (!pt || !polygonPoints || polygonPoints.length < 3) return false;

        const testLat = pt[0];
        const testLng = pt[1];
        let inside = false;
        const n = polygonPoints.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const p1 = polygonPoints[i];
            const p2 = polygonPoints[j];

            const p1Lat = isGeoJsonFormat ? p1[1] : p1[0];
            const p1Lng = isGeoJsonFormat ? p1[0] : p1[1];
            const p2Lat = isGeoJsonFormat ? p2[1] : p2[0];
            const p2Lng = isGeoJsonFormat ? p2[0] : p2[1];

            const intersect = ((p1Lat > testLat) !== (p2Lat > testLat)) &&
                (testLng < (p2Lng - p1Lng) * (testLat - p1Lat) / (p2Lat - p1Lat) + p1Lng);

            if (intersect) inside = !inside;
        }

        return inside;
    }
}

// Attach to window for standard browser script execution
if (typeof window !== 'undefined') {
    window.GeoUtils = GeoUtils;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeoUtils;
}
