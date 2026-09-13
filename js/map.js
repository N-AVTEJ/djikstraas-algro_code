/**
 * ============================================================================
 * LEAFLET MAP MANAGER & GEOGRAPHIC LAYERS (js/map.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Base Map: Standard Leaflet OpenStreetMap tiles (bright, clean, readable, no API key).
 * 2. Clean Navigation First: By default, hides internal graph nodes and artificial edges.
 *    The OpenStreetMap basemap provides the primary visual representation of the city!
 * 3. Overlays:
 *    - Start Marker (Green pin) & Destination Marker (Red pin)
 *    - Normal Route (Subtle blue/gray polyline)
 *    - Dijkstra Fastest Route (Vivid emerald green polyline with glow)
 *    - Blocked Roads (Crimson dashed hazard line with 🚧 badge)
 *    - Active Shortcuts (Violet / Cyan express corridor)
 *    - Traffic Light Signals (3-state SVG signals: Green, Yellow, Red)
 *    - Snap-to-Road ripple indicator
 * 4. Graph Visualization: Toggleable overlay for students/evaluators wanting to view raw graph nodes.
 */

class LeafletMapManager {
    constructor(containerId, graph) {
        this.containerId = containerId;
        this.graph = graph;
        this.map = null;

        // Structured layer groups for strict z-index control
        this.layers = {
            baseRoads: null,
            shortcuts: null,
            blockedRoads: null,
            graphOverlay: null,
            trafficLights: null,
            normalRoute: null,
            dijkstraRoute: null,
            markers: null,
            snapIndicator: null
        };

        this.startNodeId = null;
        this.endNodeId = null;
        this.startMarker = null;
        this.endMarker = null;
        this.showGraphOverlay = false; // HIDE by default for clean navigation experience!

        // Event callbacks
        this.onMapClickCallback = null;
        this.onNodeClickCallback = null;
        this.onEdgeClickCallback = null;

        this.initMap();
        this.renderRoadNetwork();
    }

    /**
     * Initialize Leaflet Map centered on Central Hyderabad (Hussain Sagar & Secretariat)
     */
    initMap() {
        const hyderabadCenter = [17.4225, 78.4720];
        const defaultZoom = 14;

        this.map = L.map(this.containerId, {
            center: hyderabadCenter,
            zoom: defaultZoom,
            minZoom: 11,
            maxZoom: 19,
            zoomControl: false
        });

        // Sleek top-right zoom control
        L.control.zoom({ position: 'topright' }).addTo(this.map);

        // Standard OpenStreetMap Tiles (Fast, bright, reliable, NO API KEY REQUIRED)
        const osmTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            className: 'osm-bright-tiles'
        });
        osmTileLayer.addTo(this.map);

        // Dedicated Layer Groups
        this.layers.baseRoads = L.layerGroup().addTo(this.map);
        this.layers.shortcuts = L.layerGroup().addTo(this.map);
        this.layers.blockedRoads = L.layerGroup().addTo(this.map);
        this.layers.graphOverlay = L.layerGroup().addTo(this.map);
        this.layers.trafficLights = L.layerGroup().addTo(this.map);
        this.layers.normalRoute = L.layerGroup().addTo(this.map);
        this.layers.dijkstraRoute = L.layerGroup().addTo(this.map);
        this.layers.markers = L.layerGroup().addTo(this.map);
        this.layers.snapIndicator = L.layerGroup().addTo(this.map);

        // Natural map click interaction
        this.map.on('click', (e) => {
            if (this.onMapClickCallback) {
                this.onMapClickCallback(e.latlng);
            }
        });
    }

    /**
     * Render dynamic road states: Blocked Roads, Shortcuts, Traffic Lights, and optional Graph Overlay
     */
    renderRoadNetwork() {
        this.layers.baseRoads.clearLayers();
        this.layers.shortcuts.clearLayers();
        this.layers.blockedRoads.clearLayers();
        this.layers.trafficLights.clearLayers();
        this.layers.graphOverlay.clearLayers();

        const renderedEdges = new Set();

        for (const [, edge] of this.graph.edges) {
            const pairKey = [edge.from, edge.to].sort().join('--');
            if (renderedEdges.has(pairKey)) continue;
            renderedEdges.add(pairKey);

            const coords = edge.coordinates;

            if (edge.blocked) {
                // 1. Blocked Road: Hazard Red Dashed Line
                const polyline = L.polyline(coords, {
                    color: '#ef4444',
                    weight: 6,
                    opacity: 0.9,
                    dashArray: '8, 8',
                    lineCap: 'round',
                    className: 'road-blocked-polyline'
                });
                polyline.bindTooltip(`🚫 <b>BLOCKED ROAD:</b> ${edge.name}<br>Weight: ∞ (Impassable)`, {
                    className: 'clean-leaflet-tooltip',
                    sticky: true
                });
                polyline.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.blockedRoads.addLayer(polyline);

            } else if (edge.shortcut || edge.roadType === 'shortcut') {
                // 2. Express Shortcut: Subtle Violet/Teal line
                const polyline = L.polyline(coords, {
                    color: '#8b5cf6',
                    weight: 4.5,
                    opacity: 0.85,
                    dashArray: '4, 6',
                    lineCap: 'round',
                    className: 'road-shortcut-polyline'
                });
                polyline.bindTooltip(`⚡ <b>EXPRESS SHORTCUT:</b> ${edge.name}<br>Speed: 65 km/h (Reduced Travel Time)`, {
                    className: 'clean-leaflet-tooltip',
                    sticky: true
                });
                polyline.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.shortcuts.addLayer(polyline);

            } else if (this.showGraphOverlay) {
                // 3. Normal Road Edges (ONLY shown when user explicitly enables "Show Graph")
                const polyline = L.polyline(coords, {
                    color: '#0284c7',
                    weight: 3,
                    opacity: 0.6,
                    lineCap: 'round'
                });
                polyline.bindTooltip(`🛣️ ${edge.name} (${(edge.distanceMeters / 1000).toFixed(2)} km)`, {
                    className: 'clean-leaflet-tooltip',
                    sticky: true
                });
                polyline.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.baseRoads.addLayer(polyline);
            }
        }

        // 4. Render Traffic Light Signals
        for (const [, node] of this.graph.nodes) {
            if (node.trafficLight || node.trafficSignal) {
                const signal = node.trafficSignal || this.graph.roadNetwork.signals?.[node.trafficSignalId];
                const state = (signal ? signal.state : (node.trafficState || 'YELLOW')).toUpperCase();

                const isGreen = state === 'GREEN';
                const isYellow = state === 'YELLOW';
                const isRed = state === 'RED';
                const delayText = isRed ? '+60s' : (isYellow ? '+20s' : '0s');

                const trafficHtml = `
                    <div class="traffic-signal-box state-${state.toLowerCase()}">
                        <div class="traffic-housing">
                            <div class="traffic-light-lamp red ${isRed ? 'active' : ''}"></div>
                            <div class="traffic-light-lamp yellow ${isYellow ? 'active' : ''}"></div>
                            <div class="traffic-light-lamp green ${isGreen ? 'active' : ''}"></div>
                        </div>
                        <div class="traffic-delay-badge">${delayText}</div>
                    </div>
                `;

                const trafficIcon = L.divIcon({
                    className: 'custom-traffic-icon-wrap',
                    html: trafficHtml,
                    iconSize: [26, 48],
                    iconAnchor: [13, 24]
                });

                const lightMarker = L.marker([node.lat, node.lng], {
                    icon: trafficIcon,
                    zIndexOffset: 850
                });

                lightMarker.bindTooltip(`🚦 <b>Traffic Light:</b> ${node.name}<br>Status: <b>${state}</b> (Delay: ${delayText})`, {
                    className: 'clean-leaflet-tooltip'
                });

                lightMarker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onNodeClickCallback) this.onNodeClickCallback(node);
                });

                this.layers.trafficLights.addLayer(lightMarker);
            }
        }

        // 5. Render Graph Nodes Overlay (ONLY when "Show Graph" is toggled ON)
        if (this.showGraphOverlay) {
            for (const [, node] of this.graph.nodes) {
                if (node.id === this.startNodeId || node.id === this.endNodeId) continue;

                const nodeMarker = L.circleMarker([node.lat, node.lng], {
                    radius: 5,
                    fillColor: node.blocked ? '#ef4444' : '#0284c7',
                    color: '#ffffff',
                    weight: 1.8,
                    opacity: 0.9,
                    fillOpacity: 0.85
                });

                nodeMarker.bindTooltip(`📍 <b>${node.name}</b><br>Node ID: <code>${node.id}</code>`, {
                    className: 'clean-leaflet-tooltip'
                });

                nodeMarker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onNodeClickCallback) this.onNodeClickCallback(node);
                });

                this.layers.graphOverlay.addLayer(nodeMarker);
            }
        }
    }

    /**
     * Show animated Snap-to-Road ripple indicator at the clicked location
     */
    showSnapIndicator(clickLat, clickLng, snapLat, snapLng) {
        this.layers.snapIndicator.clearLayers();

        // 1. Ripple pulse at click point
        const ripple = L.circleMarker([clickLat, clickLng], {
            radius: 12,
            color: '#00e676',
            weight: 2,
            opacity: 0.9,
            fillColor: '#00e676',
            fillOpacity: 0.2,
            className: 'snap-pulse-circle'
        });

        // 2. Dashed guide line to snapped road position
        const guideLine = L.polyline([[clickLat, clickLng], [snapLat, snapLng]], {
            color: '#00e676',
            weight: 2,
            dashArray: '3, 4',
            opacity: 0.8
        });

        // 3. Dot at snapped position
        const snappedDot = L.circleMarker([snapLat, snapLng], {
            radius: 4,
            color: '#ffffff',
            weight: 2,
            fillColor: '#00e676',
            fillOpacity: 1
        });

        this.layers.snapIndicator.addLayer(ripple);
        this.layers.snapIndicator.addLayer(guideLine);
        this.layers.snapIndicator.addLayer(snappedDot);

        // Auto remove after 1.5 seconds
        setTimeout(() => {
            this.layers.snapIndicator.clearLayers();
        }, 1500);
    }

    /**
     * Set Start Point Marker (Green Pin)
     */
    setStartMarker(node, snappedLat = null, snappedLng = null) {
        const lat = snappedLat !== null ? snappedLat : node.lat;
        const lng = snappedLng !== null ? snappedLng : node.lng;

        this.startNodeId = node.id;

        if (this.startMarker) {
            this.layers.markers.removeLayer(this.startMarker);
        }

        const startIconHtml = `
            <div class="nav-endpoint-marker start-marker">
                <div class="marker-pin green">
                    <span class="pin-icon">🟢</span>
                </div>
                <div class="marker-label">START</div>
            </div>
        `;

        const startIcon = L.divIcon({
            className: 'custom-endpoint-icon',
            html: startIconHtml,
            iconSize: [40, 50],
            iconAnchor: [20, 48],
            popupAnchor: [0, -45]
        });

        this.startMarker = L.marker([lat, lng], { icon: startIcon, zIndexOffset: 1200 });
        this.startMarker.bindPopup(`<b>START POINT:</b><br>${node.name}`, { className: 'clean-leaflet-popup' });
        this.layers.markers.addLayer(this.startMarker);

        this.renderRoadNetwork();
    }

    /**
     * Set Destination Point Marker (Red Pin)
     */
    setEndMarker(node, snappedLat = null, snappedLng = null) {
        const lat = snappedLat !== null ? snappedLat : node.lat;
        const lng = snappedLng !== null ? snappedLng : node.lng;

        this.endNodeId = node.id;

        if (this.endMarker) {
            this.layers.markers.removeLayer(this.endMarker);
        }

        const endIconHtml = `
            <div class="nav-endpoint-marker end-marker">
                <div class="marker-pin red">
                    <span class="pin-icon">🔴</span>
                </div>
                <div class="marker-label">DESTINATION</div>
            </div>
        `;

        const endIcon = L.divIcon({
            className: 'custom-endpoint-icon',
            html: endIconHtml,
            iconSize: [40, 50],
            iconAnchor: [20, 48],
            popupAnchor: [0, -45]
        });

        this.endMarker = L.marker([lat, lng], { icon: endIcon, zIndexOffset: 1200 });
        this.endMarker.bindPopup(`<b>DESTINATION:</b><br>${node.name}`, { className: 'clean-leaflet-popup' });
        this.layers.markers.addLayer(this.endMarker);

        this.renderRoadNetwork();
    }

    clearMarkers() {
        if (this.startMarker) {
            this.layers.markers.removeLayer(this.startMarker);
            this.startMarker = null;
        }
        if (this.endMarker) {
            this.layers.markers.removeLayer(this.endMarker);
            this.endMarker = null;
        }
        this.startNodeId = null;
        this.endNodeId = null;
        this.renderRoadNetwork();
    }

    /**
     * Render Routes:
     * - mode 'normal': renders subtle blue polyline
     * - mode 'dijkstra': renders vivid green polyline
     * - mode 'compare': renders BOTH simultaneously!
     */
    renderRoutes(routesResult, activeMode = 'dijkstra') {
        this.layers.normalRoute.clearLayers();
        this.layers.dijkstraRoute.clearLayers();

        if (!routesResult) return;

        const normal = routesResult.normal;
        const dijkstra = routesResult.dijkstra;

        // Render Normal Route (Subtle Blue Polyline)
        if (normal && normal.success && normal.coordinates && (activeMode === 'normal' || activeMode === 'compare')) {
            const normalPolyline = L.polyline(normal.coordinates, {
                color: '#3b82f6',
                weight: activeMode === 'compare' ? 5 : 5.5,
                opacity: activeMode === 'compare' ? 0.75 : 0.9,
                dashArray: activeMode === 'compare' ? '6, 6' : undefined,
                lineCap: 'round',
                lineJoin: 'round',
                className: 'route-normal-polyline'
            });
            normalPolyline.bindTooltip(`<b>Normal Route:</b> ${normal.totalDistanceKm} km | ~${normal.estimatedTimeMin} min`, {
                className: 'clean-leaflet-tooltip',
                sticky: true
            });
            this.layers.normalRoute.addLayer(normalPolyline);
        }

        // Render Dijkstra Fastest Route (Vivid Emerald Green Polyline with Glow)
        if (dijkstra && dijkstra.success && dijkstra.coordinates && (activeMode === 'dijkstra' || activeMode === 'compare')) {
            // Glow layer
            const glowPolyline = L.polyline(dijkstra.coordinates, {
                color: '#10b981',
                weight: 10,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round'
            });

            // Core line
            const corePolyline = L.polyline(dijkstra.coordinates, {
                color: '#059669',
                weight: 5.5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
                className: 'route-dijkstra-polyline'
            });
            corePolyline.bindTooltip(`⚡ <b>Dijkstra Fastest:</b> ${dijkstra.totalDistanceKm} km | ~${dijkstra.estimatedTimeMin} min`, {
                className: 'clean-leaflet-tooltip',
                sticky: true
            });

            this.layers.dijkstraRoute.addLayer(glowPolyline);
            this.layers.dijkstraRoute.addLayer(corePolyline);
        }
    }

    clearRoutes() {
        this.layers.normalRoute.clearLayers();
        this.layers.dijkstraRoute.clearLayers();
    }

    /**
     * Smoothly fit map viewport to route coordinates
     */
    fitRoute(coordinates) {
        if (!coordinates || coordinates.length < 2) return;
        const bounds = L.latLngBounds(coordinates);
        this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }

    setGraphOverlayVisibility(show) {
        this.showGraphOverlay = Boolean(show);
        this.renderRoadNetwork();
    }
}

if (typeof window !== 'undefined') {
    window.LeafletMapManager = LeafletMapManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LeafletMapManager;
}
