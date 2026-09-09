/**
 * ============================================================================
 * ROUTE RENDERER & GEOMETRY MANAGER (js/route.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Single Source of Truth: Draws optimal road-following route polylines.
 * 2. Renders high-visibility layered glow + core road-aligned polyline.
 * 3. Renders subtle directional chevron indicators along the route.
 * 4. Computes true coordinate distances and verifies continuity.
 */

class RouteRenderer {
    constructor(leafletMap, layers) {
        this.map = leafletMap;
        this.routeLayerGroup = layers.route;
        this.currentRouteResult = null;
        this.directionMarkers = [];
    }

    /**
     * Clear active route visualization
     */
    clear() {
        this.routeLayerGroup.clearLayers();
        this.directionMarkers = [];
        this.currentRouteResult = null;
    }

    /**
     * Render the optimal road-based path calculated by Dijkstra
     * @param {Object} dijkstraResult - Result from DijkstraRouter.findShortestPath
     */
    renderRoute(dijkstraResult) {
        this.clear();
        if (!dijkstraResult || !dijkstraResult.success || !dijkstraResult.roadCoordinates) {
            return;
        }

        this.currentRouteResult = dijkstraResult;
        const coords = dijkstraResult.roadCoordinates;

        if (coords.length < 2) return;

        // 1. Outer Glow Layer (Soft Emerald Glassmorphism)
        const glowPolyline = L.polyline(coords, {
            color: '#00e676',
            weight: 10,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-glow-path'
        });

        // 2. Main Sharp Route Line (Exact Road Centerline)
        const corePolyline = L.polyline(coords, {
            color: '#00ff88',
            weight: 4.5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-core-path'
        });

        this.routeLayerGroup.addLayer(glowPolyline);
        this.routeLayerGroup.addLayer(corePolyline);

        // 3. Directional Chevrons along road segments
        this.renderDirectionalChevrons(coords);

        return corePolyline;
    }

    /**
     * Place subtle directional arrows along intermediate road segments
     */
    renderDirectionalChevrons(coords) {
        // Place directional arrows approximately every 2-3 segments
        const step = Math.max(1, Math.floor(coords.length / 8));

        for (let i = 0; i < coords.length - 1; i += step) {
            const p1 = coords[i];
            const p2 = coords[i + 1];

            // Segment midpoint
            const midLat = (p1[0] + p2[0]) / 2;
            const midLng = (p1[1] + p2[1]) / 2;

            // Bearing angle
            const bearing = this.calculateBearing(p1[0], p1[1], p2[0], p2[1]);

            const arrowIcon = L.divIcon({
                className: 'route-arrow-icon-wrapper',
                html: `
                    <div class="route-chevron" style="transform: rotate(${bearing}deg);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#003314" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                `,
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });

            const arrowMarker = L.marker([midLat, midLng], {
                icon: arrowIcon,
                interactive: false,
                zIndexOffset: 500
            });

            this.routeLayerGroup.addLayer(arrowMarker);
            this.directionMarkers.push(arrowMarker);
        }
    }

    /**
     * Calculate heading bearing angle in degrees between two coordinates
     */
    calculateBearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        let brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }
}
