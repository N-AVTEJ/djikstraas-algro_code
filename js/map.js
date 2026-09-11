/**
 * ============================================================================
 * LEAFLET MAP MANAGER & GEOGRAPHIC LAYERS (js/map.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Initializes Leaflet with official, clean OpenStreetMap tiles.
 *    (Zero API key watermarks, clear city roads, water bodies, and parks).
 * 2. Natural navigation: standard mousewheel zoom, drag pan, double click.
 * 3. Default state hides graph overlay (nodes/edges) for a clean city map.
 * 4. Distinct Start (Green) and Destination (Red) markers with labels.
 * 5. Visual layers for Normal Route (blue) and Dijkstra Fastest Route (emerald).
 * 6. Visual styling for Blocked Roads (red dashed hazard) and Shortcuts.
 * 7. 3-state SVG Traffic Signal markers (Green / Yellow / Red).
 */

class LeafletMapManager {
    constructor(containerId, graph) {
        this.containerId = containerId;
        this.graph = graph;
        this.map = null;

        // Structured layer groups
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
        this.showGraphOverlay = false; // Default: OFF for clean navigation map

        // Event callbacks
        this.onMapClickCallback = null;
        this.onNodeClickCallback = null;
        this.onEdgeClickCallback = null;

        this.initMap();
        this.renderRoadNetwork();
    }

    /**
     * Initialize Leaflet Map centered on Central Hyderabad (Hussain Sagar / Secretariat)
     */
    initMap() {
        const hyderabadCenter = [17.4225, 78.4720];
        const defaultZoom = 14;

        this.map = L.map(this.containerId, {
            center: hyderabadCenter,
            zoom: defaultZoom,
            minZoom: 12,
            maxZoom: 18,
            scrollWheelZoom: true, // Natural scroll zoom (NO Ctrl key requirement)
            zoomControl: false
        });

        // Add standard zoom control at bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Official OpenStreetMap tile layer (Reliable, high-clarity, no API key)
        const osmTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        });
        osmTileLayer.addTo(this.map);

        // Layer Groups
        this.layers.baseRoads = L.layerGroup().addTo(this.map);
        this.layers.shortcuts = L.layerGroup().addTo(this.map);
        this.layers.blockedRoads = L.layerGroup().addTo(this.map);
        this.layers.graphOverlay = L.layerGroup().addTo(this.map);
        this.layers.trafficLights = L.layerGroup().addTo(this.map);
        this.layers.normalRoute = L.layerGroup().addTo(this.map);
        this.layers.dijkstraRoute = L.layerGroup().addTo(this.map);
        this.layers.markers = L.layerGroup().addTo(this.map);
        this.layers.snapIndicator = L.layerGroup().addTo(this.map);

        // Map Click Listener
        this.map.on('click', (e) => {
            if (this.onMapClickCallback) {
                this.onMapClickCallback(e.latlng);
            }
        });
    }

    /**
     * Render the road network according to display settings
     */
    renderRoadNetwork() {
        this.layers.baseRoads.clearLayers();
        this.layers.shortcuts.clearLayers();
        this.layers.blockedRoads.clearLayers();
        this.layers.graphOverlay.clearLayers();
        this.layers.trafficLights.clearLayers();

        const renderedEdges = new Set();

        // 1. Render Blocked Roads & Shortcuts (Always visible so user sees network constraints)
        for (const [, edge] of this.graph.edges) {
            const pairKey = [edge.from, edge.to].sort().join('--');
            if (renderedEdges.has(pairKey)) continue;
            renderedEdges.add(pairKey);

            const coords = edge.coordinates;

            if (edge.blocked || edge.roadType === 'blocked') {
                // Blocked road (Bold Red / Hazard striped overlay)
                const blockedLine = L.polyline(coords, {
                    color: '#ef4444',
                    weight: 6,
                    opacity: 0.9,
                    dashArray: '8, 8',
                    lineCap: 'round',
                    className: 'road-blocked-line'
                });
                blockedLine.bindTooltip(`🚧 <b>ROAD BLOCKED</b>: ${edge.name}<br>Weight: ∞ (Impassable)`, {
                    className: 'nav-glass-tooltip',
                    sticky: true
                });
                blockedLine.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.blockedRoads.addLayer(blockedLine);
            } else if (edge.roadType === 'shortcut') {
                // Shortcut (Distinct Purple / Indigo Corridor)
                const shortcutLine = L.polyline(coords, {
                    color: '#8b5cf6',
                    weight: 4.5,
                    opacity: 0.85,
                    lineCap: 'round',
                    dashArray: '4, 4',
                    className: 'road-shortcut-line'
                });
                shortcutLine.bindTooltip(`⚡ <b>EXPRESS SHORTCUT</b>: ${edge.name}<br>Speed: ${edge.speedKmH} km/h | Dist: ${edge.distance} km`, {
                    className: 'nav-glass-tooltip',
                    sticky: true
                });
                shortcutLine.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.shortcuts.addLayer(shortcutLine);
            } else if (this.showGraphOverlay) {
                // In Graph Overlay mode, draw subtle dark lines for all edges
                const normalLine = L.polyline(coords, {
                    color: '#475569',
                    weight: 3,
                    opacity: 0.7,
                    lineCap: 'round'
                });
                normalLine.bindTooltip(`🛣️ <b>${edge.name}</b><br>Normal Road (Speed: ${edge.speedKmH} km/h) | Dist: ${edge.distance} km`, {
                    className: 'nav-glass-tooltip',
                    sticky: true
                });
                normalLine.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.baseRoads.addLayer(normalLine);
            }
        }

        // 2. Render Traffic Light Signals (Green, Yellow, Red)
        for (const [, node] of this.graph.nodes) {
            if (node.trafficLight) {
                const state = node.trafficState || 'green';
                let stateColor = '#22c55e'; // Green
                let delayText = '0s';

                if (state === 'red') {
                    stateColor = '#ef4444';
                    delayText = '+75s';
                } else if (state === 'yellow') {
                    stateColor = '#eab308';
                    delayText = '+20s';
                }

                const trafficHtml = `
                    <div class="traffic-signal-box state-${state}">
                        <div class="traffic-signal-lamp red ${state === 'red' ? 'lit' : ''}"></div>
                        <div class="traffic-signal-lamp yellow ${state === 'yellow' ? 'lit' : ''}"></div>
                        <div class="traffic-signal-lamp green ${state === 'green' ? 'lit' : ''}"></div>
                        <div class="traffic-signal-delay-badge">${delayText}</div>
                    </div>
                `;

                const trafficIcon = L.divIcon({
                    className: 'custom-traffic-icon-wrap',
                    html: trafficHtml,
                    iconSize: [26, 44],
                    iconAnchor: [13, 22]
                });

                const lightMarker = L.marker([node.lat, node.lng], {
                    icon: trafficIcon,
                    zIndexOffset: 800
                });

                lightMarker.bindTooltip(`🚦 <b>Traffic Light</b>: ${node.name}<br>State: <b>${state.toUpperCase()}</b> (Delay: ${delayText})`, {
                    className: 'nav-glass-tooltip'
                });

                lightMarker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onNodeClickCallback) this.onNodeClickCallback(node);
                });

                this.layers.trafficLights.addLayer(lightMarker);
            }
        }

        // 3. Render Graph Nodes Overlay (Only when Show Graph is enabled)
        if (this.showGraphOverlay) {
            for (const [, node] of this.graph.nodes) {
                if (node.id === this.startNodeId || node.id === this.endNodeId) continue;

                const nodeMarker = L.circleMarker([node.lat, node.lng], {
                    radius: 5,
                    fillColor: node.blocked ? '#ef4444' : '#3b82f6',
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: 0.95,
                    fillOpacity: 0.85
                });

                nodeMarker.bindTooltip(`📍 <b>${node.name}</b>`, {
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
     * Show an animated Snap-to-Road ripple indicator at the clicked location
     */
    showSnapIndicator(clickLat, clickLng, snappedLat, snappedLng) {
        this.layers.snapIndicator.clearLayers();

        // 1. Dash line from click point to snapped point
        if (clickLat !== snappedLat || clickLng !== snappedLng) {
            const connectLine = L.polyline([[clickLat, clickLng], [snappedLat, snappedLng]], {
                color: '#10b981',
                weight: 2,
                dashArray: '3, 4',
                opacity: 0.8
            });
            this.layers.snapIndicator.addLayer(connectLine);
        }

        // 2. Animated pulse ring
        const pulseCircle = L.circleMarker([snappedLat, snappedLng], {
            radius: 12,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.25,
            weight: 2,
            className: 'snap-pulse-circle'
        });
        this.layers.snapIndicator.addLayer(pulseCircle);

        // Auto remove after 1.5s
        setTimeout(() => {
            this.layers.snapIndicator.clearLayers();
        }, 1500);
    }

    /**
     * Set Origin Marker (Green Pin)
     */
    setStartMarker(node) {
        if (!node) return;
        this.startNodeId = node.id;

        if (this.startMarker) {
            this.layers.markers.removeLayer(this.startMarker);
        }

        const iconHtml = `
            <div class="nav-pin-container pin-start">
                <div class="nav-pin-tag">START</div>
                <div class="nav-pin-body">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff">
                        <circle cx="12" cy="12" r="7"/>
                    </svg>
                </div>
                <div class="nav-pin-pulse"></div>
            </div>
        `;

        const startIcon = L.divIcon({
            className: 'custom-nav-pin',
            html: iconHtml,
            iconSize: [50, 50],
            iconAnchor: [25, 42]
        });

        this.startMarker = L.marker([node.lat, node.lng], {
            icon: startIcon,
            zIndexOffset: 1000
        });

        this.startMarker.bindTooltip(`🟢 <b>START</b>: ${node.name}`, {
            permanent: false,
            className: 'nav-glass-tooltip'
        });

        this.layers.markers.addLayer(this.startMarker);
        this.renderRoadNetwork();
    }

    /**
     * Set Destination Marker (Red Pin)
     */
    setEndMarker(node) {
        if (!node) return;
        this.endNodeId = node.id;

        if (this.endMarker) {
            this.layers.markers.removeLayer(this.endMarker);
        }

        const iconHtml = `
            <div class="nav-pin-container pin-end">
                <div class="nav-pin-tag">DESTINATION</div>
                <div class="nav-pin-body">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                </div>
                <div class="nav-pin-pulse"></div>
            </div>
        `;

        const endIcon = L.divIcon({
            className: 'custom-nav-pin',
            html: iconHtml,
            iconSize: [80, 50],
            iconAnchor: [40, 42]
        });

        this.endMarker = L.marker([node.lat, node.lng], {
            icon: endIcon,
            zIndexOffset: 1000
        });

        this.endMarker.bindTooltip(`🔴 <b>DESTINATION</b>: ${node.name}`, {
            permanent: false,
            className: 'nav-glass-tooltip'
        });

        this.layers.markers.addLayer(this.endMarker);
        this.renderRoadNetwork();
    }

    /**
     * Render the Normal Route (subtle blue line)
     */
    renderNormalRoute(coords) {
        this.layers.normalRoute.clearLayers();
        if (!coords || coords.length < 2) return;

        const polyline = L.polyline(coords, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.75,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-normal-path'
        });

        this.layers.normalRoute.addLayer(polyline);
        return polyline;
    }

    /**
     * Render the Dijkstra Fastest Route (vibrant emerald green line)
     */
    renderDijkstraRoute(coords) {
        this.layers.dijkstraRoute.clearLayers();
        if (!coords || coords.length < 2) return;

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

        this.layers.dijkstraRoute.addLayer(glow);
        this.layers.dijkstraRoute.addLayer(core);
        return core;
    }

    /**
     * Clear all active route layers
     */
    clearRoutes() {
        this.layers.normalRoute.clearLayers();
        this.layers.dijkstraRoute.clearLayers();
    }

    /**
     * Clear origin and destination markers
     */
    clearMarkers() {
        this.layers.markers.clearLayers();
        this.startNodeId = null;
        this.endNodeId = null;
        this.startMarker = null;
        this.endMarker = null;
        this.renderRoadNetwork();
    }

    /**
     * Toggle Graph Overlay visibility (Nodes and Edge lines)
     */
    setGraphOverlayVisibility(visible) {
        this.showGraphOverlay = visible;
        this.renderRoadNetwork();
    }

    /**
     * Fit viewport to encompass the given road coordinates
     */
    fitRoute(coordinates) {
        if (!coordinates || coordinates.length === 0) return;
        const bounds = L.latLngBounds(coordinates);
        this.map.fitBounds(bounds, {
            padding: [70, 70],
            maxZoom: 16,
            animate: true
        });
    }
}
