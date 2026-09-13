/**
 * ============================================================================
 * GRAPH DATA STRUCTURE & ROAD NETWORK TOPOLOGY (js/graph.js)
 * ============================================================================
 *
 * Single Source of Truth for:
 * 1. Hyderabad Central Road Network (nodes, edges, traffic signals, geometry)
 * 2. Topological Graph Adjacency List for manual Dijkstra traversal
 * 3. Distance & Speed-based Cost Models (Distance, Travel Time, Traffic Delays)
 * 4. Snapping algorithms (Nearest Node & Perpendicular Road Segment Projection)
 */

if (typeof require !== 'undefined') {
    if (typeof GeoUtils === 'undefined') {
        globalThis.GeoUtils = require('./geoUtils.js');
    }
    if (typeof CITY_ROAD_NETWORK_DATA === 'undefined') {
        const dataMod = require('./data.js');
        globalThis.CITY_ROAD_NETWORK_DATA = dataMod.CITY_ROAD_NETWORK_DATA;
    }
}

class CityRoadGraph {
    constructor(networkData = null) {
        this.rawNetworkData = networkData || (typeof CITY_ROAD_NETWORK_DATA !== 'undefined' ? CITY_ROAD_NETWORK_DATA : null);
        if (!this.rawNetworkData && typeof require !== 'undefined') {
            try {
                this.rawNetworkData = require('../data/city-road-network.json');
            } catch (e) {
                // fallback
            }
        }

        // Deep copy of network data for runtime state modifications
        this.roadNetwork = null;
        this.nodes = new Map();         // nodeId -> node object
        this.edges = new Map();         // edgeId -> edge object
        this.adjacencyList = new Map();  // nodeId -> Edge[]
        this.signals = new Map();       // signalId -> signal object

        this.initNetwork();
    }

    /**
     * Initialize or reload the road network topology
     */
    initNetwork() {
        if (!this.rawNetworkData) {
            console.error('[CityRoadGraph] Missing road network dataset!');
            return;
        }

        // Deep clone so resetState() can restore original values
        this.roadNetwork = JSON.parse(JSON.stringify(this.rawNetworkData));

        this.nodes.clear();
        this.edges.clear();
        this.adjacencyList.clear();
        this.signals.clear();

        // 1. Load Nodes
        for (const [id, node] of Object.entries(this.roadNetwork.nodes)) {
            this.nodes.set(id, node);
            this.adjacencyList.set(id, []);
        }

        // 2. Load Signals
        if (this.roadNetwork.signals) {
            for (const [id, sig] of Object.entries(this.roadNetwork.signals)) {
                this.signals.set(id, sig);
                // Attach signal ref to the node
                const node = this.nodes.get(sig.nodeId);
                if (node) {
                    node.trafficSignal = sig;
                    node.trafficLight = true;
                    node.trafficState = sig.state.toLowerCase();
                }
            }
        }

        // 3. Load Edges (Forward and Reverse for full bidirectional navigation)
        for (const [id, edge] of Object.entries(this.roadNetwork.edges)) {
            this.edges.set(id, edge);

            // Forward adjacency
            if (this.adjacencyList.has(edge.from)) {
                this.adjacencyList.get(edge.from).push(edge);
            }

            // Ensure reverse edge exists if not explicitly present in dataset
            const revId = `${edge.to}--${edge.from}`;
            if (!this.roadNetwork.edges[revId]) {
                const revEdge = {
                    id: revId,
                    from: edge.to,
                    to: edge.from,
                    name: edge.name,
                    coordinates: [...edge.coordinates].reverse(),
                    distanceMeters: edge.distanceMeters,
                    distanceKm: edge.distanceKm,
                    roadType: edge.roadType,
                    speedKmh: edge.speedKmh,
                    blocked: edge.blocked,
                    shortcut: edge.shortcut,
                    trafficSignalId: edge.trafficSignalId
                };
                this.edges.set(revId, revEdge);
                if (this.adjacencyList.has(edge.to)) {
                    this.adjacencyList.get(edge.to).push(revEdge);
                }
            }
        }
    }

    /**
     * Reset all road network modifications, signals, blockades, and shortcuts
     */
    resetState() {
        this.initNetwork();
    }

    /**
     * Compute traversal cost for Normal Route:
     * Minimizes purely geographic road distance (meters) on unblocked roads.
     */
    getDistanceCost(edge) {
        if (edge.blocked) return Infinity;
        const toNode = this.nodes.get(edge.to);
        if (toNode && toNode.blocked) return Infinity;
        return edge.distanceMeters || (edge.distanceKm * 1000);
    }

    /**
     * Compute traversal cost for Dijkstra Fastest Route:
     * Minimizes simulated travel time in seconds:
     *   travelTimeSeconds = (distanceMeters / speedMetersPerSecond) + destinationTrafficSignalDelay
     */
    getFastestCost(edge) {
        if (edge.blocked) return Infinity;
        const toNode = this.nodes.get(edge.to);
        if (toNode && toNode.blocked) return Infinity;

        // Base Speed in km/h
        let speedKmh = edge.speedKmh || 45;
        if (edge.shortcut || edge.roadType === 'shortcut') {
            speedKmh = Math.max(speedKmh, 65);
        }

        const speedMps = (speedKmh * 1000) / 3600; // km/h -> m/s
        const distMeters = edge.distanceMeters || (edge.distanceKm * 1000);
        let travelTimeSec = distMeters / speedMps;

        // Shortcut travel time bonus modifier (50% faster on express corridors)
        if (edge.shortcut || edge.roadType === 'shortcut') {
            travelTimeSec *= 0.65;
        }

        // Traffic Light delay at destination intersection
        let signalDelaySec = 0;
        const sigId = edge.trafficSignalId || (toNode ? toNode.trafficSignalId : null);
        let signal = sigId ? (this.roadNetwork.signals?.[sigId] || this.signals.get(sigId)) : null;

        if (signal) {
            const state = (signal.state || '').toUpperCase();
            if (state === 'RED') {
                signalDelaySec = signal.delays?.red || 60; // 60s delay
            } else if (state === 'YELLOW') {
                signalDelaySec = signal.delays?.yellow || 20; // 20s delay
            } else {
                signalDelaySec = signal.delays?.green || 0; // 0s delay
            }
        }

        return travelTimeSec + signalDelaySec;
    }

    /**
     * Find nearest road segment or node to the given coordinates
     * Snaps with perpendicular line projection for pinpoint accuracy
     */
    findNearestRoadAndNode(lat, lng, maxDistanceKm = 2.0) {
        let bestCandidate = null;
        let minDistanceMeters = Infinity;

        // 1. Check all graph nodes
        for (const [, node] of this.nodes) {
            const dist = GeoUtils.distanceMeters([lat, lng], [node.lat, node.lng]);
            if (dist < minDistanceMeters) {
                minDistanceMeters = dist;
                bestCandidate = {
                    type: 'node',
                    node: node,
                    snappedLat: node.lat,
                    snappedLng: node.lng,
                    distanceMeters: dist,
                    distanceKm: dist / 1000
                };
            }
        }

        // 2. Check all road geometry segments for tighter perpendicular projection
        for (const [, edge] of this.edges) {
            const coords = edge.coordinates;
            if (!coords || coords.length < 2) continue;

            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = coords[i];
                const p2 = coords[i + 1];

                const projected = this.projectPointOnSegment(lat, lng, p1[0], p1[1], p2[0], p2[1]);
                const dist = GeoUtils.distanceMeters([lat, lng], [projected.lat, projected.lng]);

                if (dist < minDistanceMeters) {
                    minDistanceMeters = dist;
                    const dFrom = GeoUtils.distanceMeters([projected.lat, projected.lng], [coords[0][0], coords[0][1]]);
                    const dTo = GeoUtils.distanceMeters([projected.lat, projected.lng], [coords[coords.length - 1][0], coords[coords.length - 1][1]]);
                    const closestNodeId = dFrom <= dTo ? edge.from : edge.to;

                    bestCandidate = {
                        type: 'road',
                        edge: edge,
                        node: this.nodes.get(closestNodeId),
                        snappedLat: projected.lat,
                        snappedLng: projected.lng,
                        distanceMeters: dist,
                        distanceKm: dist / 1000
                    };
                }
            }
        }

        return bestCandidate;
    }

    /**
     * Orthogonal projection of point P onto segment AB
     */
    projectPointOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
        const dx = bLng - aLng;
        const dy = bLat - aLat;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            return { lat: aLat, lng: aLng };
        }

        const t = Math.max(0, Math.min(1, ((pLng - aLng) * dx + (pLat - aLat) * dy) / lengthSq));
        return {
            lat: aLat + t * dy,
            lng: aLng + t * dx
        };
    }
}

if (typeof window !== 'undefined') {
    window.CityRoadGraph = CityRoadGraph;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CityRoadGraph;
}
