/**
 * ============================================================================
 * LEAFLET MAP MANAGER & GEOGRAPHIC OVERLAY ENGINE (js/map.js)
 * ============================================================================
 *
 * Requirements (Sections 21, 24, 31, 33, 37, 38, 47, 48, 55):
 * 1. Single Source of Truth: All lines and markers read from authoritative roadNetwork.
 * 2. Visual Destination Marker: Prominent, high-visibility red marker labeled with place name.
 * 3. Route Anchors Debug Overlay: Shows START, DESTINATION, ROUTE START, ROUTE END.
 * 4. Mode-dependent route display (Dijkstra-only, Normal-only, or Compare both).
 * 5. Official OpenStreetMap tile layer with visible attribution and configurable provider.
 * 6. Smooth bounds fitting without fighting manual pan/zoom.
 */

class LeafletMapManager {
    constructor(containerId, graph) {
        this.containerId = containerId;
        this.graph = graph;
        this.map = null;

        // Structured layer groups with source ID traceability
        this.layers = {
            baseRoads: null,
            shortcuts: null,
            blockedRoads: null,
            graphOverlay: null,
            trafficLights: null,
            normalRoute: null,
            dijkstraRoute: null,
            markers: null,
            debugAnchors: null,
            snapIndicator: null
        };

        this.startMarker = null;
        this.destMarker = null;
        this.showGraphOverlay = false;
        this.showRouteAnchors = false;

        // Event callbacks
        this.onMapClickCallback = null;
        this.onNodeClickCallback = null;
        this.onEdgeClickCallback = null;

        this.initMap();
        this.renderRoadNetwork();
    }

    /**
     * Section 55: Initialize Leaflet Map with configurable OSM provider
     */
    initMap() {
        const hyderabadCenter = [17.4225, 78.4720];
        const defaultZoom = 14;

        this.map = L.map(this.containerId, {
            center: hyderabadCenter,
            zoom: defaultZoom,
            minZoom: 12,
            maxZoom: 18,
            scrollWheelZoom: true,
            zoomControl: false
        });

        // Zoom controls at bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Section 55: Official OpenStreetMap tiles with copyright attribution
        const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        const osmTileLayer = L.tileLayer(osmTileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
            maxZoom: 19
        });
        osmTileLayer.addTo(this.map);

        // Initialize Layer Groups
        this.layers.baseRoads = L.layerGroup().addTo(this.map);
        this.layers.shortcuts = L.layerGroup().addTo(this.map);
        this.layers.blockedRoads = L.layerGroup().addTo(this.map);
        this.layers.graphOverlay = L.layerGroup().addTo(this.map);
        this.layers.trafficLights = L.layerGroup().addTo(this.map);
        this.layers.normalRoute = L.layerGroup().addTo(this.map);
        this.layers.dijkstraRoute = L.layerGroup().addTo(this.map);
        this.layers.markers = L.layerGroup().addTo(this.map);
        this.layers.debugAnchors = L.layerGroup().addTo(this.map);
        this.layers.snapIndicator = L.layerGroup().addTo(this.map);

        // Global Map Click Handler
        this.map.on('click', (e) => {
            if (this.onMapClickCallback) {
                this.onMapClickCallback(e.latlng);
            }
        });
    }

    /**
     * Section 19, 20, 31: Render Road Network Overlays (Blockades, Shortcuts, Signals)
     * All custom overlays maintain source IDs (edgeId, nodeId).
     */
    renderRoadNetwork() {
        this.layers.baseRoads.clearLayers();
        this.layers.shortcuts.clearLayers();
        this.layers.blockedRoads.clearLayers();
        this.layers.graphOverlay.clearLayers();
        this.layers.trafficLights.clearLayers();

        const roadNetwork = this.graph.roadNetwork;

        // 1. Render Edges (Blocked hazard lines & Shortcuts)
        for (const [edgeId, edge] of Object.entries(roadNetwork.edges)) {
            const coords = edge.coordinates;

            if (edge.blocked) {
                // Section 19: Blocked road overlay uses exact edge.coordinates
                const blockedLine = L.polyline(coords, {
                    color: '#ef4444',
                    weight: 6,
                    opacity: 0.9,
                    dashArray: '8, 8',
                    lineCap: 'round',
                    className: 'road-blocked-hazard'
                });
                blockedLine.edgeId = edgeId;
                blockedLine.bindTooltip(`🚧 <b>ROAD BLOCKED</b>: ${edge.name}<br>Source ID: ${edgeId}<br>Cost: ∞ (Impassable)`, {
                    className: 'nav-glass-tooltip',
                    sticky: true
                });
                blockedLine.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.blockedRoads.addLayer(blockedLine);
            } else if (edge.shortcut || edge.roadType === 'shortcut') {
                // Section 20: Shortcut follows actual road geometry
                const shortcutLine = L.polyline(coords, {
                    color: '#8b5cf6',
                    weight: 4.5,
                    opacity: 0.9,
                    lineCap: 'round',
                    dashArray: '5, 5',
                    className: 'road-shortcut-corridor'
                });
                shortcutLine.edgeId = edgeId;
                shortcutLine.bindTooltip(`⚡ <b>EXPRESS SHORTCUT</b>: ${edge.name}<br>Source ID: ${edgeId}<br>Speed: ${edge.speedKmh} km/h | Dist: ${edge.distanceKm} km`, {
                    className: 'nav-glass-tooltip',
                    sticky: true
                });
                shortcutLine.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.shortcuts.addLayer(shortcutLine);
            } else if (this.showGraphOverlay) {
                // Base road outline in Developer Debug Mode
                const baseLine = L.polyline(coords, {
                    color: '#64748b',
                    weight: 3,
                    opacity: 0.6,
                    lineCap: 'round'
                });
                baseLine.edgeId = edgeId;
                baseLine.bindTooltip(`🛣️ <b>${edge.name}</b> (${edgeId})<br>Speed: ${edge.speedKmh} km/h | Dist: ${edge.distanceKm} km`, {
                    className: 'nav-glass-tooltip',
                    sticky: true
                });
                baseLine.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.baseRoads.addLayer(baseLine);
            }
        }

        // 2. Section 13 & 16: Render Traffic Signals anchored to intersection nodes
        for (const [sigId, signal] of Object.entries(roadNetwork.signals)) {
            const node = roadNetwork.nodes[signal.nodeId];
            if (!node) continue;

            const state = signal.state?.toLowerCase() || 'green';
            let delayBadge = '0s';
            if (state === 'red') delayBadge = '+30s';
            else if (state === 'yellow') delayBadge = '+10s';

            const trafficHtml = `
                <div class="traffic-signal-box state-${state}">
                    <div class="traffic-signal-lamp red ${state === 'red' ? 'lit' : ''}"></div>
                    <div class="traffic-signal-lamp yellow ${state === 'yellow' ? 'lit' : ''}"></div>
                    <div class="traffic-signal-lamp green ${state === 'green' ? 'lit' : ''}"></div>
                    <div class="traffic-signal-delay-badge">${delayBadge}</div>
                </div>
            `;

            const trafficIcon = L.divIcon({
                className: 'custom-traffic-icon-wrap',
                html: trafficHtml,
                iconSize: [26, 46],
                iconAnchor: [13, 23]
            });

            // Signal coordinate MUST come from node.lat, node.lng
            const lightMarker = L.marker([node.lat, node.lng], {
                icon: trafficIcon,
                zIndexOffset: 850
            });
            lightMarker.signalId = sigId;
            lightMarker.nodeId = node.id;

            lightMarker.bindTooltip(`🚦 <b>Signal: ${sigId}</b><br>Intersection: <b>${node.name}</b><br>State: <b>${state.toUpperCase()}</b> (Delay: ${delayBadge})`, {
                className: 'nav-glass-tooltip'
            });

            lightMarker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (this.onNodeClickCallback) this.onNodeClickCallback(node);
            });

            this.layers.trafficLights.addLayer(lightMarker);
        }

        // 3. Render Graph Nodes (Only when Show Graph is enabled)
        if (this.showGraphOverlay) {
            for (const [nodeId, node] of Object.entries(roadNetwork.nodes)) {
                if (nodeId === navigationState.state.start.nodeId || nodeId === navigationState.state.destination.nodeId) {
                    continue;
                }

                const nodeMarker = L.circleMarker([node.lat, node.lng], {
                    radius: 5,
                    fillColor: node.blocked ? '#ef4444' : '#38bdf8',
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: 0.95,
                    fillOpacity: 0.85
                });
                nodeMarker.nodeId = nodeId;
                nodeMarker.bindTooltip(`📍 <b>${node.name}</b> (${nodeId})`, {
                    className: 'nav-glass-tooltip'
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
     * Section 24: Set Prominent Red Destination Marker
     * Uses navigationState.state.destination directly
     */
    updateDestinationMarker() {
        if (this.destMarker) {
            this.layers.markers.removeLayer(this.destMarker);
            this.destMarker = null;
        }

        const dest = navigationState.state.destination;
        if (!dest || !dest.nodeId) return;

        const iconHtml = `
            <div class="nav-pin-container pin-end">
                <div class="nav-pin-tag">DESTINATION</div>
                <div class="nav-pin-label">${dest.name || 'Destination'}</div>
                <div class="nav-pin-body">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="#ffffff">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                </div>
                <div class="nav-pin-pulse"></div>
            </div>
        `;

        const endIcon = L.divIcon({
            className: 'custom-nav-pin-wrapper',
            html: iconHtml,
            iconSize: [110, 60],
            iconAnchor: [55, 50]
        });

        this.destMarker = L.marker([dest.lat, dest.lng], {
            icon: endIcon,
            zIndexOffset: 1000
        });

        this.destMarker.bindTooltip(`🔴 <b>DESTINATION</b>: ${dest.name}`, {
            className: 'nav-glass-tooltip'
        });

        this.layers.markers.addLayer(this.destMarker);
        this.renderRoadNetwork();
        this.updateDebugAnchors();
    }

    /**
     * Set Prominent Green Origin / Start Marker
     */
    updateStartMarker() {
        if (this.startMarker) {
            this.layers.markers.removeLayer(this.startMarker);
            this.startMarker = null;
        }

        const start = navigationState.state.start;
        if (!start || !start.nodeId) return;

        const iconHtml = `
            <div class="nav-pin-container pin-start">
                <div class="nav-pin-tag">START</div>
                <div class="nav-pin-label">${start.name || 'Origin'}</div>
                <div class="nav-pin-body">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff">
                        <circle cx="12" cy="12" r="7"/>
                    </svg>
                </div>
                <div class="nav-pin-pulse"></div>
            </div>
        `;

        const startIcon = L.divIcon({
            className: 'custom-nav-pin-wrapper',
            html: iconHtml,
            iconSize: [90, 56],
            iconAnchor: [45, 46]
        });

        this.startMarker = L.marker([start.lat, start.lng], {
            icon: startIcon,
            zIndexOffset: 950
        });

        this.startMarker.bindTooltip(`🟢 <b>START</b>: ${start.name}`, {
            className: 'nav-glass-tooltip'
        });

        this.layers.markers.addLayer(this.startMarker);
        this.renderRoadNetwork();
        this.updateDebugAnchors();
    }

    /**
     * Section 21 & 47: Render Normal Route (Calm Blue Polyline)
     */
    renderNormalRoute(route) {
        this.layers.normalRoute.clearLayers();
        if (!route || !route.coordinates || route.coordinates.length < 2) return;

        const polyline = L.polyline(route.coordinates, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-normal-path'
        });

        polyline.bindTooltip(`🔵 <b>Normal Route</b><br>Distance: ${route.distanceKm} km<br>ETA: ${route.estimatedTimeMin} min`, {
            className: 'nav-glass-tooltip',
            sticky: true
        });

        this.layers.normalRoute.addLayer(polyline);
        this.updateDebugAnchors();
        return polyline;
    }

    /**
     * Section 21 & 47: Render Dijkstra Fastest Route (Vibrant Emerald Polyline with Glow)
     */
    renderDijkstraRoute(route) {
        this.layers.dijkstraRoute.clearLayers();
        if (!route || !route.coordinates || route.coordinates.length < 2) return;

        const coords = route.coordinates;

        // Outer glow
        const glow = L.polyline(coords, {
            color: '#00e676',
            weight: 9,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-glow-path'
        });

        // Sharp core polyline
        const core = L.polyline(coords, {
            color: '#10b981',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-dijkstra-core'
        });

        core.bindTooltip(`🟢 <b>Dijkstra Fastest Route</b><br>Travel Time: ${route.estimatedTimeMin} min<br>Distance: ${route.distanceKm} km`, {
            className: 'nav-glass-tooltip',
            sticky: true
        });

        this.layers.dijkstraRoute.addLayer(glow);
        this.layers.dijkstraRoute.addLayer(core);
        this.updateDebugAnchors();
        return core;
    }

    /**
     * Section 33: Show Route Anchors Debug Overlay
     * Displays START, DESTINATION, ROUTE START, ROUTE END to visually verify exact overlap.
     */
    updateDebugAnchors() {
        this.layers.debugAnchors.clearLayers();
        if (!this.showRouteAnchors) return;

        const start = navigationState.state.start;
        const dest = navigationState.state.destination;
        const activeRoute = navigationState.state.activeRoute || navigationState.state.dijkstraRoute || navigationState.state.normalRoute;

        if (start && start.lat) {
            L.circleMarker([start.lat, start.lng], {
                radius: 10,
                color: '#22c55e',
                weight: 2,
                fillColor: '#22c55e',
                fillOpacity: 0.2
            }).bindTooltip('📍 START ANCHOR', { permanent: true, className: 'debug-anchor-tooltip' }).addTo(this.layers.debugAnchors);
        }

        if (dest && dest.lat) {
            L.circleMarker([dest.lat, dest.lng], {
                radius: 10,
                color: '#ef4444',
                weight: 2,
                fillColor: '#ef4444',
                fillOpacity: 0.2
            }).bindTooltip('📍 DESTINATION ANCHOR', { permanent: true, className: 'debug-anchor-tooltip' }).addTo(this.layers.debugAnchors);
        }

        if (activeRoute && activeRoute.coordinates && activeRoute.coordinates.length >= 2) {
            const firstPt = activeRoute.coordinates[0];
            const lastPt = activeRoute.coordinates[activeRoute.coordinates.length - 1];

            L.circleMarker(firstPt, {
                radius: 6,
                color: '#ffffff',
                weight: 2,
                fillColor: '#10b981',
                fillOpacity: 1.0
            }).bindTooltip('ROUTE START ●', { permanent: true, className: 'debug-anchor-tooltip' }).addTo(this.layers.debugAnchors);

            L.circleMarker(lastPt, {
                radius: 6,
                color: '#ffffff',
                weight: 2,
                fillColor: '#ef4444',
                fillOpacity: 1.0
            }).bindTooltip('ROUTE END ●', { permanent: true, className: 'debug-anchor-tooltip' }).addTo(this.layers.debugAnchors);
        }
    }

    clearRoutes() {
        this.layers.normalRoute.clearLayers();
        this.layers.dijkstraRoute.clearLayers();
        this.layers.debugAnchors.clearLayers();
    }

    clearMarkers() {
        this.layers.markers.clearLayers();
        this.startMarker = null;
        this.destMarker = null;
        this.renderRoadNetwork();
        this.updateDebugAnchors();
    }

    showSnapIndicator(clickLat, clickLng, snappedLat, snappedLng) {
        this.layers.snapIndicator.clearLayers();

        if (clickLat !== snappedLat || clickLng !== snappedLng) {
            const connectLine = L.polyline([[clickLat, clickLng], [snappedLat, snappedLng]], {
                color: '#10b981',
                weight: 2,
                dashArray: '3, 4',
                opacity: 0.8
            });
            this.layers.snapIndicator.addLayer(connectLine);
        }

        const pulseCircle = L.circleMarker([snappedLat, snappedLng], {
            radius: 12,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.25,
            weight: 2,
            className: 'snap-pulse-circle'
        });
        this.layers.snapIndicator.addLayer(pulseCircle);

        setTimeout(() => {
            this.layers.snapIndicator.clearLayers();
        }, 1500);
    }

    setGraphOverlayVisibility(visible) {
        this.showGraphOverlay = visible;
        this.renderRoadNetwork();
    }

    setRouteAnchorsVisibility(visible) {
        this.showRouteAnchors = visible;
        this.updateDebugAnchors();
    }

    fitRoute(coordinates) {
        if (!coordinates || coordinates.length === 0) return;
        const bounds = L.latLngBounds(coordinates);
        this.map.fitBounds(bounds, {
            padding: [80, 80],
            maxZoom: 16,
            animate: true
        });
    }
}

if (typeof window !== 'undefined') {
    window.LeafletMapManager = LeafletMapManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LeafletMapManager;
}
