/**
 * ============================================================================
 * VEHICLE SIMULATOR & SMOOTH INTERPOLATION ENGINE (js/vehicle.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Animates an SVG sports car along the exact road coordinate polyline.
 * 2. Uses requestAnimationFrame for 60fps smooth geographic interpolation.
 * 3. Segment duration is strictly proportional to Haversine geographic distance.
 * 4. Continuously updates vehicle bearing/rotation to face the exact direction of travel.
 * 5. Handles dynamic route recalculation seamlessly from the current mid-journey position.
 * 6. Supports "Follow Vehicle" smooth camera tracking, speed multipliers, and replay.
 */

if (typeof require !== 'undefined') {
    if (typeof GeoUtils === 'undefined') {
        globalThis.GeoUtils = require('./geoUtils.js');
    }
}

class VehicleNavigator {
    constructor(leafletMap) {
        this.map = leafletMap;
        this.marker = null;
        this.coordinates = [];        // [[lat, lng], ...]
        this.currentSegmentIndex = 0; // Current index in coordinates array
        this.segmentProgress = 0;      // 0.0 to 1.0 along current segment
        this.isPlaying = false;
        this.isPaused = false;
        this.speedFactor = 1.0;        // Configurable speed multiplier (0.5x, 1.0x, 2.0x, 4.0x)
        this.baseSpeedKmH = 45;        // Simulated base city speed: 45 km/h
        this.animationFrameId = null;
        this.lastTimestamp = null;
        this.followVehicle = false;    // Smooth follow camera toggle
        this.currentPosition = null;   // { lat, lng }
        this.currentBearing = 0;

        this.onProgressCallback = null;
        this.onCompleteCallback = null;
    }

    get routeCoordinates() {
        return this.coordinates;
    }

    set routeCoordinates(val) {
        this.coordinates = val;
    }

    /**
     * Calculate heading bearing angle in degrees between two coordinates
     */
    static calculateBearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        let brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    /**
     * Calculate Haversine distance in km
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        if (typeof GeoUtils !== 'undefined' && GeoUtils.distanceKm) {
            return GeoUtils.distanceKm([lat1, lon1], [lat2, lon2]);
        }
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Create or update high-quality SVG Sports Sedan Vehicle Marker
     */
    _ensureMarker(lat, lng, bearing = 0) {
        if (typeof L === 'undefined' || !this.map) {
            this.currentPosition = { lat, lng };
            this.currentBearing = bearing;
            return;
        }

        if (!this.marker) {
            const vehicleHtml = `
                <div class="vehicle-marker-container">
                    <div class="vehicle-shadow"></div>
                    <div class="vehicle-svg-rotator" style="transform: rotate(${bearing}deg);">
                        <svg class="vehicle-svg" viewBox="0 0 32 64" width="28" height="56" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="carBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="#0284c7" />
                                    <stop offset="50%" stop-color="#38bdf8" />
                                    <stop offset="100%" stop-color="#0284c7" />
                                </linearGradient>
                                <linearGradient id="windshieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#0f172a" />
                                    <stop offset="100%" stop-color="#1e293b" />
                                </linearGradient>
                            </defs>
                            <!-- Chassis Shadow -->
                            <rect x="3" y="4" width="26" height="56" rx="7" fill="rgba(0,0,0,0.35)" />
                            <!-- Wheels -->
                            <rect x="0" y="10" width="4" height="11" rx="2" fill="#0f172a" />
                            <rect x="28" y="10" width="4" height="11" rx="2" fill="#0f172a" />
                            <rect x="0" y="43" width="4" height="11" rx="2" fill="#0f172a" />
                            <rect x="28" y="43" width="4" height="11" rx="2" fill="#0f172a" />
                            <!-- Main Body -->
                            <rect x="3" y="3" width="26" height="58" rx="8" fill="url(#carBodyGrad)" stroke="#ffffff" stroke-width="1.2" />
                            <!-- Headlights -->
                            <polygon points="5,5 10,4 9,8 5,7" fill="#fef08a" />
                            <polygon points="27,5 22,4 23,8 27,7" fill="#fef08a" />
                            <!-- Front Windshield -->
                            <path d="M6 18 Q16 16 26 18 L24 29 Q16 28 8 29 Z" fill="url(#windshieldGrad)" opacity="0.95" />
                            <!-- Roof -->
                            <rect x="7" y="27" width="18" height="19" rx="3" fill="#0369a1" />
                            <!-- Rear Windshield -->
                            <path d="M7 47 L25 47 L24 53 Q16 54 8 53 Z" fill="url(#windshieldGrad)" opacity="0.95" />
                            <!-- Taillights -->
                            <rect x="5" y="59" width="6" height="2" rx="1" fill="#ef4444" />
                            <rect x="21" y="59" width="6" height="2" rx="1" fill="#ef4444" />
                        </svg>
                    </div>
                </div>
            `;

            const icon = L.divIcon({
                className: 'custom-vehicle-div-icon',
                html: vehicleHtml,
                iconSize: [32, 64],
                iconAnchor: [16, 32]
            });

            this.marker = L.marker([lat, lng], {
                icon,
                zIndexOffset: 1500,
                interactive: false
            }).addTo(this.map);
        } else {
            this.marker.setLatLng([lat, lng]);
            const rotator = this.marker.getElement()?.querySelector('.vehicle-svg-rotator');
            if (rotator) {
                rotator.style.transform = `rotate(${bearing}deg)`;
            }
        }

        this.currentPosition = { lat, lng };
        this.currentBearing = bearing;
    }

    /**
     * Start animation along road coordinates
     * @param {Array|Object} routeOrCoordinates - Array of [lat, lng] or route object with .coordinates
     * @param {Function} onComplete
     * @param {Function} onProgress
     */
    start(routeOrCoordinates, onComplete, onProgress) {
        let coords = routeOrCoordinates;
        if (routeOrCoordinates && routeOrCoordinates.coordinates) {
            coords = routeOrCoordinates.coordinates;
        } else if (routeOrCoordinates && routeOrCoordinates.roadCoordinates) {
            coords = routeOrCoordinates.roadCoordinates;
        }

        if (!coords || coords.length < 2) return;

        this.reset();
        this.coordinates = coords;
        this.onCompleteCallback = onComplete;
        this.onProgressCallback = onProgress;
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        this.isPlaying = true;
        this.isPaused = false;

        const p0 = this.coordinates[0];
        const p1 = this.coordinates[1];
        const initialBearing = VehicleNavigator.calculateBearing(p0[0], p0[1], p1[0], p1[1]);

        this._ensureMarker(p0[0], p0[1], initialBearing);
        this.lastTimestamp = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    /**
     * Core animation loop using requestAnimationFrame
     */
    _animate(timestamp) {
        if (!this.isPlaying || this.isPaused) return;

        const deltaMs = Math.min(100, timestamp - (this.lastTimestamp || timestamp));
        this.lastTimestamp = timestamp;

        if (this.currentSegmentIndex >= this.coordinates.length - 1) {
            // Reached Destination
            this.isPlaying = false;
            const finalPoint = this.coordinates[this.coordinates.length - 1];
            this._ensureMarker(finalPoint[0], finalPoint[1], this.currentBearing);

            if (this.onProgressCallback) {
                this.onProgressCallback(100);
            }
            if (this.onCompleteCallback) {
                this.onCompleteCallback();
            }
            return;
        }

        const p1 = this.coordinates[this.currentSegmentIndex];
        const p2 = this.coordinates[this.currentSegmentIndex + 1];

        // Segment distance in km
        const segDistKm = VehicleNavigator.calculateDistance(p1[0], p1[1], p2[0], p2[1]);

        // Effective velocity in km/h = baseSpeedKmH * speedFactor
        const speedKmh = Math.max(10, this.baseSpeedKmH * this.speedFactor);
        const segmentDurationMs = Math.max(120, (segDistKm / speedKmh) * 3600 * 1000);

        this.segmentProgress += deltaMs / segmentDurationMs;

        if (this.segmentProgress >= 1.0) {
            this.segmentProgress = 0;
            this.currentSegmentIndex++;
        }

        // Interpolated point
        if (this.currentSegmentIndex < this.coordinates.length - 1) {
            const curP1 = this.coordinates[this.currentSegmentIndex];
            const curP2 = this.coordinates[this.currentSegmentIndex + 1];
            const t = Math.min(1.0, this.segmentProgress);

            const curLat = curP1[0] + (curP2[0] - curP1[0]) * t;
            const curLng = curP1[1] + (curP2[1] - curP1[1]) * t;

            const bearing = VehicleNavigator.calculateBearing(curP1[0], curP1[1], curP2[0], curP2[1]);
            this._ensureMarker(curLat, curLng, bearing);

            // Follow Vehicle Camera
            if (this.followVehicle && this.map && typeof this.map.panTo === 'function') {
                this.map.panTo([curLat, curLng], { animate: true, duration: 0.1 });
            }

            // Overall progress percentage
            if (this.onProgressCallback) {
                const totalSegments = this.coordinates.length - 1;
                const totalProg = Math.round(((this.currentSegmentIndex + t) / totalSegments) * 100);
                this.onProgressCallback(Math.min(99, totalProg));
            }
        }

        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        if (!this.isPlaying) return;
        this.isPaused = false;
        this.lastTimestamp = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    reset() {
        this.isPlaying = false;
        this.isPaused = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.marker && this.map) {
            this.map.removeLayer(this.marker);
            this.marker = null;
        }
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        this.currentPosition = null;
    }

    /**
     * Update vehicle route mid-journey (seamless rerouting from current position)
     */
    updateRouteCoordinates(newRouteOrCoordinates) {
        let newCoordinates = newRouteOrCoordinates;
        if (newRouteOrCoordinates && newRouteOrCoordinates.coordinates) {
            newCoordinates = newRouteOrCoordinates.coordinates;
        } else if (newRouteOrCoordinates && newRouteOrCoordinates.roadCoordinates) {
            newCoordinates = newRouteOrCoordinates.roadCoordinates;
        }

        if (!newCoordinates || newCoordinates.length < 2) return;

        if (!this.isPlaying || !this.currentPosition) {
            this.coordinates = newCoordinates;
            return;
        }

        const currLat = this.currentPosition.lat;
        const currLng = this.currentPosition.lng;

        // Find nearest point on the new route
        let nearestIdx = 0;
        let minDistance = Infinity;

        for (let i = 0; i < newCoordinates.length; i++) {
            const dist = VehicleNavigator.calculateDistance(
                currLat, currLng,
                newCoordinates[i][0], newCoordinates[i][1]
            );
            if (dist < minDistance) {
                minDistance = dist;
                nearestIdx = i;
            }
        }

        // Splice route starting exactly from current vehicle position
        const remainingRoute = [
            [currLat, currLng],
            ...newCoordinates.slice(nearestIdx)
        ];

        this.coordinates = remainingRoute;
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
    }

    setSpeed(speedFactor) {
        this.speedFactor = parseFloat(speedFactor) || 1.0;
    }

    setFollowVehicle(enabled) {
        this.followVehicle = Boolean(enabled);
    }
}

if (typeof window !== 'undefined') {
    window.VehicleNavigator = VehicleNavigator;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VehicleNavigator;
}
