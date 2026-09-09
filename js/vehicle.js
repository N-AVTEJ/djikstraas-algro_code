/**
 * ============================================================================
 * VEHICLE SIMULATOR & SMOOTH INTERPOLATION ENGINE (js/vehicle.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Animates an SVG sports sedan along the exact road coordinate polyline.
 * 2. Uses requestAnimationFrame for 60fps smooth geographic interpolation.
 * 3. Segment duration is strictly proportional to Haversine geographic distance.
 * 4. Continuously updates vehicle bearing/rotation to face the direction of travel.
 * 5. Handles dynamic route recalculation smoothly (reroutes from nearest road point).
 * 6. Supports "Follow Vehicle" smooth camera tracking.
 */

class VehicleNavigator {
    constructor(leafletMap) {
        this.map = leafletMap;
        this.marker = null;
        this.coordinates = [];       // [[lat, lng], ...]
        this.currentSegmentIndex = 0; // Current index in coordinates array
        this.segmentProgress = 0;     // 0.0 to 1.0 along current segment
        this.isPlaying = false;
        this.isPaused = false;
        this.speedFactor = 1.0;       // Configurable speed multiplier
        this.baseSpeedKmH = 45;       // Simulated base speed: 45 km/h
        this.animationFrameId = null;
        this.lastTimestamp = null;
        this.followVehicle = false;   // Follow camera toggle
        this.currentPosition = null;  // { lat, lng }
        this.currentBearing = 0;

        this.onProgressCallback = null;
        this.onCompleteCallback = null;
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
     * Create or update high-quality SVG Vehicle Marker
     */
    _ensureMarker(lat, lng, bearing = 0) {
        if (!this.marker) {
            const vehicleHtml = `
                <div class="vehicle-marker-container">
                    <div class="vehicle-shadow"></div>
                    <div class="vehicle-svg-rotator" style="transform: rotate(${bearing}deg);">
                        <svg class="vehicle-svg" viewBox="0 0 32 64" width="28" height="56" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="carBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="#0288d1" />
                                    <stop offset="50%" stop-color="#29b6f6" />
                                    <stop offset="100%" stop-color="#0288d1" />
                                </linearGradient>
                                <linearGradient id="windshieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#1a237e" />
                                    <stop offset="100%" stop-color="#0d47a1" />
                                </linearGradient>
                            </defs>
                            <!-- Chassis Shadow -->
                            <rect x="3" y="4" width="26" height="56" rx="7" fill="rgba(0,0,0,0.3)" filter="blur(1px)" />
                            <!-- Wheels -->
                            <rect x="0" y="10" width="4" height="11" rx="2" fill="#111" />
                            <rect x="28" y="10" width="4" height="11" rx="2" fill="#111" />
                            <rect x="0" y="43" width="4" height="11" rx="2" fill="#111" />
                            <rect x="28" y="43" width="4" height="11" rx="2" fill="#111" />
                            <!-- Main Body -->
                            <rect x="3" y="3" width="26" height="58" rx="8" fill="url(#carBodyGrad)" stroke="#ffffff" stroke-width="1" />
                            <!-- Front Hood Accent -->
                            <path d="M7 6 Q16 2 25 6 L24 16 Q16 14 8 16 Z" fill="#0277bd" />
                            <!-- Headlights -->
                            <polygon points="5,5 10,4 9,8 5,7" fill="#fff9c4" />
                            <polygon points="27,5 22,4 23,8 27,7" fill="#fff9c4" />
                            <!-- Windshield -->
                            <path d="M6 18 Q16 16 26 18 L24 29 Q16 28 8 29 Z" fill="url(#windshieldGrad)" opacity="0.9" />
                            <!-- Roof -->
                            <rect x="7" y="29" width="18" height="16" rx="3" fill="#0288d1" />
                            <!-- Rear Window -->
                            <path d="M8 46 Q16 47 24 46 L25 53 Q16 54 7 53 Z" fill="url(#windshieldGrad)" opacity="0.9" />
                            <!-- Tail lights -->
                            <rect x="5" y="59" width="5" height="2" rx="1" fill="#f44336" />
                            <rect x="22" y="59" width="5" height="2" rx="1" fill="#f44336" />
                        </svg>
                    </div>
                </div>
            `;

            const icon = L.divIcon({
                className: 'custom-vehicle-div-icon',
                html: vehicleHtml,
                iconSize: [28, 56],
                iconAnchor: [14, 28]
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
     */
    start(roadCoordinates, onComplete, onProgress) {
        if (!roadCoordinates || roadCoordinates.length < 2) return;

        this.reset();
        this.coordinates = roadCoordinates;
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
        this.lastTimestamp = performance.now();
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

            if (this.onCompleteCallback) {
                this.onCompleteCallback();
            }
            return;
        }

        const p1 = this.coordinates[this.currentSegmentIndex];
        const p2 = this.coordinates[this.currentSegmentIndex + 1];

        // Segment distance in km
        const segDistKm = VehicleNavigator.calculateDistance(p1[0], p1[1], p2[0], p2[1]);

        // Duration calculation: time = distance / velocity
        // Effective velocity in km/h = baseSpeedKmH * speedFactor
        // Minimum segment duration 200ms to keep motion buttery smooth
        const speedKmh = Math.max(10, this.baseSpeedKmH * this.speedFactor);
        const segmentDurationMs = Math.max(150, (segDistKm / speedKmh) * 3600 * 1000);

        // Advance progress
        this.segmentProgress += deltaMs / segmentDurationMs;

        if (this.segmentProgress >= 1.0) {
            this.segmentProgress = 0;
            this.currentSegmentIndex++;
        }

        // Interpolate position along current segment
        const safeProgress = Math.min(1.0, this.segmentProgress);
        const currentLat = p1[0] + (p2[0] - p1[0]) * safeProgress;
        const currentLng = p1[1] + (p2[1] - p1[1]) * safeProgress;

        // Calculate heading bearing
        const targetBearing = VehicleNavigator.calculateBearing(p1[0], p1[1], p2[0], p2[1]);

        // Smooth bearing transition
        const smoothBearing = this._interpolateAngle(this.currentBearing, targetBearing, 0.25);

        this._ensureMarker(currentLat, currentLng, smoothBearing);

        // Follow vehicle mode: smooth map pan
        if (this.followVehicle) {
            this.map.panTo([currentLat, currentLng], { animate: true, duration: 0.1 });
        }

        if (this.onProgressCallback) {
            this.onProgressCallback({
                segmentIndex: this.currentSegmentIndex,
                totalSegments: this.coordinates.length - 1,
                lat: currentLat,
                lng: currentLng,
                bearing: smoothBearing
            });
        }

        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    /**
     * Shortest rotational angle interpolation
     */
    _interpolateAngle(current, target, factor) {
        let diff = (target - current) % 360;
        if (diff < -180) diff += 360;
        if (diff > 180) diff -= 360;
        return (current + diff * factor + 360) % 360;
    }

    /**
     * Pause animation
     */
    pause() {
        if (!this.isPlaying || this.isPaused) return;
        this.isPaused = true;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Resume paused animation
     */
    resume() {
        if (!this.isPlaying || !this.isPaused) return;
        this.isPaused = false;
        this.lastTimestamp = performance.now();
        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    /**
     * Stop and reset vehicle to start or remove marker
     */
    reset() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.marker) {
            this.map.removeLayer(this.marker);
            this.marker = null;
        }
        this.currentPosition = null;
    }

    /**
     * Intelligent dynamic rerouting:
     * When Dijkstra finds a new shortest route mid-trip, find the closest forward
     * point on the new road coordinates and continue animating without teleporting.
     */
    updateRouteCoordinates(newCoordinates) {
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

        // Splice route from current position forward
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
