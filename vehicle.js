/**
 * ============================================================================
 * VEHICLE SIMULATOR & ANIMATION CONTROLLER
 * ============================================================================
 * 
 * Animates a vehicle (🚗) along geographic coordinates with smooth frame
 * interpolation, bearing/heading rotation, play/pause/reset controls, and
 * intelligent dynamic rerouting when traffic conditions alter the shortest path.
 */

class VehicleSimulator {
    constructor(leafletMap) {
        this.map = leafletMap;
        this.marker = null;
        this.path = [];              // Array of { lat, lng, id, name }
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;     // 0.0 to 1.0 along current segment
        this.isPlaying = false;
        this.isPaused = false;
        this.speed = 1.0;            // Speed multiplier
        this.animationFrameId = null;
        this.lastTimestamp = null;
        this.onCompleteCallback = null;
        this.onProgressCallback = null;
        this.currentPosition = null; // { lat, lng }
    }

    /**
     * Calculate heading bearing angle in degrees between two lat/lng points
     */
    calculateBearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        let brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    /**
     * Create or update the Leaflet vehicle marker
     */
    _ensureMarker(lat, lng, heading = 0) {
        if (!this.marker) {
            const vehicleIcon = L.divIcon({
                className: 'custom-vehicle-icon-wrapper',
                html: `
                    <div class="vehicle-marker-pulse"></div>
                    <div class="vehicle-marker-inner" style="transform: rotate(${heading}deg);">
                        🚗
                    </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            this.marker = L.marker([lat, lng], { icon: vehicleIcon, zIndexOffset: 1000 }).addTo(this.map);
        } else {
            this.marker.setLatLng([lat, lng]);
            const inner = this.marker.getElement()?.querySelector('.vehicle-marker-inner');
            if (inner) {
                inner.style.transform = `rotate(${heading}deg)`;
            }
        }
    }

    /**
     * Start vehicle animation from the beginning of path
     */
    start(pathNodes, onComplete, onProgress) {
        if (!pathNodes || pathNodes.length < 2) return;

        this.reset();
        this.path = pathNodes;
        this.onCompleteCallback = onComplete;
        this.onProgressCallback = onProgress;
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        this.isPlaying = true;
        this.isPaused = false;

        const startNode = this.path[0];
        const nextNode = this.path[1];
        const initialHeading = this.calculateBearing(startNode.lat, startNode.lng, nextNode.lat, nextNode.lng);

        this.currentPosition = { lat: startNode.lat, lng: startNode.lng };
        this._ensureMarker(startNode.lat, startNode.lng, initialHeading);

        this.lastTimestamp = performance.now();
        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    /**
     * Pause vehicle animation
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
     * Resume vehicle animation
     */
    resume() {
        if (!this.isPlaying || !this.isPaused) return;
        this.isPaused = false;
        this.lastTimestamp = performance.now();
        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }

    /**
     * Reset vehicle and remove marker from map
     */
    reset() {
        this.isPlaying = false;
        this.isPaused = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.marker) {
            this.map.removeLayer(this.marker);
            this.marker = null;
        }
        this.path = [];
        this.currentSegmentIndex = 0;
        this.segmentProgress = 0;
        this.currentPosition = null;
    }

    /**
     * Set speed multiplier (e.g. 0.5, 1.0, 2.0, 3.0)
     */
    setSpeed(speedVal) {
        this.speed = Math.max(0.2, Math.min(5.0, speedVal));
    }

    /**
     * Dynamic Rerouting:
     * When traffic light updates cause the Dijkstra path to change while the
     * vehicle is active, seamlessly reroute to the new path from the vehicle's
     * current nearest waypoint.
     */
    updatePath(newPathNodes) {
        if (!this.isPlaying || !newPathNodes || newPathNodes.length < 2) return;

        // Find closest forward node in new path to vehicle's current position
        const currentPos = this.currentPosition || { lat: this.path[this.currentSegmentIndex]?.lat, lng: this.path[this.currentSegmentIndex]?.lng };
        if (!currentPos.lat) return;

        let closestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < newPathNodes.length; i++) {
            const node = newPathNodes[i];
            const dLat = node.lat - currentPos.lat;
            const dLng = node.lng - currentPos.lng;
            const dist = dLat * dLat + dLng * dLng;
            if (dist < minDistance) {
                minDistance = dist;
                closestIndex = i;
            }
        }

        // Seamlessly update path
        this.path = newPathNodes;
        this.currentSegmentIndex = Math.min(closestIndex, newPathNodes.length - 2);
        this.segmentProgress = 0;
    }

    /**
     * Main requestAnimationFrame animation loop
     */
    _animate(timestamp) {
        if (!this.isPlaying || this.isPaused) return;

        const delta = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        if (this.currentSegmentIndex >= this.path.length - 1) {
            // Reached destination!
            this.isPlaying = false;
            const destNode = this.path[this.path.length - 1];
            this._ensureMarker(destNode.lat, destNode.lng);
            if (this.onCompleteCallback) {
                this.onCompleteCallback();
            }
            return;
        }

        const p1 = this.path[this.currentSegmentIndex];
        const p2 = this.path[this.currentSegmentIndex + 1];

        // Base segment duration ~1200ms per node step, adjusted by speed
        const segmentDurationMs = 1400 / this.speed;
        this.segmentProgress += delta / segmentDurationMs;

        if (this.segmentProgress >= 1.0) {
            this.segmentProgress = 0;
            this.currentSegmentIndex++;
            if (this.currentSegmentIndex >= this.path.length - 1) {
                // Done
                this._animate(timestamp);
                return;
            }
        }

        // Linear interpolation between p1 and p2
        const t = Math.min(1.0, this.segmentProgress);
        const lat = p1.lat + (p2.lat - p1.lat) * t;
        const lng = p1.lng + (p2.lng - p1.lng) * t;
        const heading = this.calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);

        this.currentPosition = { lat, lng };
        this._ensureMarker(lat, lng, heading);

        if (this.onProgressCallback) {
            this.onProgressCallback({
                segmentIndex: this.currentSegmentIndex,
                totalSegments: this.path.length - 1,
                currentNode: p1,
                nextNode: p2,
                progress: t
            });
        }

        this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    }
}
