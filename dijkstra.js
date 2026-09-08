/**
 * ============================================================================
 * DIJKSTRA'S ALGORITHM & GRAPH DATA STRUCTURE
 * ============================================================================
 * 
 * Academic Context:
 * Dijkstra's Algorithm finds the shortest path between nodes in a graph with
 * non-negative edge weights. It uses a greedy approach, always exploring the
 * unvisited node with the smallest tentative distance from the start node.
 * 
 * Weight System:
 * - Normal Road:     1.0 * baseDistance
 * - Shortcut Road:   0.5 * baseDistance (High-speed corridor)
 * - Traffic Light:
 *     - Yellow:      +1.5 cost penalty
 *     - Red:         +4.0 cost penalty
 * - Blocked / Wall:  Infinity (Impassable)
 * 
 * Time Complexity:  O((V + E) * log V) using a Min-Priority Queue.
 * Space Complexity: O(V + E) for the adjacency list and distance tables.
 */

/**
 * Priority Queue implemented via Binary Min-Heap
 * for optimal O(log N) extraction of minimum tentative distance.
 */
class MinPriorityQueue {
    constructor() {
        this.heap = [];
    }

    push(item, priority) {
        this.heap.push({ item, priority });
        this._bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.isEmpty()) return null;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = bottom;
            this._sinkDown(0);
        }
        return top;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    _bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index].priority < this.heap[parentIndex].priority) {
                [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
                index = parentIndex;
            } else {
                break;
            }
        }
    }

    _sinkDown(index) {
        const length = this.heap.length;
        while (true) {
            let leftChildIdx = 2 * index + 1;
            let rightChildIdx = 2 * index + 2;
            let smallestIdx = index;

            if (leftChildIdx < length && this.heap[leftChildIdx].priority < this.heap[smallestIdx].priority) {
                smallestIdx = leftChildIdx;
            }
            if (rightChildIdx < length && this.heap[rightChildIdx].priority < this.heap[smallestIdx].priority) {
                smallestIdx = rightChildIdx;
            }

            if (smallestIdx !== index) {
                [this.heap[index], this.heap[smallestIdx]] = [this.heap[smallestIdx], this.heap[index]];
                index = smallestIdx;
            } else {
                break;
            }
        }
    }
}

/**
 * Graph Data Structure representing the city road network.
 * Fully decoupled from Leaflet mapping library.
 */
class CityGraph {
    constructor() {
        // Map of nodeId -> Node object
        this.nodes = new Map();
        // Map of nodeId -> Array of outgoing Edge objects
        this.adjacencyList = new Map();
        // Map of edgeId -> Edge object
        this.edges = new Map();
    }

    /**
     * Add a node to the graph
     * @param {string} id - Unique identifier
     * @param {string} name - Human readable landmark / intersection name
     * @param {number} lat - Latitude coordinate
     * @param {number} lng - Longitude coordinate
     * @param {Object} options - Extra properties (type, trafficLight, etc.)
     */
    addNode(id, name, lat, lng, options = {}) {
        const node = {
            id,
            name: name || id,
            lat,
            lng,
            type: options.type || 'normal', // 'normal', 'traffic-light', 'landmark'
            isBlocked: options.isBlocked || false,
            lightState: options.lightState || 'yellow', // 'yellow' (1.5) or 'red' (4.0)
            customCost: options.customCost || 0
        };
        this.nodes.set(id, node);
        if (!this.adjacencyList.has(id)) {
            this.adjacencyList.set(id, []);
        }
        return node;
    }

    /**
     * Calculate Haversine distance between two coordinates in Kilometers
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
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
     * Add a bidirectional edge between two nodes
     */
    addEdge(sourceId, targetId, options = {}) {
        const sourceNode = this.nodes.get(sourceId);
        const targetNode = this.nodes.get(targetId);

        if (!sourceNode || !targetNode) {
            console.warn(`Cannot create edge between ${sourceId} and ${targetId}: node not found`);
            return null;
        }

        const distance = options.distance !== undefined 
            ? options.distance 
            : this.calculateDistance(sourceNode.lat, sourceNode.lng, targetNode.lat, targetNode.lng);

        const edgeId = options.id || `${sourceId}--${targetId}`;
        const reverseEdgeId = `${targetId}--${sourceId}`;

        const edge = {
            id: edgeId,
            source: sourceId,
            target: targetId,
            distance: Number(distance.toFixed(3)),
            roadType: options.roadType || 'normal', // 'normal' (1.0), 'shortcut' (0.5), 'blocked' (Infinity)
            isBlocked: options.isBlocked || false
        };

        const reverseEdge = {
            id: reverseEdgeId,
            source: targetId,
            target: sourceId,
            distance: Number(distance.toFixed(3)),
            roadType: options.roadType || 'normal',
            isBlocked: options.isBlocked || false
        };

        this.edges.set(edgeId, edge);
        this.edges.set(reverseEdgeId, reverseEdge);

        this.adjacencyList.get(sourceId).push(edge);
        this.adjacencyList.get(targetId).push(reverseEdge);

        return edge;
    }

    /**
     * Compute effective traversal cost for an edge including:
     * 1. Base distance
     * 2. Road type multiplier (Normal: 1.0, Shortcut: 0.5, Blocked: Infinity)
     * 3. Destination node traffic light penalty (Yellow: +1.5, Red: +4.0)
     */
    getEffectiveWeight(edge) {
        const targetNode = this.nodes.get(edge.target);

        // If either the edge or target node is blocked, cost is Infinity
        if (edge.isBlocked || (targetNode && targetNode.isBlocked)) {
            return Infinity;
        }

        let multiplier = 1.0;
        if (edge.roadType === 'shortcut') {
            multiplier = 0.5;
        } else if (edge.roadType === 'blocked') {
            return Infinity;
        }

        let baseCost = edge.distance * multiplier;

        // Additional node-based delay (e.g. Traffic Light wait times)
        let nodeDelay = 0;
        if (targetNode && targetNode.type === 'traffic-light') {
            if (targetNode.lightState === 'red') {
                nodeDelay = 4.0;
            } else if (targetNode.lightState === 'yellow') {
                nodeDelay = 1.5;
            }
        }

        return baseCost + nodeDelay;
    }

    /**
     * Reset all dynamic states on graph (obstacles, traffic lights, shortcuts)
     */
    resetState() {
        for (const [, node] of this.nodes) {
            node.isBlocked = false;
            node.type = 'normal';
            node.lightState = 'yellow';
            node.customCost = 0;
        }
        for (const [, edge] of this.edges) {
            edge.isBlocked = false;
            edge.roadType = 'normal';
        }
    }
}

/**
 * Dijkstra's Algorithm Implementation
 * 
 * Manual step-by-step calculation with full logging for education / visualization.
 */
class DijkstraSolver {
    /**
     * Execute Dijkstra's Algorithm on a graph from startNodeId to targetNodeId
     * 
     * @param {CityGraph} graph - The city road network graph
     * @param {string} startNodeId - Origin node ID
     * @param {string} targetNodeId - Destination node ID
     * @param {boolean} recordSteps - Whether to log step-by-step state for visualization
     * @returns {Object} Result object containing path, distances, costs, and exploration history
     */
    static findShortestPath(graph, startNodeId, targetNodeId, recordSteps = false) {
        const startTime = performance.now();

        // 1. Validation
        if (!graph.nodes.has(startNodeId)) {
            return { success: false, error: `Start node '${startNodeId}' does not exist.` };
        }
        if (!graph.nodes.has(targetNodeId)) {
            return { success: false, error: `Destination node '${targetNodeId}' does not exist.` };
        }

        const startNode = graph.nodes.get(startNodeId);
        const targetNode = graph.nodes.get(targetNodeId);

        if (startNode.isBlocked) {
            return { success: false, error: `Start location is blocked by an obstacle.` };
        }
        if (targetNode.isBlocked) {
            return { success: false, error: `Destination location is blocked by an obstacle.` };
        }

        // 2. Data structures initialization
        const distances = new Map();     // nodeId -> tentative shortest distance
        const previous = new Map();      // nodeId -> { previousNodeId, edge }
        const visited = new Set();       // Set of settled nodeIds
        const pq = new MinPriorityQueue();
        const steps = [];                // For step-by-step algorithm visualizer

        for (const [nodeId] of graph.nodes) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
        }

        // Set origin distance to 0
        distances.set(startNodeId, 0);
        pq.push(startNodeId, 0);

        if (recordSteps) {
            steps.push({
                type: 'init',
                startNodeId,
                targetNodeId,
                distances: new Map(distances),
                description: `Initialized graph. Distance to start node [${startNode.name}] set to 0. All other nodes set to ∞.`
            });
        }

        let targetReached = false;

        // 3. Main Greedy Loop
        while (!pq.isEmpty()) {
            // Select unvisited node with smallest tentative distance
            const { item: currentId, priority: currentDist } = pq.pop();

            // Skip if already visited with a shorter path
            if (visited.has(currentId)) continue;
            if (currentDist === Infinity) break;

            visited.add(currentId);
            const currentNode = graph.nodes.get(currentId);

            if (recordSteps) {
                steps.push({
                    type: 'visit_node',
                    nodeId: currentId,
                    currentDist,
                    visited: Array.from(visited),
                    description: `Visited [${currentNode.name}] with smallest tentative distance: ${currentDist.toFixed(2)}.`
                });
            }

            // Stop condition: Reached destination
            if (currentId === targetNodeId) {
                targetReached = true;
                if (recordSteps) {
                    steps.push({
                        type: 'reached_destination',
                        nodeId: targetNodeId,
                        totalCost: currentDist,
                        description: `Destination [${targetNode.name}] reached with optimal cost: ${currentDist.toFixed(2)}!`
                    });
                }
                break;
            }

            // 4. Relaxation of neighboring edges
            const edges = graph.adjacencyList.get(currentId) || [];
            for (const edge of edges) {
                const neighborId = edge.target;
                const neighborNode = graph.nodes.get(neighborId);

                // Ignore already settled nodes
                if (visited.has(neighborId)) continue;

                // Calculate edge weight with current road modifiers and traffic penalties
                const weight = graph.getEffectiveWeight(edge);

                // Ignore impassable / blocked roads
                if (weight === Infinity) {
                    if (recordSteps) {
                        steps.push({
                            type: 'blocked_edge',
                            sourceId: currentId,
                            targetId: neighborId,
                            description: `Road to [${neighborNode.name}] is blocked/impassable (weight = ∞). Skipped.`
                        });
                    }
                    continue;
                }

                const tentativeDistance = currentDist + weight;
                const existingDistance = distances.get(neighborId);

                if (tentativeDistance < existingDistance) {
                    // Path relaxation
                    distances.set(neighborId, tentativeDistance);
                    previous.set(neighborId, { previousNodeId: currentId, edge });
                    pq.push(neighborId, tentativeDistance);

                    if (recordSteps) {
                        steps.push({
                            type: 'relax_edge',
                            sourceId: currentId,
                            targetId: neighborId,
                            edgeId: edge.id,
                            weight,
                            tentativeDistance,
                            oldDistance: existingDistance,
                            description: `Relaxed edge to [${neighborNode.name}]: updated cost from ${existingDistance === Infinity ? '∞' : existingDistance.toFixed(2)} to ${tentativeDistance.toFixed(2)}.`
                        });
                    }
                }
            }
        }

        const endTime = performance.now();
        const calculationTimeMs = Number((endTime - startTime).toFixed(2));

        // 5. Check if valid path was found
        if (distances.get(targetNodeId) === Infinity || (!targetReached && startNodeId !== targetNodeId)) {
            return {
                success: false,
                noRoute: true,
                error: 'No valid route exists between the selected points (disconnected or blocked by obstacles).',
                calculationTimeMs,
                steps,
                visitedNodeIds: Array.from(visited)
            };
        }

        // 6. Path Reconstruction
        const pathNodes = [];
        const pathEdges = [];
        let curr = targetNodeId;
        let totalDistanceKm = 0;
        let trafficLightsCount = 0;
        let shortcutsCount = 0;

        while (curr !== null) {
            const node = graph.nodes.get(curr);
            pathNodes.unshift(node);

            if (node.type === 'traffic-light') {
                trafficLightsCount++;
            }

            const prevInfo = previous.get(curr);
            if (prevInfo) {
                pathEdges.unshift(prevInfo.edge);
                totalDistanceKm += prevInfo.edge.distance;
                if (prevInfo.edge.roadType === 'shortcut') {
                    shortcutsCount++;
                }
                curr = prevInfo.previousNodeId;
            } else {
                curr = null;
            }
        }

        const totalCost = Number(distances.get(targetNodeId).toFixed(2));

        return {
            success: true,
            startNodeId,
            targetNodeId,
            pathNodes,
            pathEdges,
            pathNodeIds: pathNodes.map(n => n.id),
            totalCost,
            totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
            stepCount: pathNodes.length,
            trafficLightsCount,
            shortcutsCount,
            calculationTimeMs,
            steps,
            visitedNodeIds: Array.from(visited),
            distances
        };
    }
}
