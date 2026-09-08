/**
 * ============================================================================
 * LEAFLET MAP MANAGER & GEOGRAPHIC VISUALIZATION
 * ============================================================================
 * 
 * Manages the Leaflet interactive map, geographic layers, city network overlay,
 * custom SVG markers, and user click/hover interactions.
 * 
 * Note: Leaflet is strictly responsible for presentation & map interaction.
 * All routing math & data structures reside independently in dijkstra.js.
 */

class MapManager {
    constructor(containerId, cityGraph) {
        this.containerId = containerId;
        this.graph = cityGraph;
        this.map = null;

        // Leaflet Layer Groups for clean rendering & performance
        this.layers = {
            edges: null,
            shortcuts: null,
            blockedEdges: null,
            nodes: null,
            trafficLights: null,
            route: null,
            algorithmViz: null,
            startMarker: null,
            endMarker: null
        };

        this.startNodeId = null;
        this.endNodeId = null;
        this.activeTool = 'select'; // 'select', 'start', 'end', 'wall', 'traffic-light', 'shortcut'
        this.showGraphOverlay = true;

        // Event callbacks for UI
        this.onNodeClickCallback = null;
        this.onEdgeClickCallback = null;
        this.onMapClickCallback = null;

        this.initMap();
        this.setupCityNetwork();
        this.renderGraphLayers();
    }

    /**
     * Initialize Leaflet map with CartoDB Dark Matter tiles (or OSM fallback)
     */
    initMap() {
        // Center on Hyderabad, India
        const hyderabadCenter = [17.4150, 78.4450];
        const defaultZoom = 13;

        this.map = L.map(this.containerId, {
            center: hyderabadCenter,
            zoom: defaultZoom,
            minZoom: 11,
            maxZoom: 18,
            zoomControl: false // Custom placement later
        });

        // Add sleek zoom control to bottom right
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Tile layer: CartoDB Dark Matter for professional dark dashboard look
        const darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        });
        darkTileLayer.addTo(this.map);

        // Initialize Layer Groups
        this.layers.edges = L.layerGroup().addTo(this.map);
        this.layers.shortcuts = L.layerGroup().addTo(this.map);
        this.layers.blockedEdges = L.layerGroup().addTo(this.map);
        this.layers.nodes = L.layerGroup().addTo(this.map);
        this.layers.trafficLights = L.layerGroup().addTo(this.map);
        this.layers.algorithmViz = L.layerGroup().addTo(this.map);
        this.layers.route = L.layerGroup().addTo(this.map);

        // Native map click listener
        this.map.on('click', (e) => {
            if (this.onMapClickCallback) {
                this.onMapClickCallback(e.latlng);
            }
        });
    }

    /**
     * Populate the City Graph with rich Hyderabad landmarks & intersections
     */
    setupCityNetwork() {
        const g = this.graph;

        // 1. Define 28 Landmarks / Intersections
        const nodesData = [
            { id: 'hitec_city', name: 'HITEC City (Cyber Towers)', lat: 17.4504, lng: 78.3808 },
            { id: 'madhapur', name: 'Madhapur Metro', lat: 17.4483, lng: 78.3915 },
            { id: 'raidurg', name: 'Raidurg Metro Terminal', lat: 17.4412, lng: 78.3752 },
            { id: 'gachibowli', name: 'Gachibowli Junction', lat: 17.4401, lng: 78.3489 },
            { id: 'nanakramguda', name: 'Financial District', lat: 17.4182, lng: 78.3432 },
            { id: 'kondapur', name: 'Kondapur RTO', lat: 17.4615, lng: 78.3612 },
            { id: 'kukatpally', name: 'Kukatpally Y-Junction', lat: 17.4842, lng: 78.4018 },
            { id: 'jubilee_hills', name: 'Jubilee Hills Checkpost', lat: 17.4325, lng: 78.4071 },
            { id: 'banjara_hills', name: 'Banjara Hills Rd 1', lat: 17.4156, lng: 78.4487 },
            { id: 'manikonda', name: 'Manikonda Outer Road', lat: 17.4022, lng: 78.3887 },
            { id: 'tolichowki', name: 'Tolichowki Flyover', lat: 17.4011, lng: 78.4124 },
            { id: 'mehdipatnam', name: 'Mehdipatnam Rythu Bazar', lat: 17.3916, lng: 78.4398 },
            { id: 'attapur', name: 'Attapur Pillar 140', lat: 17.3732, lng: 78.4352 },
            { id: 'charminar', name: 'Charminar Monument', lat: 17.3616, lng: 78.4747 },
            { id: 'falaknuma', name: 'Falaknuma Palace', lat: 17.3312, lng: 78.4674 },
            { id: 'koti', name: 'Koti Commercial Hub', lat: 17.3833, lng: 78.4842 },
            { id: 'abids', name: 'Abids Crossroads', lat: 17.3871, lng: 78.4764 },
            { id: 'nampally', name: 'Nampally Station', lat: 17.3921, lng: 78.4716 },
            { id: 'lakdikapul', name: 'Lakdikapul Junction', lat: 17.4042, lng: 78.4633 },
            { id: 'khairatabad', name: 'Khairatabad Flyover', lat: 17.4116, lng: 78.4611 },
            { id: 'somajiguda', name: 'Somajiguda Raj Bhavan', lat: 17.4215, lng: 78.4578 },
            { id: 'punjagutta', name: 'Punjagutta Central Circle', lat: 17.4284, lng: 78.4526 },
            { id: 'ameerpet', name: 'Ameerpet Crossroads', lat: 17.4375, lng: 78.4483 },
            { id: 'sr_nagar', name: 'SR Nagar Main Road', lat: 17.4442, lng: 78.4431 },
            { id: 'begumpet', name: 'Begumpet Airport Flyover', lat: 17.4448, lng: 78.4682 },
            { id: 'hussain_sagar', name: 'Hussain Sagar Lake (Tank Bund)', lat: 17.4239, lng: 78.4738 },
            { id: 'secunderabad', name: 'Secunderabad Junction Station', lat: 17.4399, lng: 78.5018 },
            { id: 'paradise', name: 'Paradise Circle', lat: 17.4418, lng: 78.4872 }
        ];

        nodesData.forEach(n => {
            g.addNode(n.id, n.name, n.lat, n.lng);
        });

        // 2. Define interconnected city road network
        const roads = [
            // West Corridor (Cyberabad)
            ['kondapur', 'hitec_city'],
            ['hitec_city', 'madhapur'],
            ['hitec_city', 'raidurg'],
            ['raidurg', 'gachibowli'],
            ['gachibowli', 'nanakramguda'],
            ['gachibowli', 'kondapur'],
            ['nanakramguda', 'manikonda'],
            ['manikonda', 'tolichowki'],
            
            // Connecting Cyberabad to Central City
            ['madhapur', 'jubilee_hills'],
            ['raidurg', 'jubilee_hills'],
            ['jubilee_hills', 'banjara_hills'],
            ['jubilee_hills', 'punjagutta'],
            ['jubilee_hills', 'kukatpally'],
            ['kukatpally', 'sr_nagar'],
            
            // South-West & Old City Corridors
            ['tolichowki', 'mehdipatnam'],
            ['mehdipatnam', 'attapur'],
            ['attapur', 'charminar'],
            ['charminar', 'falaknuma'],
            ['charminar', 'koti'],
            ['mehdipatnam', 'lakdikapul'],
            
            // Central Hubs
            ['banjara_hills', 'punjagutta'],
            ['banjara_hills', 'somajiguda'],
            ['banjara_hills', 'mehdipatnam'],
            ['punjagutta', 'ameerpet'],
            ['punjagutta', 'somajiguda'],
            ['ameerpet', 'sr_nagar'],
            ['ameerpet', 'begumpet'],
            ['somajiguda', 'khairatabad'],
            ['khairatabad', 'lakdikapul'],
            ['khairatabad', 'hussain_sagar'],
            ['lakdikapul', 'nampally'],
            ['nampally', 'abids'],
            ['abids', 'koti'],
            ['abids', 'charminar'],
            
            // East / Secunderabad Corridors
            ['begumpet', 'paradise'],
            ['paradise', 'secunderabad'],
            ['paradise', 'hussain_sagar'],
            ['hussain_sagar', 'koti'],
            ['hussain_sagar', 'secunderabad']
        ];

        roads.forEach(([src, dst]) => {
            g.addEdge(src, dst);
        });

        // Add 3 default traffic lights for demonstration
        g.nodes.get('punjagutta').type = 'traffic-light';
        g.nodes.get('punjagutta').lightState = 'yellow';

        g.nodes.get('lakdikapul').type = 'traffic-light';
        g.nodes.get('lakdikapul').lightState = 'red';

        g.nodes.get('madhapur').type = 'traffic-light';
        g.nodes.get('madhapur').lightState = 'yellow';
    }

    /**
     * Find nearest graph node to given coordinates
     */
    findNearestNode(lat, lng, maxDistanceKm = 5.0) {
        let nearestNode = null;
        let minDistance = Infinity;

        for (const [, node] of this.graph.nodes) {
            const dist = this.graph.calculateDistance(lat, lng, node.lat, node.lng);
            if (dist < minDistance) {
                minDistance = dist;
                nearestNode = node;
            }
        }

        return minDistance <= maxDistanceKm ? nearestNode : null;
    }

    /**
     * Find nearest edge to given coordinates
     */
    findNearestEdge(lat, lng, maxDistanceKm = 1.5) {
        let nearestEdge = null;
        let minDistance = Infinity;

        for (const [, edge] of this.graph.edges) {
            const u = this.graph.nodes.get(edge.source);
            const v = this.graph.nodes.get(edge.target);
            if (!u || !v) continue;

            // Midpoint approximation
            const midLat = (u.lat + v.lat) / 2;
            const midLng = (u.lng + v.lng) / 2;
            const dist = this.graph.calculateDistance(lat, lng, midLat, midLng);

            if (dist < minDistance) {
                minDistance = dist;
                nearestEdge = edge;
            }
        }

        return minDistance <= maxDistanceKm ? nearestEdge : null;
    }

    /**
     * Render all graph layers: edges, nodes, traffic lights, obstacles, shortcuts
     */
    renderGraphLayers() {
        this.layers.edges.clearLayers();
        this.layers.shortcuts.clearLayers();
        this.layers.blockedEdges.clearLayers();
        this.layers.nodes.clearLayers();
        this.layers.trafficLights.clearLayers();

        if (!this.showGraphOverlay) return;

        // 1. Render Edges
        const processedEdgePairs = new Set();

        for (const [, edge] of this.graph.edges) {
            const pairKey = [edge.source, edge.target].sort().join('--');
            if (processedEdgePairs.has(pairKey)) continue;
            processedEdgePairs.add(pairKey);

            const u = this.graph.nodes.get(edge.source);
            const v = this.graph.nodes.get(edge.target);
            if (!u || !v) continue;

            const latlngs = [[u.lat, u.lng], [v.lat, v.lng]];

            let polyline;
            if (edge.isBlocked || edge.roadType === 'blocked') {
                // Blocked Edge
                polyline = L.polyline(latlngs, {
                    color: '#d32f2f',
                    weight: 6,
                    opacity: 0.9,
                    dashArray: '8, 8',
                    className: 'blocked-edge-line'
                });
                polyline.bindTooltip(`🚫 BLOCKED ROAD (Cost: ∞)<br>${u.name} ↔ ${v.name}`, { sticky: true, className: 'dark-tooltip' });
                this.layers.blockedEdges.addLayer(polyline);
            } else if (edge.roadType === 'shortcut') {
                // Shortcut / Express Edge
                polyline = L.polyline(latlngs, {
                    color: '#00e676',
                    weight: 5,
                    opacity: 0.9,
                    className: 'shortcut-edge-line'
                });
                polyline.bindTooltip(`⚡ SHORTCUT ROAD (Cost: 0.5x, Dist: ${edge.distance}km)<br>${u.name} ↔ ${v.name}`, { sticky: true, className: 'dark-tooltip' });
                this.layers.shortcuts.addLayer(polyline);
            } else {
                // Normal Road
                polyline = L.polyline(latlngs, {
                    color: '#455060',
                    weight: 3.5,
                    opacity: 0.7,
                    className: 'normal-edge-line'
                });
                polyline.bindTooltip(`🛣️ Normal Road (1.0x, ${edge.distance}km)<br>${u.name} ↔ ${v.name}`, { sticky: true, className: 'dark-tooltip' });
                this.layers.edges.addLayer(polyline);
            }

            // Click listener on edge
            polyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (this.onEdgeClickCallback) {
                    this.onEdgeClickCallback(edge);
                }
            });
        }

        // 2. Render Nodes
        for (const [, node] of this.graph.nodes) {
            // Traffic light marker or standard node
            if (node.type === 'traffic-light') {
                const isRed = node.lightState === 'red';
                const lightColor = isRed ? '#e53935' : '#fbc02d';
                const lightCost = isRed ? '+4.0' : '+1.5';
                const lightIcon = L.divIcon({
                    className: 'traffic-light-marker-wrapper',
                    html: `
                        <div class="traffic-light-pill ${node.lightState}">
                            <div class="traffic-bulb ${node.lightState}"></div>
                            <span class="traffic-cost-badge">${lightCost}</span>
                        </div>
                    `,
                    iconSize: [28, 38],
                    iconAnchor: [14, 19]
                });

                const marker = L.marker([node.lat, node.lng], { icon: lightIcon, zIndexOffset: 500 });
                marker.bindTooltip(`🚦 Traffic Light: <b>${node.name}</b><br>State: <b>${node.lightState.toUpperCase()}</b> (Cost Delay: ${lightCost})`, { sticky: true, className: 'dark-tooltip' });
                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onNodeClickCallback) {
                        this.onNodeClickCallback(node);
                    }
                });
                this.layers.trafficLights.addLayer(marker);

            } else if (node.isBlocked) {
                // Blocked node
                const wallIcon = L.divIcon({
                    className: 'wall-node-marker-wrapper',
                    html: `<div class="wall-node-badge">🧱</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                const marker = L.marker([node.lat, node.lng], { icon: wallIcon, zIndexOffset: 500 });
                marker.bindTooltip(`🧱 Blocked Intersection: <b>${node.name}</b> (Cost: ∞)`, { sticky: true, className: 'dark-tooltip' });
                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onNodeClickCallback) {
                        this.onNodeClickCallback(node);
                    }
                });
                this.layers.nodes.addLayer(marker);

            } else {
                // Standard Graph Node Circle
                const circle = L.circleMarker([node.lat, node.lng], {
                    radius: 5,
                    fillColor: '#64b5f6',
                    color: '#1e293b',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9,
                    className: 'city-node-circle'
                });

                circle.bindTooltip(`📍 <b>${node.name}</b>`, { sticky: true, className: 'dark-tooltip' });
                circle.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (this.onNodeClickCallback) {
                        this.onNodeClickCallback(node);
                    }
                });
                this.layers.nodes.addLayer(circle);
            }
        }
    }

    /**
     * Set Start Node with custom Blue marker
     */
    setStartNode(nodeId) {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return;

        this.startNodeId = nodeId;

        if (this.layers.startMarker) {
            this.map.removeLayer(this.layers.startMarker);
        }

        const startIcon = L.divIcon({
            className: 'origin-marker-wrapper',
            html: `
                <div class="pin-ring start-ring"></div>
                <div class="pin-circle start-circle">🔵</div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        this.layers.startMarker = L.marker([node.lat, node.lng], {
            icon: startIcon,
            zIndexOffset: 900
        }).addTo(this.map);

        this.layers.startMarker.bindTooltip(`🔵 <b>START</b>: ${node.name}`, { permanent: false, className: 'dark-tooltip' });
    }

    /**
     * Set Destination Node with custom Purple marker
     */
    setEndNode(nodeId) {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return;

        this.endNodeId = nodeId;

        if (this.layers.endMarker) {
            this.map.removeLayer(this.layers.endMarker);
        }

        const endIcon = L.divIcon({
            className: 'dest-marker-wrapper',
            html: `
                <div class="pin-ring dest-ring"></div>
                <div class="pin-circle dest-circle">🟣</div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        this.layers.endMarker = L.marker([node.lat, node.lng], {
            icon: endIcon,
            zIndexOffset: 900
        }).addTo(this.map);

        this.layers.endMarker.bindTooltip(`🟣 <b>DESTINATION</b>: ${node.name}`, { permanent: false, className: 'dark-tooltip' });
    }

    /**
     * Draw the calculated shortest path on the map
     */
    drawShortestPath(pathNodes) {
        this.layers.route.clearLayers();
        if (!pathNodes || pathNodes.length < 2) return;

        const coords = pathNodes.map(n => [n.lat, n.lng]);

        // Background glow polyline
        const glowPolyline = L.polyline(coords, {
            color: '#00e676',
            weight: 10,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-glow-path'
        });

        // Core optimal polyline
        const corePolyline = L.polyline(coords, {
            color: '#00ff88',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'route-core-path'
        });

        this.layers.route.addLayer(glowPolyline);
        this.layers.route.addLayer(corePolyline);

        // Fit map bounds to show full route with comfortable padding
        this.map.fitBounds(corePolyline.getBounds(), { padding: [50, 50], maxZoom: 15 });
    }

    /**
     * Clear displayed shortest route
     */
    clearRoute() {
        this.layers.route.clearLayers();
        this.layers.algorithmViz.clearLayers();
    }

    /**
     * Clear all algorithm visualization markers
     */
    clearAlgorithmViz() {
        this.layers.algorithmViz.clearLayers();
    }

    /**
     * Highlight a node during step-by-step algorithm exploration
     */
    highlightExplorationNode(nodeId, state = 'visited') {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return;

        const colors = {
            evaluating: '#00e5ff', // Cyan
            visited: '#ff9100',    // Amber
            settled: '#76ff03'     // Lime
        };

        const color = colors[state] || colors.visited;

        const marker = L.circleMarker([node.lat, node.lng], {
            radius: state === 'evaluating' ? 8 : 6,
            fillColor: color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            className: `viz-node-${state}`
        });

        this.layers.algorithmViz.addLayer(marker);
    }

    /**
     * Toggle visibility of background graph roads and nodes
     */
    toggleGraphOverlay(show) {
        this.showGraphOverlay = show !== undefined ? show : !this.showGraphOverlay;
        if (this.showGraphOverlay) {
            this.renderGraphLayers();
        } else {
            this.layers.edges.clearLayers();
            this.layers.shortcuts.clearLayers();
            this.layers.blockedEdges.clearLayers();
            this.layers.nodes.clearLayers();
            this.layers.trafficLights.clearLayers();
        }
        return this.showGraphOverlay;
    }

    /**
     * Full Map Reset: clear route, markers, restore default graph state
     */
    reset() {
        this.clearRoute();
        this.clearAlgorithmViz();

        if (this.layers.startMarker) {
            this.map.removeLayer(this.layers.startMarker);
            this.layers.startMarker = null;
        }
        if (this.layers.endMarker) {
            this.map.removeLayer(this.layers.endMarker);
            this.layers.endMarker = null;
        }

        this.startNodeId = null;
        this.endNodeId = null;

        this.graph.resetState();
        this.renderGraphLayers();
        this.map.setView([17.4150, 78.4450], 13);
    }
}
