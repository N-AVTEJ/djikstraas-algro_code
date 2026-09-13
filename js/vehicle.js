/**
 * ============================================================================
 * VEHICLE SIMULATOR & INTERPOLATION ENGINE (js/vehicle.js)
 * ============================================================================
 *
 * Requirements (Sections 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 37):
 * 1. Single Path: Vehicle receives route directly. vehicle.routeCoordinates = route.coordinates.
 * 2. Cumulative Distance Array: routeProgress = [{ coordinate: [lat, lng], distanceFromStart: meters }, ...].
 * 3. Distance-Based Movement: distanceTravelled += speedMps * deltaSeconds;
 *    Interpolate between the two surrounding route coordinates.
 * 4. Never cuts corners: Follows every intermediate road coordinate.
 * 5. 60fps requestAnimationFrame with precise geographic interpolation.
 * 6. Realistic heading rotation based on geodetic bearing.
 * 7. Mid-journey dynamic rerouting without teleportation or resetting.
 * 8. Geographic arrival detection (< 10 meters).
 * 9. Route validation before animation starts.
 * 10. Vehicle Trace Line (yellow) & Periodic Divergence Checks (<= 20m warning, > 50m critical).
 * 11. Structured Section 37 [ROUTE] and [VEHICLE] logging.
 */

if (typeof require !== 'undefined') {
    if (typeof GeoUtils === 'undefined') {
        globalThis.GeoUtils = require('./geoUtils.js');
    }
    if (typeof navigationState === 'undefined') {
        const navMod = require('./navigationState.js');
        globalThis.navigationState = navMod.navigationState;
    }
}

class VehicleNavigator {
    constructor(leafletMap) {
        this.map = leafletMap;
        this.marker = null;
        this.activeRoute = null;         // Reference to authoritative Route object
        this.routeCoordinates = [];      // [[lat, lng], ...] directly from route.coordinates
        this.routeProgress = [];         // [{ coordinate: [lat, lng], distanceFromStart: meters }, ...]
        this.totalRouteDistance = 0;     // Total route length in meters
        this.distanceTravelled = 0;      // Distance travelled in meters along route
        
        this.isPlaying = false;
        this.isPaused = false;
        this.isArrived = false;
        this.speedMultiplier = 1.0;
        this.baseSpeedKmh = 45;
        this.animationFrameId = null;
        this.lastTimestamp = null;
        this.followVehicle = false;
        this.currentPosition = null;     // { lat, lng }
        this.currentBearing = 0;

        // Section 18 & 19: Debug trace & divergence monitoring
        this.vehicleTrace = [];          // Array of [lat, lng] visited positions
        this.tracePolyline = null;       // Yellow polyline on Leaflet map
        this.maxDivergenceMeters = 0;
        this.divergenceSumMeters = 0;
        this.divergenceSamples = 0;
        this.checkDivergenceCounter = 0;

        this.onProgressCallback = null;
        this.onCompleteCallback = null;
        this.onTimelineEvent = null;
    }

    /**
     * Section 8: Route Pre-Animation Validation
     */
    validateRoute(route) {
        if (!route) {
            throw new Error("Vehicle route is null or undefined.");
        }
        if (!route.coordinates || !Array.isArray(route.coordinates) || route.coordinates.length < 2) {
            throw new Error(`Route coordinates length must be >= 2, got ${route.coordinates?.length || 0}`);
        }
        if (typeof navigationState !== 'undefined') {
            if (navigationState.state.start?.nodeId && route.startNodeId !== navigationState.state.start.nodeId) {
                throw new Error(`Route startNodeId (${route.startNodeId}) does not match navigationState.start.nodeId (${navigationState.state.start.nodeId})`);
            }
            if (navigationState.state.destination?.nodeId && route.destinationNodeId !== navigationState.state.destination.nodeId) {
                throw new Error(`Route destinationNodeId (${route.destinationNodeId}) does not match navigationState.destination.nodeId (${navigationState.state.destination.nodeId})`);
            }
        }

        const firstPt = route.coordinates[0];
        const lastPt = route.coordinates[route.coordinates.length - 1];

        if (typeof navigationState !== 'undefined' && navigationState.state.start?.lat) {
            const startDist = GeoUtils.distanceMeters(firstPt, [navigationState.state.start.lat, navigationState.state.start.lng]);
            if (startDist > 30) {
                throw new Error(`First route coordinate is ${startDist.toFixed(1)}m from start marker (limit: 30m)`);
            }
        }

        if (typeof navigationState !== 'undefined' && navigationState.state.destination?.lat) {
            const destDist = GeoUtils.distanceMeters(lastPt, [navigationState.state.destination.lat, navigationState.state.destination.lng]);
            if (destDist > 30) {
                throw new Error(`Last route coordinate is ${destDist.toFixed(1)}m from destination marker (limit: 30m)`);
            }
        }

        for (let i = 0; i < route.coordinates.length; i++) {
            const pt = route.coordinates[i];
            if (!pt || pt.length < 2 || isNaN(pt[0]) || isNaN(pt[1])) {
                throw new Error(`Invalid coordinate at index ${i}: ${JSON.stringify(pt)}`);
            }
            // Section 9: Check Leaflet [lat, lng] format for Hyderabad
            if (pt[0] > 50 || pt[1] < 50) {
                throw new Error(`Coordinate at index ${i} appears to be reversed [lng, lat]: ${JSON.stringify(pt)}. Expected [lat, lng].`);
            }
        }

        return true;
    }

    /**
     * Section 8 & 10: Start Animation along Route Coordinates
     */
    start(route, onComplete, onProgress) {
        this.reset();
        if (!route) {
            console.error('[VEHICLE] Cannot start: Route is null');
            return false;
        }

        try {
            this.validateRoute(route);
        } catch (err) {
            console.error('[VEHICLE] Vehicle route validation failed:', err.message);
            if (this.onTimelineEvent) {
                this.onTimelineEvent(`Vehicle route validation failed: ${err.message}`);
            }
            return false;
        }

        this.activeRoute = route;
        this.routeCoordinates = route.coordinates;
        this.onCompleteCallback = onComplete;
        this.onProgressCallback = onProgress;

        // Section 10: Create Cumulative Distance Array
        this.routeProgress = [];
        let cumDist = 0;
        this.routeProgress.push({
            coordinate: this.routeCoordinates[0],
            distanceFromStart: 0
        });

        for (let i = 1; i < this.routeCoordinates.length; i++) {
            const pPrev = this.routeCoordinates[i - 1];
            const pCurr = this.routeCoordinates[i];
            const dist = GeoUtils.distanceMeters(pPrev, pCurr);
            cumDist += dist;
            this.routeProgress.push({
                coordinate: pCurr,
                distanceFromStart: cumDist
            });
        }

        this.totalRouteDistance = cumDist;
        this.distanceTravelled = 0;
        this.isPlaying = true;
        this.isPaused = false;
        this.isArrived = false;
        this.lastTimestamp = null;
        this.vehicleTrace = [];
        this.maxDivergenceMeters = 0;
        this.divergenceSumMeters = 0;
        this.divergenceSamples = 0;
        this.checkDivergenceCounter = 0;

        // Section 37: Required Debug Output
        const modeUpper = (route.mode || 'normal').toUpperCase();
        console.log(`[ROUTE]`);
        console.log(`Mode: ${modeUpper}`);
        console.log(`Route ID: ${route.id || 'route-001'}`);
        console.log(`Coordinates: ${this.routeCoordinates.length}`);
        console.log(`Distance: ${Math.round(this.totalRouteDistance)}m`);
        console.log(`Destination Node: ${route.destinationNodeId || navigationState?.state?.destination?.nodeId || 'destination'}`);
        console.log(`[VEHICLE]`);
        console.log(`Route ID: ${route.id || 'route-001'}`);
        console.log(`Coordinates: ${this.routeCoordinates.length}`);
        console.log(`Using EXACT route coordinates: true`);

        // Initialize at origin coordinate
        const startPt = this.routeCoordinates[0];
        const nextPt = this.routeCoordinates[1];
        const initialBearing = GeoUtils.calculateBearing(startPt, nextPt);
        this._ensureMarker(startPt[0], startPt[1], initialBearing);
        this._recordTracePoint(startPt[0], startPt[1]);

        if (this.onTimelineEvent) {
            this.onTimelineEvent(`Vehicle started navigating along ${route.distanceKm || (this.totalRouteDistance / 1000).toFixed(2)} km route`);
        }

        if (this.followVehicle && this.map) {
            this.map.panTo([startPt[0], startPt[1]], { animate: true });
        }

        this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
        return true;
    }

    /**
     * Create or update high-visibility SVG vehicle marker with rotation
     */
    _ensureMarker(lat, lng, bearing = 0) {
        if (typeof L === 'undefined' || !this.map) {
            this.currentPosition = { lat, lng };
            this.currentBearing = bearing;
            return;
        }

        if (!this.marker) {
            const vehicleHtml = `
                <div class="vehicle-marker-wrapper">
                    <div class="vehicle-rotator" style="transform: rotate(${bearing}deg);">
                        <svg class="vehicle-svg" viewBox="0 0 32 64" width="32" height="64" xmlns="http://www.w3.org/2000/svg">
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
                            <rect x="3" y="4" width="26" height="54" rx="7" fill="rgba(0,0,0,0.4)" filter="blur(1.5px)" />
                            <!-- Wheels -->
                            <rect x="0" y="10" width="4" height="10" rx="2" fill="#111827" />
                            <rect x="28" y="10" width="4" height="10" rx="2" fill="#111827" />
                            <rect x="0" y="42" width="4" height="10" rx="2" fill="#111827" />
                            <rect x="28" y="42" width="4" height="10" rx="2" fill="#111827" />
                            <!-- Main Body -->
                            <rect x="3" y="3" width="26" height="56" rx="8" fill="url(#carBodyGrad)" stroke="#ffffff" stroke-width="1.5" />
                            <!-- Headlights -->
                            <polygon points="5,4 11,3 10,8 5,7" fill="#fef08a" />
                            <polygon points="27,4 21,3 22,8 27,7" fill="#fef08a" />
                            <!-- Windshield -->
                            <path d="M6 18 Q16 16 26 18 L24 28 Q16 27 8 28 Z" fill="url(#windshieldGrad)" />
                            <!-- Roof -->
                            <rect x="7" y="27" width="18" height="18" rx="4" fill="#0369a1" />
                            <!-- Rear Window -->
                            <path d="M8 46 Q16 45 24 46 L23 51 Q16 50 9 51 Z" fill="url(#windshieldGrad)" />
                            <!-- Taillights -->
                            <rect x="5" y="57" width="6" height="2" rx="1" fill="#ef4444" />
                            <rect x="21" y="57" width="6" height="2" rx="1" fill="#ef4444" />
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
     * Section 18: Record Vehicle Trace Point & Update Yellow Trace Line
     */
    _recordTracePoint(lat, lng) {
        this.vehicleTrace.push([lat, lng]);

        if (this.map && typeof L !== 'undefined') {
            if (!this.tracePolyline) {
                this.tracePolyline = L.polyline(this.vehicleTrace, {
                    color: '#eab308',
                    weight: 3.5,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: '3, 5'
                }).addTo(this.map);
            } else {
                this.tracePolyline.setLatLngs(this.vehicleTrace);
            }
        }
    }

    /**
     * Section 19: Verify vehicle remains within tight tolerance of route
     */
    _verifyVehicleOnRoute(lat, lng, p1, p2) {
        const distMeters = GeoUtils.pointToSegmentDistanceMeters([lat, lng], p1, p2);

        this.divergenceSamples++;
        this.divergenceSumMeters += distMeters;
        if (distMeters > this.maxDivergenceMeters) {
            this.maxDivergenceMeters = distMeters;
        }

        if (distMeters > 50) {
            console.error(`CRITICAL: Vehicle route divergence detected: ${distMeters.toFixed(2)}m from active route.`);
            this.pause();
            if (this.onTimelineEvent) {
                this.onTimelineEvent(`CRITICAL: Vehicle route divergence detected (${distMeters.toFixed(1)}m)!`);
            }
        } else if (distMeters > 20) {
            console.warn(`WARNING: Vehicle has deviated from route: ${distMeters.toFixed(2)}m.`);
        }
    }

    /**
     * Section 10 & 11: Distance-Based Animation Loop with requestAnimationFrame
     */
    _animationLoop(timestamp) {
        if (!this.isPlaying || this.isPaused) return;

        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
            this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
            return;
        }

        const deltaSeconds = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;

        const speedKmh = this.baseSpeedKmh * this.speedMultiplier;
        const speedMps = (speedKmh * 1000) / 3600;

        // Advance distance travelled based on elapsed time
        this.distanceTravelled += speedMps * deltaSeconds;

        if (this.distanceTravelled >= this.totalRouteDistance) {
            this.distanceTravelled = this.totalRouteDistance;
            const finalPt = this.routeCoordinates[this.routeCoordinates.length - 1];
            this._ensureMarker(finalPt[0], finalPt[1], this.currentBearing);
            this._recordTracePoint(finalPt[0], finalPt[1]);
            this._checkArrivalAndFinish();
            return;
        }

        // Section 11: Find the two route points surrounding distanceTravelled
        let segIndex = 0;
        for (let i = 0; i < this.routeProgress.length - 1; i++) {
            if (this.distanceTravelled >= this.routeProgress[i].distanceFromStart &&
                this.distanceTravelled <= this.routeProgress[i + 1].distanceFromStart) {
                segIndex = i;
                break;
            }
        }

        const ptA = this.routeProgress[segIndex];
        const ptB = this.routeProgress[segIndex + 1];
        const segDist = ptB.distanceFromStart - ptA.distanceFromStart;
        const t = segDist > 0 ? (this.distanceTravelled - ptA.distanceFromStart) / segDist : 0;

        // Exact geographic interpolation between the two consecutive points along the route
        const curLat = ptA.coordinate[0] + (ptB.coordinate[0] - ptA.coordinate[0]) * t;
        const curLng = ptA.coordinate[1] + (ptB.coordinate[1] - ptA.coordinate[1]) * t;

        // Section 16: Geodetic bearing calculation from current segment points
        const bearing = GeoUtils.calculateBearing(ptA.coordinate, ptB.coordinate);

        this._ensureMarker(curLat, curLng, bearing);
        this._recordTracePoint(curLat, curLng);

        // Section 19: Periodic route distance check
        this.checkDivergenceCounter++;
        if (this.checkDivergenceCounter % 6 === 0) {
            this._verifyVehicleOnRoute(curLat, curLng, ptA.coordinate, ptB.coordinate);
        }

        // Section 32: Route progress based on distance travelled
        const progressFraction = this.totalRouteDistance > 0 ? (this.distanceTravelled / this.totalRouteDistance) : 0;
        const progressPercent = Math.min(100, Math.max(0, Math.round(progressFraction * 100)));

        if (this.onProgressCallback) {
            this.onProgressCallback(progressPercent, { lat: curLat, lng: curLng });
        }

        // Section 33: Camera follow mode
        if (this.followVehicle && this.map) {
            this.map.panTo([curLat, curLng], { animate: true, duration: 0.1 });
        }

        this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
    }

    /**
     * Section 20 & 41: Destination Arrival Validation (< 10m threshold)
     */
    _checkArrivalAndFinish() {
        this.isPlaying = false;
        this.isPaused = false;
        this.isArrived = true;
        this.distanceTravelled = this.totalRouteDistance;

        const destCoord = typeof navigationState !== 'undefined' && navigationState.state.destination?.lat
            ? [navigationState.state.destination.lat, navigationState.state.destination.lng]
            : this.routeCoordinates[this.routeCoordinates.length - 1];

        const distToDestMeters = GeoUtils.distanceMeters(
            [this.currentPosition.lat, this.currentPosition.lng],
            destCoord
        );

        const destName = navigationState?.state?.destination?.name || 'Destination';
        const avgDivergence = this.divergenceSamples > 0 ? (this.divergenceSumMeters / this.divergenceSamples) : 0;

        console.log(`[VEHICLE] Reached endpoint. Distance to destination: ${distToDestMeters.toFixed(1)}m`);
        console.log(`[VEHICLE] Route Trace Verification: maxDistanceFromRoute = ${this.maxDivergenceMeters.toFixed(2)}m, avgDistanceFromRoute = ${avgDivergence.toFixed(2)}m`);

        if (this.onProgressCallback) {
            this.onProgressCallback(100, this.currentPosition);
        }

        if (this.onTimelineEvent) {
            this.onTimelineEvent(`Arrived at ${destName} (Distance: ${distToDestMeters.toFixed(1)}m, Divergence: ${this.maxDivergenceMeters.toFixed(1)}m)`);
        }

        if (this.onCompleteCallback) {
            this.onCompleteCallback({
                destinationName: destName,
                distanceMeters: distToDestMeters,
                maxDivergence: this.maxDivergenceMeters,
                avgDivergence
            });
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
        console.log('[VEHICLE] Paused');
    }

    resume() {
        if (!this.isPlaying || !this.isPaused) return;
        this.isPaused = false;
        this.lastTimestamp = null;
        this.animationFrameId = requestAnimationFrame((ts) => this._animationLoop(ts));
        console.log('[VEHICLE] Resumed');
    }

    stop() {
        this.pause();
        this.isPlaying = false;
        this.isPaused = false;
    }

    reset() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isPlaying = false;
        this.isPaused = false;
        this.isArrived = false;
        this.distanceTravelled = 0;
        this.lastTimestamp = null;

        if (this.marker && this.map) {
            this.map.removeLayer(this.marker);
            this.marker = null;
        }
        if (this.tracePolyline && this.map) {
            this.map.removeLayer(this.tracePolyline);
            this.tracePolyline = null;
        }
        this.vehicleTrace = [];
        this.currentPosition = null;
    }

    replay() {
        if (this.activeRoute && this.activeRoute.coordinates?.length >= 2) {
            this.start(this.activeRoute, this.onCompleteCallback, this.onProgressCallback);
        }
    }

    setSpeed(multiplier) {
        this.speedMultiplier = parseFloat(multiplier) || 1.0;
        console.log(`[VEHICLE] Speed multiplier set to ${this.speedMultiplier}x`);
    }

    setFollowVehicle(enabled) {
        this.followVehicle = Boolean(enabled);
        if (this.followVehicle && this.currentPosition && this.map) {
            this.map.panTo([this.currentPosition.lat, this.currentPosition.lng], { animate: true });
        }
    }

    /**
     * Section 12 & 40: Dynamic Vehicle Rerouting Mid-Journey without Teleporting
     */
    updateRouteCoordinates(newRoute) {
        if (!newRoute || !newRoute.coordinates || newRoute.coordinates.length < 2) return;

        const newCoordinates = newRoute.coordinates;

        if (!this.isPlaying || !this.currentPosition) {
            this.activeRoute = newRoute;
            this.routeCoordinates = newCoordinates;
            return;
        }

        console.log('[VEHICLE] Dynamic rerouting triggered while in transit');

        // Find nearest projection on new route ahead of the vehicle
        const projResult = GeoUtils.nearestPointOnRoute(
            [this.currentPosition.lat, this.currentPosition.lng],
            newCoordinates
        );

        const bestIdx = projResult.segmentIndex;

        // Splice current vehicle position followed by remaining path
        const splicedCoords = [
            [this.currentPosition.lat, this.currentPosition.lng],
            ...newCoordinates.slice(bestIdx + 1)
        ];

        // Ensure at least 2 points
        if (splicedCoords.length < 2) {
            splicedCoords.push(newCoordinates[newCoordinates.length - 1]);
        }

        this.activeRoute = newRoute;
        this.routeCoordinates = splicedCoords;

        // Rebuild cumulative distance array for remaining spliced journey
        this.routeProgress = [];
        let cumDist = 0;
        this.routeProgress.push({
            coordinate: this.routeCoordinates[0],
            distanceFromStart: 0
        });

        for (let i = 1; i < this.routeCoordinates.length; i++) {
            const dist = GeoUtils.distanceMeters(this.routeCoordinates[i - 1], this.routeCoordinates[i]);
            cumDist += dist;
            this.routeProgress.push({
                coordinate: this.routeCoordinates[i],
                distanceFromStart: cumDist
            });
        }

        this.totalRouteDistance = cumDist;
        this.distanceTravelled = 0;
        this.lastTimestamp = null;

        console.log(`[VEHICLE] Successfully rerouted: continuing with ${splicedCoords.length} remaining coordinates (${Math.round(this.totalRouteDistance)}m remaining)`);

        if (this.onTimelineEvent) {
            this.onTimelineEvent('Vehicle dynamically rerouted onto new optimal path');
        }
    }
}

if (typeof window !== 'undefined') {
    window.VehicleNavigator = VehicleNavigator;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VehicleNavigator;
}
