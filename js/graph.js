/**
 * ============================================================================
 * AUTHORITATIVE ROAD NETWORK GRAPH & GEOMETRY ENGINE (js/graph.js)
 * ============================================================================
 *
 * Engineering Principles:
 * 1. THE ROAD NETWORK IS THE SINGLE SOURCE OF TRUTH.
 * 2. Nodes represent verified road intersections (connectedEdges >= 1).
 * 3. Edges represent real multi-point road curves strictly following OSM geometry.
 * 4. Coordinate standard is Leaflet [lat, lng].
 * 5. Directional reversal is strictly non-mutating: [...edge.coordinates].reverse().
 * 6. Cost models:
 *    - Normal Route: Distance in meters (physical road distance)
 *    - Dijkstra Fastest: Travel time in seconds with live traffic signal delays:
 *        travelTime = roadTravelTime + signalDelay
 *        Green = 0s, Yellow = 10s, Red = 30s.
 */

if (typeof require !== 'undefined') {
    if (typeof GeoUtils === 'undefined') {
        globalThis.GeoUtils = require('./geoUtils.js');
    }
}

class CityRoadGraph {
    constructor() {
        // Authoritative Road Network Model
        this.roadNetwork = {
            nodes: {},
            edges: {},
            signals: {}
        };

        // Adjacency Map: nodeId -> array of directed edge descriptors
        // { id, from, to, name, coordinates, distanceMeters, speedKmh, blocked, shortcut, isReverse }
        this.adjacencyMap = new Map();

        // Initialize with real OSM Hyderabad road network
        this.loadDefaultNetwork();
    }

    /**
     * Load authoritative Central Hyderabad Road Network
     */
    loadDefaultNetwork() {
        this.roadNetwork = {
            nodes: {},
            edges: {},
            signals: {}
        };
        this.adjacencyMap.clear();

        // 1. Authoritative Nodes (Real Hyderabad road intersections)
        const nodesData = [
            { id: "lakdikapul", name: "Lakdikapul Junction", lat: 17.4042, lng: 78.4633, type: "intersection" },
            { id: "nampally", name: "Nampally Station", lat: 17.3921, lng: 78.4716, type: "intersection" },
            { id: "khairatabad", name: "Khairatabad Junction", lat: 17.4116, lng: 78.4611, type: "intersection" },
            { id: "necklace_south", name: "PVNR Marg South (IMAX Gate)", lat: 17.4157, lng: 78.4660, type: "intersection" },
            { id: "secretariat", name: "Telangana Secretariat Circle", lat: 17.4089, lng: 78.4755, type: "intersection", trafficSignalId: "sig_secretariat" },
            { id: "tankbund_south", name: "Tank Bund South (Lumbini Park)", lat: 17.4145, lng: 78.4795, type: "intersection", trafficSignalId: "sig_tankbund_south" },
            { id: "lower_tankbund", name: "Lower Tank Bund Entry", lat: 17.4128, lng: 78.4784, type: "intersection" },
            { id: "tankbund_mid", name: "Tank Bund Road (Promenade Mid)", lat: 17.4215, lng: 78.4845, type: "intersection" },
            { id: "ranigunj", name: "Ranigunj / Tank Bund North", lat: 17.4365, lng: 78.4842, type: "intersection" },
            { id: "kavadiguda", name: "Kavadiguda Crossroads", lat: 17.4225, lng: 78.4866, type: "intersection" },
            { id: "necklace_mid", name: "PVNR Marg (People's Plaza)", lat: 17.4264, lng: 78.4623, type: "intersection" },
            { id: "jalavihar", name: "PVNR Marg (Jalavihar)", lat: 17.4305, lng: 78.4629, type: "intersection" },
            { id: "sanjeevaiah", name: "Sanjeevaiah Park Station", lat: 17.4374, lng: 78.4691, type: "intersection" },
            { id: "raj_bhavan", name: "Raj Bhavan Road", lat: 17.4190, lng: 78.4585, type: "intersection" },
            { id: "somajiguda", name: "Somajiguda Circle", lat: 17.4257, lng: 78.4530, type: "intersection" },
            { id: "punjagutta", name: "Punjagutta Central Circle", lat: 17.4270, lng: 78.4523, type: "intersection", trafficSignalId: "sig_punjagutta" },
            { id: "ameerpet", name: "Ameerpet Crossroads", lat: 17.4360, lng: 78.4554, type: "intersection" },
            { id: "begumpet", name: "Begumpet Flyover Junction", lat: 17.4420, lng: 78.4580, type: "intersection", trafficSignalId: "sig_begumpet" },
            { id: "minister_road", name: "Minister Road Junction", lat: 17.4411, lng: 78.4789, type: "intersection" },
            { id: "paradise", name: "Paradise Circle", lat: 17.4422, lng: 78.4878, type: "intersection" }
        ];

        nodesData.forEach(n => {
            this.roadNetwork.nodes[n.id] = {
                id: n.id,
                name: n.name,
                lat: n.lat,
                lng: n.lng,
                type: n.type || "intersection",
                connectedEdges: [],
                trafficSignalId: n.trafficSignalId || null
            };
            this.adjacencyMap.set(n.id, []);
        });

        // 2. Authoritative Edges with True Intermediate OSM Curves
        const edgesData = [
            {
                id: "lakdikapul--khairatabad", from: "lakdikapul", to: "khairatabad",
                name: "Khairatabad Road", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4042, 78.4633], [17.4055, 78.4638], [17.4068, 78.4618], [17.4085, 78.4614], [17.4116, 78.4611]
                ]
            },
            {
                id: "lakdikapul--nampally", from: "lakdikapul", to: "nampally",
                name: "Nampally Station Road", roadType: "normal", speedKmh: 40,
                coordinates: [
                    [17.4042, 78.4633], [17.4010, 78.4660], [17.3975, 78.4685], [17.3940, 78.4705], [17.3921, 78.4716]
                ]
            },
            {
                id: "khairatabad--necklace_south", from: "khairatabad", to: "necklace_south",
                name: "IMAX Lake Link Road", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4116, 78.4611], [17.4132, 78.4622], [17.4148, 78.4636], [17.4157, 78.4660]
                ]
            },
            {
                id: "khairatabad--secretariat", from: "khairatabad", to: "secretariat",
                name: "NTR Marg (Lakeside Boulevard)", roadType: "normal", speedKmh: 50,
                coordinates: [
                    [17.4116, 78.4611], [17.4112, 78.4645], [17.4100, 78.4690], [17.4095, 78.4725], [17.4089, 78.4755]
                ]
            },
            {
                id: "khairatabad--raj_bhavan", from: "khairatabad", to: "raj_bhavan",
                name: "Raj Bhavan Road South", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4116, 78.4611], [17.4135, 78.4601], [17.4160, 78.4592], [17.4190, 78.4585]
                ]
            },
            {
                id: "raj_bhavan--somajiguda", from: "raj_bhavan", to: "somajiguda",
                name: "Raj Bhavan Road North", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4190, 78.4585], [17.4215, 78.4578], [17.4238, 78.4568], [17.4257, 78.4530]
                ]
            },
            {
                id: "somajiguda--punjagutta", from: "somajiguda", to: "punjagutta",
                name: "Punjagutta Main Road", roadType: "normal", speedKmh: 40,
                coordinates: [
                    [17.4257, 78.4530], [17.4264, 78.4526], [17.4270, 78.4523]
                ]
            },
            {
                id: "punjagutta--ameerpet", from: "punjagutta", to: "ameerpet",
                name: "Ameerpet Metro Corridor", roadType: "normal", speedKmh: 40,
                coordinates: [
                    [17.4270, 78.4523], [17.4301, 78.4481], [17.4315, 78.4500], [17.4349, 78.4504], [17.4360, 78.4554]
                ]
            },
            {
                id: "somajiguda--begumpet", from: "somajiguda", to: "begumpet",
                name: "Begumpet Main Road", roadType: "normal", speedKmh: 50,
                coordinates: [
                    [17.4257, 78.4530], [17.4305, 78.4580], [17.4356, 78.4557], [17.4385, 78.4565], [17.4420, 78.4580]
                ]
            },
            {
                id: "necklace_south--necklace_mid", from: "necklace_south", to: "necklace_mid",
                name: "PVNR Marg (Lakefront South)", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4157, 78.4660], [17.4180, 78.4630], [17.4220, 78.4625], [17.4264, 78.4623]
                ]
            },
            {
                id: "necklace_mid--jalavihar", from: "necklace_mid", to: "jalavihar",
                name: "PVNR Marg (Mid Lake Arc)", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4264, 78.4623], [17.4285, 78.4625], [17.4305, 78.4629]
                ]
            },
            {
                id: "jalavihar--sanjeevaiah", from: "jalavihar", to: "sanjeevaiah",
                name: "PVNR Marg (North Lakefront)", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4305, 78.4629], [17.4335, 78.4650], [17.4360, 78.4675], [17.4374, 78.4691]
                ]
            },
            {
                id: "sanjeevaiah--minister_road", from: "sanjeevaiah", to: "minister_road",
                name: "Minister Road Link", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4374, 78.4691], [17.4390, 78.4745], [17.4411, 78.4789]
                ]
            },
            {
                id: "sanjeevaiah--ranigunj", from: "sanjeevaiah", to: "ranigunj",
                name: "Sanjeevaiah to Ranigunj Connector", roadType: "normal", speedKmh: 40,
                coordinates: [
                    [17.4374, 78.4691], [17.4375, 78.4760], [17.4375, 78.4800], [17.4365, 78.4842]
                ]
            },
            {
                id: "secretariat--tankbund_south", from: "secretariat", to: "tankbund_south",
                name: "Lumbini Access Road", roadType: "normal", speedKmh: 40,
                coordinates: [
                    [17.4089, 78.4755], [17.4110, 78.4770], [17.4128, 78.4785], [17.4145, 78.4795]
                ]
            },
            {
                id: "tankbund_south--tankbund_mid", from: "tankbund_south", to: "tankbund_mid",
                name: "Tank Bund Road South", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4145, 78.4795], [17.4180, 78.4820], [17.4200, 78.4835], [17.4215, 78.4845]
                ]
            },
            {
                id: "tankbund_mid--ranigunj", from: "tankbund_mid", to: "ranigunj",
                name: "Tank Bund Road North", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4215, 78.4845], [17.4257, 78.4864], [17.4305, 78.4868], [17.4343, 78.4868], [17.4365, 78.4842]
                ]
            },
            {
                id: "secretariat--lower_tankbund", from: "secretariat", to: "lower_tankbund",
                name: "Telugu Thalli Flyover Entry", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4089, 78.4755], [17.4105, 78.4770], [17.4128, 78.4784]
                ]
            },
            {
                id: "lower_tankbund--kavadiguda", from: "lower_tankbund", to: "kavadiguda",
                name: "Lower Tank Bund Express Bypass", roadType: "shortcut", speedKmh: 65,
                coordinates: [
                    [17.4128, 78.4784], [17.4153, 78.4800], [17.4194, 78.4834], [17.4211, 78.4850], [17.4225, 78.4866]
                ]
            },
            {
                id: "kavadiguda--ranigunj", from: "kavadiguda", to: "ranigunj",
                name: "Kavadiguda Arterial", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4225, 78.4866], [17.4265, 78.4865], [17.4310, 78.4855], [17.4365, 78.4842]
                ]
            },
            {
                id: "begumpet--minister_road", from: "begumpet", to: "minister_road",
                name: "Begumpet Airport Road", roadType: "normal", speedKmh: 50,
                coordinates: [
                    [17.4420, 78.4580], [17.4428, 78.4665], [17.4420, 78.4715], [17.4411, 78.4789]
                ]
            },
            {
                id: "minister_road--paradise", from: "minister_road", to: "paradise",
                name: "MG Road / Paradise Corridor", roadType: "normal", speedKmh: 50,
                coordinates: [
                    [17.4411, 78.4789], [17.4415, 78.4820], [17.4418, 78.4850], [17.4422, 78.4878]
                ]
            },
            {
                id: "ranigunj--paradise", from: "ranigunj", to: "paradise",
                name: "Bible House / RP Road", roadType: "normal", speedKmh: 45,
                coordinates: [
                    [17.4365, 78.4842], [17.4385, 78.4860], [17.4405, 78.4870], [17.4422, 78.4878]
                ]
            }
        ];

        edgesData.forEach(e => {
            const distMeters = Math.round(GeoUtils.polylineDistanceMeters(e.coordinates));
            const edgeObj = {
                id: e.id,
                from: e.from,
                to: e.to,
                name: e.name,
                coordinates: e.coordinates,
                distanceMeters: distMeters,
                distanceKm: Number((distMeters / 1000).toFixed(3)),
                roadType: e.roadType || "normal",
                speedKmh: e.speedKmh || (e.roadType === "shortcut" ? 65 : 45),
                blocked: false,
                shortcut: e.roadType === "shortcut",
                trafficSignalId: this.roadNetwork.nodes[e.to]?.trafficSignalId || null
            };

            this.roadNetwork.edges[e.id] = edgeObj;

            // Connect to nodes
            this.roadNetwork.nodes[e.from].connectedEdges.push(e.id);
            this.roadNetwork.nodes[e.to].connectedEdges.push(e.id);

            // Register directed traversals in adjacency map
            // Forward traversal: from -> to
            this.adjacencyMap.get(e.from).push({
                edgeId: e.id,
                from: e.from,
                to: e.to,
                isReverse: false
            });

            // Reverse traversal: to -> from (Bidirectional road)
            this.adjacencyMap.get(e.to).push({
                edgeId: e.id,
                from: e.to,
                to: e.from,
                isReverse: true
            });
        });

        // 3. Authoritative Traffic Signals (Section 13, 14, 17)
        // Delays: green = 0s, yellow = 10s, red = 30s
        this.roadNetwork.signals = {
            "sig_secretariat": {
                id: "sig_secretariat",
                nodeId: "secretariat",
                state: "GREEN",
                delays: { green: 0, yellow: 10, red: 30 }
            },
            "sig_tankbund_south": {
                id: "sig_tankbund_south",
                nodeId: "tankbund_south",
                state: "RED",
                delays: { green: 0, yellow: 10, red: 30 }
            },
            "sig_punjagutta": {
                id: "sig_punjagutta",
                nodeId: "punjagutta",
                state: "YELLOW",
                delays: { green: 0, yellow: 10, red: 30 }
            },
            "sig_begumpet": {
                id: "sig_begumpet",
                nodeId: "begumpet",
                state: "GREEN",
                delays: { green: 0, yellow: 10, red: 30 }
            }
        };

        // Run validation immediately to ensure 100% integrity
        this.validateTrafficSignals();
    }

    /**
     * Section 15: Signal Validation
     * Confirms node exists, is intersection, has >= 2 connected edges, and valid coordinates.
     */
    validateTrafficSignals() {
        const invalidSignalIds = [];

        for (const [sigId, signal] of Object.entries(this.roadNetwork.signals)) {
            const node = this.roadNetwork.nodes[signal.nodeId];
            if (!node) {
                console.warn(`[TRAFFIC] Invalid traffic signal removed (node '${signal.nodeId}' does not exist):`, sigId);
                invalidSignalIds.push(sigId);
                continue;
            }

            if (node.type !== "intersection") {
                console.warn(`[TRAFFIC] Invalid traffic signal removed (node '${node.id}' is not an intersection):`, sigId);
                invalidSignalIds.push(sigId);
                continue;
            }

            if (!node.connectedEdges || node.connectedEdges.length < 2) {
                console.warn(`[TRAFFIC] Invalid traffic signal removed (node '${node.id}' has < 2 connected edges):`, sigId);
                invalidSignalIds.push(sigId);
                continue;
            }

            if (typeof node.lat !== 'number' || typeof node.lng !== 'number') {
                console.warn(`[TRAFFIC] Invalid traffic signal removed (invalid coordinate):`, sigId);
                invalidSignalIds.push(sigId);
                continue;
            }
        }

        invalidSignalIds.forEach(id => {
            const nodeId = this.roadNetwork.signals[id]?.nodeId;
            if (nodeId && this.roadNetwork.nodes[nodeId]) {
                this.roadNetwork.nodes[nodeId].trafficSignalId = null;
            }
            delete this.roadNetwork.signals[id];
        });

        return {
            validCount: Object.keys(this.roadNetwork.signals).length,
            removedCount: invalidSignalIds.length
        };
    }

    /**
     * Travel time cost model for DIJKSTRA FASTEST ROUTE (Section 17 & 22)
     * Cost in Seconds = roadTravelTimeSeconds + signalDelaySeconds
     * Speed multiplier applied for shortcuts (0.85).
     */
    getTravelTimeSeconds(edgeId, targetNodeId) {
        const edge = this.roadNetwork.edges[edgeId];
        if (!edge || edge.blocked) return Infinity;

        const targetNode = this.roadNetwork.nodes[targetNodeId];
        if (!targetNode || targetNode.blocked) return Infinity;

        let speedKmh = edge.speedKmh || 45;
        let speedMultiplier = 1.0;

        if (edge.shortcut || edge.roadType === "shortcut") {
            speedKmh = Math.max(speedKmh, 65);
            speedMultiplier = 0.85; // Bypass speed advantage
        }

        // Base road travel time: (distance in meters / speed in m/s) * multiplier
        const speedMps = (speedKmh * 1000) / 3600;
        let travelTimeSec = (edge.distanceMeters / speedMps) * speedMultiplier;

        // Intersection traffic signal delay at target node
        let signalDelaySec = 0;
        if (targetNode.trafficSignalId && this.roadNetwork.signals[targetNode.trafficSignalId]) {
            const signal = this.roadNetwork.signals[targetNode.trafficSignalId];
            const state = signal.state?.toUpperCase();
            if (state === "RED") {
                signalDelaySec = signal.delays.red; // 30s
            } else if (state === "YELLOW") {
                signalDelaySec = signal.delays.yellow; // 10s
            } else {
                signalDelaySec = signal.delays.green; // 0s
            }
        }

        return travelTimeSec + signalDelaySec;
    }

    /**
     * Distance cost model for NORMAL ROUTE (Section 22)
     * Cost in Meters = physical road distance
     */
    getDistanceCostMeters(edgeId, targetNodeId) {
        const edge = this.roadNetwork.edges[edgeId];
        if (!edge || edge.blocked) return Infinity;

        const targetNode = this.roadNetwork.nodes[targetNodeId];
        if (!targetNode || targetNode.blocked) return Infinity;

        return edge.distanceMeters;
    }

    /**
     * Section 26 & 27: Get Directed Edge Coordinates
     * Traverses in forward direction if from === edge.from;
     * Returns reversed copy if traversing from edge.to to edge.from.
     * NEVER mutates the underlying edge.coordinates array.
     */
    getDirectedCoordinates(edgeId, traversalFromNodeId) {
        const edge = this.roadNetwork.edges[edgeId];
        if (!edge) return [];

        if (traversalFromNodeId === edge.from) {
            // Forward direction
            return [...edge.coordinates];
        } else if (traversalFromNodeId === edge.to) {
            // Reverse direction: reverse coordinates without mutating original
            return [...edge.coordinates].reverse();
        }

        console.error(`[ROUTING] Traversal node ${traversalFromNodeId} does not match edge ${edgeId} endpoints`);
        return [...edge.coordinates];
    }

    /**
     * Section 3 & 43: Intelligent Snap-To-Road System
     * 1. Takes clicked lat/lng.
     * 2. Finds nearest road segment across all edge polylines.
     * 3. Orthogonally projects point onto road segment.
     * 4. Snaps to road and identifies corresponding nearest graph node.
     */
    snapPointToRoad(lat, lng, maxSearchMeters = 2000) {
        const clickCoord = [lat, lng];
        let bestEdge = null;
        let bestProjPoint = null;
        let minDistanceMeters = Infinity;
        let bestNode = null;

        for (const [edgeId, edge] of Object.entries(this.roadNetwork.edges)) {
            const coords = edge.coordinates;
            for (let i = 0; i < coords.length - 1; i++) {
                const proj = GeoUtils.projectPointOnSegment(clickCoord, coords[i], coords[i + 1]);
                const dist = GeoUtils.distanceMeters(clickCoord, proj.point);

                if (dist < minDistanceMeters) {
                    minDistanceMeters = dist;
                    bestProjPoint = proj.point;
                    bestEdge = edge;

                    // Choose closest node of this edge to the projected point
                    const dFrom = GeoUtils.distanceMeters(proj.point, [this.roadNetwork.nodes[edge.from].lat, this.roadNetwork.nodes[edge.from].lng]);
                    const dTo = GeoUtils.distanceMeters(proj.point, [this.roadNetwork.nodes[edge.to].lat, this.roadNetwork.nodes[edge.to].lng]);
                    const chosenNodeId = dFrom <= dTo ? edge.from : edge.to;
                    bestNode = this.roadNetwork.nodes[chosenNodeId];
                }
            }
        }

        if (bestEdge && bestNode && minDistanceMeters <= maxSearchMeters) {
            return {
                success: true,
                snappedLat: bestProjPoint[0],
                snappedLng: bestProjPoint[1],
                distanceMeters: minDistanceMeters,
                edge: bestEdge,
                node: bestNode
            };
        }

        // Fallback to closest node if within range
        let closestNode = null;
        let minNodeDist = Infinity;
        for (const [, node] of Object.entries(this.roadNetwork.nodes)) {
            const d = GeoUtils.distanceMeters(clickCoord, [node.lat, node.lng]);
            if (d < minNodeDist) {
                minNodeDist = d;
                closestNode = node;
            }
        }

        if (closestNode && minNodeDist <= maxSearchMeters) {
            return {
                success: true,
                snappedLat: closestNode.lat,
                snappedLng: closestNode.lng,
                distanceMeters: minNodeDist,
                edge: null,
                node: closestNode
            };
        }

        return { success: false, distanceMeters: minDistanceMeters };
    }

    /**
     * Reset dynamic obstacles, shortcuts, and custom changes
     */
    resetState() {
        this.loadDefaultNetwork();
    }
}

// Attach to window for standard browser script execution
if (typeof window !== 'undefined') {
    window.CityRoadGraph = CityRoadGraph;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CityRoadGraph;
}
