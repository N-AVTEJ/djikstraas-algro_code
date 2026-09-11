/**
 * ============================================================================
 * GRAPH DATA STRUCTURE & ROAD GEOMETRY ENGINE (js/graph.js)
 * ============================================================================
 *
 * Academic & Architectural Context:
 * Represents the topological road network of Hyderabad, India.
 * Acts as the Single Source of Truth for:
 * 1. Geographic intersections (Nodes: lat, lng, traffic lights, obstacles)
 * 2. Multi-point Road Segments (Edges: exact road coordinates, distance, speed, type)
 * 3. Realistic travel-time and distance-based cost models
 * 4. Nearest-road / Nearest-node snapping algorithms
 */

class CityRoadGraph {
    constructor() {
        // Map<string, Node>
        this.nodes = new Map();
        // Map<string, Edge>
        this.edges = new Map();
        // Map<string, Edge[]> (outgoing adjacency list)
        this.adjacencyList = new Map();

        // Initialize with realistic Central Hyderabad road network
        this.initializeDefaultNetwork();
    }

    /**
     * Haversine geographic distance in Kilometers between two lat/lng pairs
     */
    static calculateHaversine(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Calculate true polyline length by summing distance between consecutive coordinates
     */
    static calculatePolylineDistance(coordinates) {
        if (!coordinates || coordinates.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < coordinates.length - 1; i++) {
            total += CityRoadGraph.calculateHaversine(
                coordinates[i][0], coordinates[i][1],
                coordinates[i + 1][0], coordinates[i + 1][1]
            );
        }
        return total;
    }

    /**
     * Add an Intersection Node to the Graph
     */
    addNode(id, name, lat, lng, options = {}) {
        const node = {
            id,
            name: name || id,
            lat,
            lng,
            type: options.type || 'intersection',
            blocked: options.blocked || false,
            trafficLight: options.trafficLight || false,
            trafficState: options.trafficState || 'green', // 'green', 'yellow', 'red'
            customDelay: options.customDelay || 0
        };

        this.nodes.set(id, node);
        if (!this.adjacencyList.has(id)) {
            this.adjacencyList.set(id, []);
        }
        return node;
    }

    /**
     * Add a bidirectional Road Edge with intermediate road geometry coordinates
     */
    addEdge(from, to, coordinates, options = {}) {
        const fromNode = this.nodes.get(from);
        const toNode = this.nodes.get(to);

        if (!fromNode || !toNode) {
            console.warn(`Cannot create edge from '${from}' to '${to}': Missing node.`);
            return null;
        }

        let coords = coordinates;
        if (!coords || coords.length < 2) {
            coords = [[fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]];
        }

        const distance = options.distance !== undefined 
            ? options.distance 
            : CityRoadGraph.calculatePolylineDistance(coords);

        const edgeId = options.id || `${from}--${to}`;
        const reverseEdgeId = `${to}--${from}`;
        const roadType = options.roadType || 'normal'; // 'normal', 'shortcut', 'blocked'
        const isBlocked = options.blocked || roadType === 'blocked' || false;
        
        // Speed in km/h based on road category
        const speedKmH = options.speedKmH || (roadType === 'shortcut' ? 65 : 45);

        const forwardEdge = {
            id: edgeId,
            from,
            to,
            name: options.name || `${fromNode.name} ↔ ${toNode.name}`,
            distance: Number(distance.toFixed(3)),
            speedKmH,
            baseCost: roadType === 'shortcut' ? 0.5 : 1.0,
            roadType,
            blocked: isBlocked,
            coordinates: coords
        };

        const reverseCoords = [...coords].reverse();
        const reverseEdge = {
            id: reverseEdgeId,
            from: to,
            to: from,
            name: forwardEdge.name,
            distance: forwardEdge.distance,
            speedKmH,
            baseCost: forwardEdge.baseCost,
            roadType,
            blocked: isBlocked,
            coordinates: reverseCoords
        };

        this.edges.set(edgeId, forwardEdge);
        this.edges.set(reverseEdgeId, reverseEdge);

        this.adjacencyList.get(from).push(forwardEdge);
        this.adjacencyList.get(to).push(reverseEdge);

        return forwardEdge;
    }

    /**
     * Travel-time cost model for DIJKSTRA FASTEST ROUTE
     * 
     * Formula:
     *   travelTimeMinutes = (distanceKm / speedKmH) * 60 * speedMultiplier + trafficSignalDelayMinutes
     *
     * Modifiers:
     *   - Normal Road: Multiplier = 1.0 (speed: 45 km/h)
     *   - Shortcut: Multiplier = 0.8 (express speed: 65 km/h)
     *   - Green Light: +0 delay
     *   - Yellow Light: +0.33 min (+20 sec delay)
     *   - Red Light: +1.25 min (+75 sec delay)
     *   - Blocked: Infinity
     */
    getTravelTimeCost(edge) {
        const toNode = this.nodes.get(edge.to);

        if (edge.blocked || (toNode && toNode.blocked)) {
            return Infinity;
        }

        let speed = edge.speedKmH || 45;
        let speedMultiplier = 1.0;

        if (edge.roadType === 'shortcut') {
            speed = Math.max(speed, 65);
            speedMultiplier = 0.85; // Additional bypass advantage
        } else if (edge.roadType === 'blocked') {
            return Infinity;
        }

        // Base driving time in minutes
        let timeMinutes = (edge.distance / speed) * 60 * speedMultiplier;

        // Destination node traffic light delay in minutes
        let signalDelayMinutes = 0;
        if (toNode && toNode.trafficLight) {
            if (toNode.trafficState === 'red') {
                signalDelayMinutes = 1.25; // 75 seconds red signal penalty
            } else if (toNode.trafficState === 'yellow') {
                signalDelayMinutes = 0.33; // 20 seconds yellow signal penalty
            }
        }

        return timeMinutes + signalDelayMinutes;
    }

    /**
     * Distance cost model for NORMAL / CASUAL ROUTE
     * Minimizes simple geographic distance without speed optimizations or live traffic awareness.
     * Blocked roads are still impassable (Infinity).
     */
    getDistanceCost(edge) {
        const toNode = this.nodes.get(edge.to);
        if (edge.blocked || (toNode && toNode.blocked) || edge.roadType === 'blocked') {
            return Infinity;
        }
        return edge.distance;
    }

    /**
     * General dynamic cost wrapper used by algorithm routers
     */
    getDynamicCost(edge, mode = 'fastest') {
        if (mode === 'normal') {
            return this.getDistanceCost(edge);
        }
        return this.getTravelTimeCost(edge);
    }

    /**
     * Intelligent Snap-to-Road System:
     * Finds the nearest road segment or intersection to the clicked latitude/longitude.
     * Projects perpendicular point onto road line segments for pinpoint accuracy.
     */
    findNearestRoadAndNode(lat, lng, maxDistanceKm = 2.0) {
        let bestCandidate = null;
        let minDistanceKm = Infinity;

        // 1. Check all graph nodes
        for (const [, node] of this.nodes) {
            const dist = CityRoadGraph.calculateHaversine(lat, lng, node.lat, node.lng);
            if (dist < minDistanceKm) {
                minDistanceKm = dist;
                bestCandidate = {
                    type: 'node',
                    node: node,
                    snappedLat: node.lat,
                    snappedLng: node.lng,
                    distanceKm: dist
                };
            }
        }

        // 2. Check all road geometry segments for even tighter projection
        for (const [, edge] of this.edges) {
            const coords = edge.coordinates;
            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = coords[i];
                const p2 = coords[i + 1];

                const projected = this.projectPointOnSegment(lat, lng, p1[0], p1[1], p2[0], p2[1]);
                const dist = CityRoadGraph.calculateHaversine(lat, lng, projected.lat, projected.lng);

                if (dist < minDistanceKm) {
                    minDistanceKm = dist;
                    const dFrom = CityRoadGraph.calculateHaversine(projected.lat, projected.lng, coords[0][0], coords[0][1]);
                    const dTo = CityRoadGraph.calculateHaversine(projected.lat, projected.lng, coords[coords.length - 1][0], coords[coords.length - 1][1]);
                    const closestNodeId = dFrom <= dTo ? edge.from : edge.to;

                    bestCandidate = {
                        type: 'road',
                        edge: edge,
                        node: this.nodes.get(closestNodeId),
                        snappedLat: projected.lat,
                        snappedLng: projected.lng,
                        distanceKm: dist
                    };
                }
            }
        }

        if (minDistanceKm <= maxDistanceKm && bestCandidate) {
            return bestCandidate;
        }

        // Fallback: return closest node
        let absoluteClosest = null;
        let absMin = Infinity;
        for (const [, node] of this.nodes) {
            const d = CityRoadGraph.calculateHaversine(lat, lng, node.lat, node.lng);
            if (d < absMin) {
                absMin = d;
                absoluteClosest = {
                    type: 'node',
                    node,
                    snappedLat: node.lat,
                    snappedLng: node.lng,
                    distanceKm: d
                };
            }
        }
        return absoluteClosest;
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

    /**
     * Reset all dynamic states on the graph to defaults
     */
    resetState() {
        this.initializeDefaultNetwork();
    }

    /**
     * Load Central Hyderabad Road Network with realistic multi-point curves
     */
    initializeDefaultNetwork() {
        this.nodes.clear();
        this.edges.clear();
        this.adjacencyList.clear();

        // 1. Intersections & Landmarks
        const nodesData = [
            { id: 'lakdikapul', name: 'Lakdikapul Junction', lat: 17.4042, lng: 78.4633, trafficLight: false },
            { id: 'nampally', name: 'Nampally Station', lat: 17.3921, lng: 78.4716, trafficLight: false },
            { id: 'khairatabad', name: 'Khairatabad Junction', lat: 17.4116, lng: 78.4611, trafficLight: false },
            { id: 'necklace_south', name: 'Necklace Road (South / IMAX)', lat: 17.4150, lng: 78.4635, trafficLight: false },
            { id: 'secretariat', name: 'Telangana Secretariat Circle', lat: 17.4128, lng: 78.4715, trafficLight: true, trafficState: 'green' },
            { id: 'tankbund_south', name: 'Tank Bund South (Lumbini Park)', lat: 17.4140, lng: 78.4740, trafficLight: true, trafficState: 'red' },
            { id: 'lower_tankbund', name: 'Lower Tank Bund Entry', lat: 17.4150, lng: 78.4760, trafficLight: false },
            { id: 'raj_bhavan', name: 'Raj Bhavan Road', lat: 17.4190, lng: 78.4585, trafficLight: false },
            { id: 'somajiguda', name: 'Somajiguda Circle', lat: 17.4255, lng: 78.4560, trafficLight: false },
            { id: 'punjagutta', name: 'Punjagutta Central Circle', lat: 17.4284, lng: 78.4526, trafficLight: true, trafficState: 'yellow' },
            { id: 'ameerpet', name: 'Ameerpet Crossroads', lat: 17.4375, lng: 78.4483, trafficLight: false },
            { id: 'necklace_mid', name: 'PVNR Marg (People\'s Plaza)', lat: 17.4265, lng: 78.4645, trafficLight: false },
            { id: 'jalavihar', name: 'Jalavihar Water Park', lat: 17.4320, lng: 78.4675, trafficLight: false },
            { id: 'sanjeevaiah', name: 'Sanjeevaiah Park Station', lat: 17.4350, lng: 78.4720, trafficLight: false },
            { id: 'tankbund_mid', name: 'Tank Bund Promenade (Buddha View)', lat: 17.4230, lng: 78.4782, trafficLight: false },
            { id: 'ranigunj', name: 'Ranigunj / Tank Bund North', lat: 17.4350, lng: 78.4830, trafficLight: false },
            { id: 'kavadiguda', name: 'Kavadiguda Crossroads', lat: 17.4220, lng: 78.4830, trafficLight: false },
            { id: 'begumpet', name: 'Begumpet Flyover Junction', lat: 17.4415, lng: 78.4660, trafficLight: true, trafficState: 'green' },
            { id: 'minister_road', name: 'Minister Road Junction', lat: 17.4410, lng: 78.4770, trafficLight: false },
            { id: 'paradise', name: 'Paradise Circle', lat: 17.4418, lng: 78.4872, trafficLight: false }
        ];

        nodesData.forEach(n => {
            this.addNode(n.id, n.name, n.lat, n.lng, {
                trafficLight: n.trafficLight || false,
                trafficState: n.trafficState || 'green'
            });
        });

        // 2. Realistic multi-coordinate road segments tracing true street paths
        const roadsData = [
            {
                from: 'lakdikapul',
                to: 'khairatabad',
                name: 'Khairatabad Road',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4042, 78.4633],
                    [17.4080, 78.4622],
                    [17.4116, 78.4611]
                ]
            },
            {
                from: 'lakdikapul',
                to: 'nampally',
                name: 'Nampally Station Road',
                roadType: 'normal',
                speedKmH: 40,
                coordinates: [
                    [17.4042, 78.4633],
                    [17.3980, 78.4670],
                    [17.3921, 78.4716]
                ]
            },
            {
                from: 'khairatabad',
                to: 'necklace_south',
                name: 'IMAX Lake Link Road',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4116, 78.4611],
                    [17.4135, 78.4622],
                    [17.4150, 78.4635]
                ]
            },
            {
                from: 'khairatabad',
                to: 'secretariat',
                name: 'NTR Marg (Lakeside Boulevard)',
                roadType: 'normal',
                speedKmH: 50,
                coordinates: [
                    [17.4116, 78.4611],
                    [17.4122, 78.4650],
                    [17.4125, 78.4685],
                    [17.4128, 78.4715]
                ]
            },
            {
                from: 'khairatabad',
                to: 'raj_bhavan',
                name: 'Raj Bhavan Road South',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4116, 78.4611],
                    [17.4150, 78.4600],
                    [17.4190, 78.4585]
                ]
            },
            {
                from: 'raj_bhavan',
                to: 'somajiguda',
                name: 'Raj Bhavan Road North',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4190, 78.4585],
                    [17.4220, 78.4572],
                    [17.4255, 78.4560]
                ]
            },
            {
                from: 'somajiguda',
                to: 'punjagutta',
                name: 'Punjagutta Main Road',
                roadType: 'normal',
                speedKmH: 40,
                coordinates: [
                    [17.4255, 78.4560],
                    [17.4270, 78.4542],
                    [17.4284, 78.4526]
                ]
            },
            {
                from: 'punjagutta',
                to: 'ameerpet',
                name: 'Ameerpet Metro Corridor',
                roadType: 'normal',
                speedKmH: 40,
                coordinates: [
                    [17.4284, 78.4526],
                    [17.4330, 78.4505],
                    [17.4375, 78.4483]
                ]
            },
            {
                from: 'somajiguda',
                to: 'begumpet',
                name: 'Begumpet Main Road',
                roadType: 'normal',
                speedKmH: 50,
                coordinates: [
                    [17.4255, 78.4560],
                    [17.4320, 78.4600],
                    [17.4375, 78.4635],
                    [17.4415, 78.4660]
                ]
            },
            {
                from: 'necklace_south',
                to: 'necklace_mid',
                name: 'PVNR Marg (Lakefront South)',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4150, 78.4635],
                    [17.4190, 78.4638],
                    [17.4230, 78.4642],
                    [17.4265, 78.4645]
                ]
            },
            {
                from: 'necklace_mid',
                to: 'jalavihar',
                name: 'PVNR Marg (Mid Lake Arc)',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4265, 78.4645],
                    [17.4290, 78.4655],
                    [17.4320, 78.4675]
                ]
            },
            {
                from: 'jalavihar',
                to: 'sanjeevaiah',
                name: 'PVNR Marg (North Lakefront)',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4320, 78.4675],
                    [17.4338, 78.4695],
                    [17.4350, 78.4720]
                ]
            },
            {
                from: 'sanjeevaiah',
                to: 'minister_road',
                name: 'Minister Road Link',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4350, 78.4720],
                    [17.4380, 78.4745],
                    [17.4410, 78.4770]
                ]
            },
            {
                from: 'sanjeevaiah',
                to: 'ranigunj',
                name: 'Sanjeevaiah to Ranigunj Connector',
                roadType: 'normal',
                speedKmH: 40,
                coordinates: [
                    [17.4350, 78.4720],
                    [17.4348, 78.4760],
                    [17.4350, 78.4800],
                    [17.4350, 78.4830]
                ]
            },
            {
                from: 'secretariat',
                to: 'tankbund_south',
                name: 'Lumbini Access Road',
                roadType: 'normal',
                speedKmH: 40,
                coordinates: [
                    [17.4128, 78.4715],
                    [17.4135, 78.4728],
                    [17.4140, 78.4740]
                ]
            },
            {
                from: 'tankbund_south',
                to: 'tankbund_mid',
                name: 'Tank Bund Road South',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4140, 78.4740],
                    [17.4180, 78.4760],
                    [17.4230, 78.4782]
                ]
            },
            {
                from: 'tankbund_mid',
                to: 'ranigunj',
                name: 'Tank Bund Road North',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4230, 78.4782],
                    [17.4290, 78.4805],
                    [17.4350, 78.4830]
                ]
            },
            {
                from: 'secretariat',
                to: 'lower_tankbund',
                name: 'Telugu Thalli Flyover Entry',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4128, 78.4715],
                    [17.4135, 78.4740],
                    [17.4150, 78.4760]
                ]
            },
            {
                from: 'lower_tankbund',
                to: 'kavadiguda',
                name: 'Lower Tank Bund Express Bypass',
                roadType: 'shortcut', // Default high-speed bypass
                speedKmH: 65,
                coordinates: [
                    [17.4150, 78.4760],
                    [17.4185, 78.4795],
                    [17.4220, 78.4830]
                ]
            },
            {
                from: 'kavadiguda',
                to: 'ranigunj',
                name: 'Kavadiguda Arterial',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4220, 78.4830],
                    [17.4285, 78.4830],
                    [17.4350, 78.4830]
                ]
            },
            {
                from: 'begumpet',
                to: 'minister_road',
                name: 'Begumpet Airport Road',
                roadType: 'normal',
                speedKmH: 50,
                coordinates: [
                    [17.4415, 78.4660],
                    [17.4412, 78.4715],
                    [17.4410, 78.4770]
                ]
            },
            {
                from: 'minister_road',
                to: 'paradise',
                name: 'MG Road / Paradise Corridor',
                roadType: 'normal',
                speedKmH: 50,
                coordinates: [
                    [17.4410, 78.4770],
                    [17.4414, 78.4820],
                    [17.4418, 78.4872]
                ]
            },
            {
                from: 'ranigunj',
                to: 'paradise',
                name: 'Bible House / RP Road',
                roadType: 'normal',
                speedKmH: 45,
                coordinates: [
                    [17.4350, 78.4830],
                    [17.4385, 78.4851],
                    [17.4418, 78.4872]
                ]
            }
        ];

        roadsData.forEach(r => {
            this.addEdge(r.from, r.to, r.coordinates, {
                name: r.name,
                roadType: r.roadType,
                speedKmH: r.speedKmH
            });
        });
    }
}
