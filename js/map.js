/**
 * ============================================================================
 * LEAFLET MAP MANAGER & GEOGRAPHIC LAYERS (js/map.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Initializes Leaflet with high-DPI OpenStreetMap tiles (CartoDB Dark Matter).
 * 2. Manages discrete Leaflet layer groups with strict visual z-index hierarchy.
 * 3. Renders road network geometry (Normal, Shortcut, Blocked).
 * 4. Renders realistic SVG Traffic Signal markers.
 * 5. Provides animated Snap-to-Road visual indicators.
 * 6. Supports "Show Graph" toggle and "Fit Route" viewport controls.
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
            route: null,
            markers: null,
            snapIndicator: null
        };

        this.startNodeId = null;
        this.endNodeId = null;
        this.startMarker = null;
        this.endMarker = null;
        this.activeTool = 'start';
        this.showGraphOverlay = true;

        // Event callbacks
        this.onMapClickCallback = null;
        this.onNodeClickCallback = null;
        this.onEdgeClickCallback = null;

        this.initMap();
        this.renderRoadNetwork();
    }

    /**
     * Initialize Leaflet Map centered on Central Hyderabad
     */
    initMap() {
        // Central Hussain Sagar & Secretariat, Hyderabad
        const hyderabadCenter = [17.4225, 78.4720];
        const defaultZoom = 14;

        this.map = L.map(this.containerId, {
            center: hyderabadCenter,
            zoom: defaultZoom,
            minZoom: 12,
            maxZoom: 18,
            zoomControl: false
        });

        // Add sleek zoom control
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // CartoDB Dark Matter tiles (OpenStreetMap attribution compliant)
        const darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        });
        darkTileLayer.addTo(this.map);

        // Layer Groups
        this.layers.baseRoads = L.layerGroup().addTo(this.map);
        this.layers.shortcuts = L.layerGroup().addTo(this.map);
        this.layers.blockedRoads = L.layerGroup().addTo(this.map);
        this.layers.graphOverlay = L.layerGroup().addTo(this.map);
        this.layers.trafficLights = L.layerGroup().addTo(this.map);
        this.layers.route = L.layerGroup().addTo(this.map);
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
     * Render the entire road network with realistic geometry and distinct styling
     */
    renderRoadNetwork() {
        this.layers.baseRoads.clearLayers();
        this.layers.shortcuts.clearLayers();
        this.layers.blockedRoads.clearLayers();
        this.layers.graphOverlay.clearLayers();
        this.layers.trafficLights.clearLayers();

        const renderedEdges = new Set();

        // 1. Render Road Segments
        for (const [, edge] of this.graph.edges) {
            const pairKey = [edge.from, edge.to].sort().join('--');
            if (renderedEdges.has(pairKey)) continue;
            renderedEdges.add(pairKey);

            const coords = edge.coordinates;
            let polyline;

            if (edge.blocked || edge.roadType === 'blocked') {
                // Blocked road (Red / Crimson dashed hazard)
                polyline = L.polyline(coords, {
                    color: '#ff1744',
                    weight: 5,
                    opacity: 0.9,
                    dashArray: '7, 7',
                    lineCap: 'round',
                    className: 'road-blocked-line'
                });
                polyline.bindTooltip(`🚫 <b>BLOCKED ROAD</b>: ${edge.name}<br>Weight: ∞ (Impassable)`, {
                    className: 'glass-tooltip',
                    sticky: true
                });
                polyline.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.blockedRoads.addLayer(polyline);
            } else if (edge.roadType === 'shortcut') {
                // Express Shortcut (Luminous Green 0.5x)
                polyline = L.polyline(coords, {
                    color: '#00e676',
                    weight: 4.5,
                    opacity: 0.85,
                    lineCap: 'round',
                    className: 'road-shortcut-line'
                });
                polyline.bindTooltip(`🟢 <b>EXPRESS SHORTCUT</b>: ${edge.name}<br>Weight Multiplier: 0.5x | Dist: ${edge.distance} km`, {
                    className: 'glass-tooltip',
                    sticky: true
                });
                polyline.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.shortcuts.addLayer(polyline);
            } else {
                // Normal Road (Neutral Dark Slate with crisp contrast)
                polyline = L.polyline(coords, {
                    color: '#37474f',
                    weight: 3.5,
                    opacity: 0.75,
                    lineCap: 'round',
                    className: 'road-normal-line'
                });
                polyline.bindTooltip(`🛣️ <b>${edge.name}</b><br>Normal Road (1.0x) | Dist: ${edge.distance} km`, {
                    className: 'glass-tooltip',
                    sticky: true
                });
                polyline.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onEdgeClickCallback) this.onEdgeClickCallback(edge);
                });
                this.layers.baseRoads.addLayer(polyline);
            }
        }

        // 2. Render Traffic Light Signals on intersections
        for (const [, node] of this.graph.nodes) {
            if (node.trafficLight) {
                const isRed = node.trafficState === 'red';
                const stateColor = isRed ? '#ff1744' : '#ffd600';
                const delayText = isRed ? '+4.0' : '+1.5';

                const trafficHtml = `
                    <div class="traffic-signal-box">
                        <div class="traffic-visor"></div>
                        <div class="traffic-housing">
                            <div class="traffic-light-lamp red ${isRed ? 'active' : ''}"></div>
                            <div class="traffic-light-lamp yellow ${!isRed ? 'active' : ''}"></div>
                        </div>
                        <div class="traffic-light-badge">${delayText}</div>
                    </div>
                `;

                const trafficIcon = L.divIcon({
                    className: 'custom-traffic-div-icon',
                    html: trafficHtml,
                    iconSize: [24, 40],
                    iconAnchor: [12, 20]
                });

                const lightMarker = L.marker([node.lat, node.lng], {
                    icon: trafficIcon,
                    zIndexOffset: 800
                });

                lightMarker.bindTooltip(`🚦 <b>Traffic Light</b>: ${node.name}<br>Current State: <b>${node.trafficState.toUpperCase()}</b> (Cost Delay: ${delayText})`, {
                    className: 'glass-tooltip'
                });

                lightMarker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onNodeClickCallback) this.onNodeClickCallback(node);
                });

                this.layers.trafficLights.addLayer(lightMarker);
            }
        }

        // 3. Render Graph Nodes Overlay (Intersections)
        if (this.showGraphOverlay) {
            for (const [, node] of this.graph.nodes) {
                const isStart = node.id === this.startNodeId;
                const isEnd = node.id === this.endNodeId;

                // Do not obscure start/end markers with circle markers
                if (isStart || isEnd) continue;

                const nodeMarker = L.circleMarker([node.lat, node.lng], {
                    radius: 4.5,
                    fillColor: node.blocked ? '#ff1744' : '#64b5f6',
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: 0.9,
                    fillOpacity: 0.85,
                    className: 'graph-node-circle'
                });

                nodeMarker.bindTooltip(`📍 <b>${node.name}</b><br>ID: ${node.id}`, {
                    className: 'glass-tooltip'
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
     * showing where the user clicked and how it snaps to the road.
     */
    showSnapIndicator(clickedLat, clickedLng, snappedLat, snappedLng) {
        this.layers.snapIndicator.clearLayers();

        // Connect clicked position to snapped position with a dashed line if displaced
        const distMeters = this.graph.constructor.calculateHaversine(clickedLat, clickedLng, snappedLat, snappedLng) * 1000;

        if (distMeters > 5) {
            const snapLine = L.polyline([[clickedLat, clickedLng], [snappedLat, snappedLng]], {
                color: '#64b5f6',
                weight: 2,
                dashArray: '3, 4',
                opacity: 0.8
            });
            this.layers.snapIndicator.addLayer(snapLine);
        }

        // Animated pulse ripple circle
        const rippleMarker = L.circleMarker([snappedLat, snappedLng], {
            radius: 8,
            fillColor: '#00e5ff',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.6,
            className: 'snap-ripple-animation'
        });
        this.layers.snapIndicator.addLayer(rippleMarker);

        // Auto remove snap ripple after 1.5s
        setTimeout(() => {
            this.layers.snapIndicator.clearLayers();
        }, 1500);
    }

    /**
     * Set Start Location with Blue origin pin
     */
    setStartMarker(node) {
        this.startNodeId = node.id;

        if (this.startMarker) {
            this.layers.markers.removeLayer(this.startMarker);
        }

        const startIcon = L.divIcon({
            className: 'custom-start-marker',
            html: `
                <div class="start-marker-pulse"></div>
                <div class="start-marker-pin">🔵</div>
                <div class="marker-title-tag">START</div>
            `,
            iconSize: [36, 46],
            iconAnchor: [18, 23]
        });

        this.startMarker = L.marker([node.lat, node.lng], {
            icon: startIcon,
            zIndexOffset: 1200
        }).addTo(this.layers.markers);

        this.startMarker.bindTooltip(`🔵 <b>START</b>: ${node.name}`, { className: 'glass-tooltip' });
        this.renderRoadNetwork();
    }

    /**
     * Set Destination Location with Purple destination pin
     */
    setEndMarker(node) {
        this.endNodeId = node.id;

        if (this.endMarker) {
            this.layers.markers.removeLayer(this.endMarker);
        }

        const endIcon = L.divIcon({
            className: 'custom-end-marker',
            html: `
                <div class="end-marker-pulse"></div>
                <div class="end-marker-pin">🟣</div>
                <div class="marker-title-tag">END</div>
            `,
            iconSize: [36, 46],
            iconAnchor: [18, 23]
        });

        this.endMarker = L.marker([node.lat, node.lng], {
            icon: endIcon,
            zIndexOffset: 1200
        }).addTo(this.layers.markers);

        this.endMarker.bindTooltip(`🟣 <b>DESTINATION</b>: ${node.name}`, { className: 'glass-tooltip' });
        this.renderRoadNetwork();
    }

    /**
     * Fit Map Viewport to encompass start, destination, and the complete route
     */
    fitRoute(coords) {
        if (!coords || coords.length === 0) return;
        const bounds = L.latLngBounds(coords);
        this.map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 15,
            animate: true
        });
    }

    /**
     * Clear start and end markers
     */
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
     * Toggle Graph Overlay visibility
     */
    setGraphOverlayVisibility(visible) {
        this.showGraphOverlay = Boolean(visible);
        if (this.showGraphOverlay) {
            this.renderRoadNetwork();
        } else {
            this.layers.graphOverlay.clearLayers();
        }
    }
}
