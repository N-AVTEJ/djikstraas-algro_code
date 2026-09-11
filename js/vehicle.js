/**
 * ============================================================================
 * VEHICLE SIMULATOR & INTERPOLATION ENGINE (js/vehicle.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Animates a sleek top-down SVG vehicle along exact road coordinates.
 * 2. Uses requestAnimationFrame for 60fps smooth geographical interpolation.
 * 3. Rotates according to road bearing heading.
 * 4. Controls: Start, Pause, Resume, Reset, Replay.
 * 5. Speeds: 0.5x, 1.0x, 2.0x, 4.0x.
 * 6. "Follow Vehicle" map panning.
 * 7. Live Route Progress tracking.
 * 8. Seamless dynamic rerouting mid-journey without jumping back to origin.
 * 9. Navigation timeline logging.
 */

class VehicleNavigator {
    constructor(leafletMap) {
        this.map = leafletMap;
        this.marker = null;
        this.coordinates = [];       // [[lat, lng], ...]
        this.currentSegmentIndex = 0; // Index in coordinates
        this.segmentProgress = 0;     // 0.0 to 1.0 along current segment
        this.isPlaying = false;
        this.isPaused = false;
        this.speedMultiplier = 1.0;
        this.baseSpeedKmh = 50;
        this.animationFrameId = null;
        this.lastTimestamp = null;
        this.followVehicle = false;
        this.currentPosition = null;  // { lat, lng }
        this.currentBearing = 0;

        this.onProgressCallback = null; // callback(percent, currentCoord)
        this.onCompleteCallback = null;
        this.onTimelineEvent = null;    // callback(message)
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
                <div class="vehicle-marker-wrapper">
                    <div class="vehicle-rotator" style="transform: rotate(${bearing}deg);">
                        <svg class="vehicle-svg" viewBox="0 0 32 64" width="26" height="52" xmlns="http://www.w3.org/2000/svg">
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
                            <rect x="3" y="4" width="26" height="54" rx="7" fill="rgba(0,0,0,0.35)" filter="blur(1px)" />
                            <!-- Wheels -->
                            <rect x="0" y="10" width="4" height="10" rx="2" fill="#111827" />
                            <rect x="28" y="10" width="4" height="10" rx="2" fill="#111827" />
                            <rect x="0" y="42" width="4" height="10" rx="2" fill="#111827" />
                            <rect x="28" y="42" width="4" height="10" rx="2" fill="#111827" />
                            <!-- Main Body -->
                            <rect x="3" y="3" width="26" height="56" rx="8" fill="url(#carBodyGrad)" stroke="#ffffff" stroke-width="1" />
                            <!-- Headlights -->
                            <polygon points="5,4 10,3 9,7 5,6" fill="#fef08a" />
                            <polygon points="27,4 22,3 23,7 27,6" fill="#fef08a" />
                            <!-- Windshield -->
                            <path d="M6 18 Q16 16 26 18 L24 28 Q16 27 8 28 Z" fill="url(#windshieldGrad)" />
                            <!-- Roof -->
                            <rect x="7" y="27" width="18" height="18" rx="4" fill="#0369a1" />
                            <!-- Rear Window -->
                            <path d="M8 46 Q16 45 24 46 L23 51 Q16 50 9 51 Z" fill="url(#windshieldGrad)" />
                            <!-- Taillights -->
                            <rect x="5" y="57" width="5" height="2" rx="1" fill="#ef4444" />
                            <rect x="22" y="57" width="5" height="2" rx="1" fill="#ef4444" />
                        </svg>
                    </div>
                </div>
            `;

            const vehicleIcon = L.divIcon({
                className: 'custom-vehicle-div-icon',
                html: vehicleHtml,
                iconSize: [32, 64],
                iconAnchor: [16, 32]
            });

            this.marker = L.marker([lat, lng], {
                icon: vehicleIcon,
                zIndexOffset: 1200
            }).addTo(this.map);
        } else {
            this.marker.setLatLng([lat, lng]);
            const rotator = this.marker.getElement()?.querySelector('.vehicle-rotator');
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
    start(coordinates, onComplete, onProgress) {
        this.reset();
        if (!coordinates || coordinates.length < 2) return;

        this.coordinates = coordinates;
        this.onCompleteCallback = onComplete;
        this.onProgressCallback = onProgress;

        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        this.isPlaying = true;
        this.isPaused = false;
        this.lastTimestamp = null;

        // Position at origin
        const start = coordinates[0];
        const next = coordinates[1];
        const initialBearing = VehicleNavigator.calculateBearing(start[0], start[1], next[0], next[1]);
        this._ensureMarker(start[0], start[1], initialBearing);

        if (this.onTimelineEvent) {
            this.onTimelineEvent('Vehicle started navigation along route geometry');
        }

        if (this.followVehicle) {
            this.map.panTo([start[0], start[1]], { animate: true });
        }

        this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
    }

    /**
     * 60fps Animation Loop with distance-proportional movement
     */
    _animationLoop(timestamp) {
        if (!this.isPlaying || this.isPaused) return;

        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
            this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
            return;
        }

        const deltaSeconds = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;

        if (this.currentSegmentIndex >= this.coordinates.length - 1) {
            this._finish();
            return;
        }

        const p1 = this.coordinates[this.currentSegmentIndex];
        const p2 = this.coordinates[this.currentSegmentIndex + 1];

        const segDistanceKm = VehicleNavigator.calculateDistance(p1[0], p1[1], p2[0], p2[1]);
        const speedKmh = this.baseSpeedKmh * this.speedMultiplier;
        const segmentDurationSec = Math.max(0.12, (segDistanceKm / speedKmh) * 3600);

        this.segmentProgress += deltaSeconds / segmentDurationSec;

        if (this.segmentProgress >= 1.0) {
            this.currentSegmentIndex++;
            this.segmentProgress = 0;

            if (this.currentSegmentIndex >= this.coordinates.length - 1) {
                const end = this.coordinates[this.coordinates.length - 1];
                this._ensureMarker(end[0], end[1], this.currentBearing);
                this._finish();
                return;
            }
        }

        // Interpolate position along current segment
        const curP1 = this.coordinates[this.currentSegmentIndex];
        const curP2 = this.coordinates[this.currentSegmentIndex + 1];

        const curLat = curP1[0] + (curP2[0] - curP1[0]) * this.segmentProgress;
        const curLng = curP1[1] + (curP2[1] - curP1[1]) * this.segmentProgress;
        const bearing = VehicleNavigator.calculateBearing(curP1[0], curP1[1], curP2[0], curP2[1]);

        this._ensureMarker(curLat, curLng, bearing);

        // Calculate total route progress percentage
        const totalSegments = this.coordinates.length - 1;
        const rawProgress = (this.currentSegmentIndex + this.segmentProgress) / totalSegments;
        const progressPercent = Math.min(100, Math.max(0, Math.round(rawProgress * 100)));

        if (this.onProgressCallback) {
            this.onProgressCallback(progressPercent, { lat: curLat, lng: curLng });
        }

        // Smooth follow camera
        if (this.followVehicle && Math.random() < 0.2) {
            this.map.panTo([curLat, curLng], { animate: true, duration: 0.2 });
        }

        this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
    }

    _finish() {
        this.isPlaying = false;
        this.isPaused = false;
        this.segmentProgress = 1.0;

        if (this.onProgressCallback) {
            this.onProgressCallback(100, this.currentPosition);
        }

        if (this.onTimelineEvent) {
            this.onTimelineEvent('Vehicle reached destination successfully');
        }

        if (this.onCompleteCallback) {
            this.onCompleteCallback();
        }
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPaused = true;
        this.lastTimestamp = null;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    resume() {
        if (!this.isPlaying || !this.isPaused) return;
        this.isPaused = false;
        this.lastTimestamp = null;
        this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
    }

    reset() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isPlaying = false;
        this.isPaused = false;
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        this.lastTimestamp = null;

        if (this.marker) {
            this.map.removeLayer(this.marker);
            this.marker = null;
        }
        this.currentPosition = null;
    }

    replay() {
        if (this.coordinates && this.coordinates.length >= 2) {
            this.start(this.coordinates, this.onCompleteCallback, this.onProgressCallback);
        }
    }

    setSpeed(speedVal) {
        this.speedMultiplier = parseFloat(speedVal) || 1.0;
    }

    setFollowVehicle(enabled) {
        this.followVehicle = Boolean(enabled);
        if (this.followVehicle && this.currentPosition) {
            this.map.panTo([this.currentPosition.lat, this.currentPosition.lng], { animate: true });
        }
    }

    /**
     * Seamless mid-route update (Dynamic Reroute):
     * Connects current vehicle location to the nearest point on the newly calculated path!
     */
    updateRouteCoordinates(newCoordinates) {
        if (!newCoordinates || newCoordinates.length < 2) return;

        if (!this.isPlaying || !this.currentPosition) {
            this.coordinates = newCoordinates;
            return;
        }

        // Find nearest coordinate in the new route ahead
        let bestIdx = 0;
        let minDist = Infinity;

        for (let i = 0; i < newCoordinates.length; i++) {
            const dist = VehicleNavigator.calculateDistance(
                this.currentPosition.lat, this.currentPosition.lng,
                newCoordinates[i][0], newCoordinates[i][1]
            );
            if (dist < minDist) {
                minDist = dist;
                bestIdx = i;
            }
        }

        // Splice current vehicle position followed by remaining path
        const remainingCoords = [
            [this.currentPosition.lat, this.currentPosition.lng],
            ...newCoordinates.slice(bestIdx)
        ];

        this.coordinates = remainingCoords;
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        this.lastTimestamp = null;

        if (this.onTimelineEvent) {
            this.onTimelineEvent('Vehicle dynamically rerouted onto new optimal path');
        }
    }
}
