/**
 * ============================================================================
 * MANUAL DIJKSTRA'S ALGORITHM ENGINE & ROUTE OBJECT FACTORY (js/dijkstra.js)
 * ============================================================================
 *
 * Primary Architectural Principles:
 * 1. Target node MUST match navigationState.state.destination.nodeId.
 * 2. Route coordinates MUST come from edge geometry (never straight lines between nodes).
 * 3. Directional traversal MUST be respected:
 *    - Forward: edge.coordinates
 *    - Backward: [...edge.coordinates].reverse()
 * 4. Produces standardized Route Object (Section 6).
 * 5. Runs assertRouteIntegrity(route) before returning (Section 25).
 * 6. Logs structured [ROUTING] debug metrics (Section 53).
 */

class MinHeapPriorityQueue {
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
            const parentIdx = Math.floor((index - 1) / 2);
            if (this.heap[index].priority < this.heap[parentIdx].priority) {
                [this.heap[index], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[index]];
                index = parentIdx;
            } else {
                break;
            }
        }
    }

    _sinkDown(index) {
        const length = this.heap.length;
        while (true) {
            const leftIdx = 2 * index + 1;
            const rightIdx = 2 * index + 2;
            let smallest = index;

            if (leftIdx < length && this.heap[leftIdx].priority < this.heap[smallest].priority) {
                smallest = leftIdx;
            }
            if (rightIdx < length && this.heap[rightIdx].priority < this.heap[smallest].priority) {
                smallest = rightIdx;
            }

            if (smallest !== index) {
                [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
                index = smallest;
            } else {
                break;
            }
        }
    }
}

class DijkstraRouter {
    /**
     * Compute path from startNodeId to destinationNodeId
     *
     * @param {CityRoadGraph} graph - Authoritative Road Graph
     * @param {string} startNodeId - Origin Node ID
     * @param {string} targetNodeId - Destination Node ID
     * @param {Object} options - { mode: 'dijkstra' | 'normal', recordSteps: boolean }
     * @returns {Object} Standardized Route object
     */
    static findPath(graph, startNodeId, targetNodeId, options = {}) {
        const mode = options.mode || 'dijkstra';
        const recordSteps = options.recordSteps || false;
        const startTime = performance.now();

        const roadNetwork = graph.roadNetwork;
        const startNode = roadNetwork.nodes[startNodeId];
        const targetNode = roadNetwork.nodes[targetNodeId];

        // 1. Strict Input Validation
        if (!startNode) {
            return { success: false, error: `Start location '${startNodeId}' does not exist in road network.` };
        }
        if (!targetNode) {
            return { success: false, error: `Destination '${targetNodeId}' does not exist in road network.` };
        }
        if (startNode.blocked) {
            return { success: false, error: `Start location (${startNode.name}) is currently blocked.` };
        }
        if (targetNode.blocked) {
            return { success: false, error: `Destination (${targetNode.name}) is currently blocked.` };
        }

        // Section 53: Debug Console Logging
        console.log(`[ROUTING] Computing ${mode.toUpperCase()} path from '${startNodeId}' to '${targetNodeId}'`);

        // Handle trivial case: start equals destination
        if (startNodeId === targetNodeId) {
            const trivialRoute = {
                id: `route-${mode}-${Date.now()}`,
                success: true,
                mode,
                startNodeId,
                destinationNodeId: targetNodeId,
                startNode,
                targetNode,
                pathNodeIds: [startNodeId],
                pathNodes: [startNode],
                edgeIds: [],
                coordinates: [[startNode.lat, startNode.lng]],
                distanceMeters: 0,
                distanceKm: 0,
                estimatedTimeSeconds: 0,
                estimatedTimeMin: 0,
                cost: 0,
                trafficLightCount: 0,
                redLightCount: 0,
                yellowLightCount: 0,
                shortcutCount: 0,
                nodesExplored: 1,
                edgesEvaluated: 0,
                calcTimeMs: 0.1,
                createdAt: Date.now(),
                steps: []
            };
            return trivialRoute;
        }

        // 2. Data Structures for Dijkstra Traversal
        const distances = new Map(); // nodeId -> minimum cost
        const previous = new Map();  // nodeId -> { fromNodeId, edgeId }
        const visited = new Set();
        const pq = new MinHeapPriorityQueue();
        const steps = [];

        let nodesExplored = 0;
        let edgesEvaluated = 0;

        for (const [nodeId] of Object.entries(roadNetwork.nodes)) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
        }

        distances.set(startNodeId, 0);
        pq.push(startNodeId, 0);

        if (recordSteps) {
            steps.push({
                type: 'init',
                nodeId: startNodeId,
                cost: 0,
                description: `Initialized search at [${startNode.name}]. Cost = 0.`
            });
        }

        let destinationReached = false;

        // 3. Greedy Extraction & Edge Relaxation
        while (!pq.isEmpty()) {
            const { item: currentId, priority: currentCost } = pq.pop();

            if (visited.has(currentId)) continue;
            if (currentCost === Infinity) break;

            visited.add(currentId);
            nodesExplored++;
            const currentNode = roadNetwork.nodes[currentId];

            if (recordSteps) {
                steps.push({
                    type: 'visit',
                    nodeId: currentId,
                    cost: currentCost,
                    description: `Evaluating [${currentNode.name}] (Cost: ${currentCost.toFixed(1)})`
                });
            }

            // Target reached optimally
            if (currentId === targetNodeId) {
                destinationReached = true;
                if (recordSteps) {
                    steps.push({
                        type: 'reached',
                        nodeId: targetNodeId,
                        cost: currentCost,
                        description: `Destination [${targetNode.name}] reached! Total cost: ${currentCost.toFixed(1)}.`
                    });
                }
                break;
            }

            // Relax outgoing directed edges from adjacency map
            const outgoingEdges = graph.adjacencyMap.get(currentId) || [];
            for (const outgoing of outgoingEdges) {
                edgesEvaluated++;
                const neighborId = outgoing.to;
                const edgeId = outgoing.edgeId;
                const neighborNode = roadNetwork.nodes[neighborId];

                if (visited.has(neighborId)) continue;

                // Evaluate dynamic edge cost based on routing mode
                let edgeCost = Infinity;
                if (mode === 'normal') {
                    edgeCost = graph.getDistanceCostMeters(edgeId, neighborId);
                } else {
                    // Travel time in seconds including traffic signal delay
                    edgeCost = graph.getTravelTimeSeconds(edgeId, neighborId);
                }

                if (edgeCost === Infinity) {
                    if (recordSteps) {
                        steps.push({
                            type: 'blocked',
                            fromId: currentId,
                            toId: neighborId,
                            description: `Road to [${neighborNode?.name}] is blocked.`
                        });
                    }
                    continue;
                }

                const newCost = currentCost + edgeCost;
                const existingCost = distances.get(neighborId);

                if (newCost < existingCost) {
                    distances.set(neighborId, newCost);
                    previous.set(neighborId, { fromNodeId: currentId, edgeId });
                    pq.push(neighborId, newCost);

                    if (recordSteps) {
                        steps.push({
                            type: 'relax',
                            fromId: currentId,
                            toId: neighborId,
                            edgeCost,
                            newCost,
                            description: `Relaxed road to [${neighborNode.name}]: cost improved to ${newCost.toFixed(1)}.`
                        });
                    }
                }
            }
        }

        const calcTimeMs = Number((performance.now() - startTime).toFixed(2));

        // 4. Validate Path Existence
        if (!destinationReached && distances.get(targetNodeId) === Infinity) {
            console.warn(`[ROUTING] No route found from '${startNodeId}' to '${targetNodeId}'`);
            return {
                success: false,
                mode,
                error: `No route is currently available between ${startNode.name} and ${targetNode.name}. Check for road blockades.`,
                nodesExplored,
                edgesEvaluated,
                calcTimeMs,
                steps
            };
        }

        // 5. Backtrack Path Sequence
        const pathNodeIds = [];
        const pathEdgeIds = [];
        let curr = targetNodeId;

        while (curr !== null) {
            pathNodeIds.unshift(curr);
            const prevEntry = previous.get(curr);
            if (prevEntry) {
                pathEdgeIds.unshift(prevEntry.edgeId);
                curr = prevEntry.fromNodeId;
            } else {
                curr = null;
            }
        }

        // Section 5 Hard Invariant: Route must end at selected destination
        if (pathNodeIds[pathNodeIds.length - 1] !== targetNodeId) {
            const err = `ROUTE DESTINATION MISMATCH: Expected destination '${targetNodeId}', but path ended at '${pathNodeIds[pathNodeIds.length - 1]}'`;
            console.error(err);
            throw new Error(err);
        }

        // 6. Assemble Continuous Route Coordinates from Edge Geometry (Section 7, 26, 27)
        // DO NOT reconstruct route geometry from node coordinates.
        // Use directed edge coordinates with non-mutating reversal.
        const routeCoordinates = [];
        let totalDistanceMeters = 0;
        let totalTravelTimeSeconds = 0;
        let trafficLightCount = 0;
        let redLightCount = 0;
        let yellowLightCount = 0;
        let shortcutCount = 0;

        for (let i = 0; i < pathEdgeIds.length; i++) {
            const edgeId = pathEdgeIds[i];
            const fromNodeId = pathNodeIds[i];
            const toNodeId = pathNodeIds[i + 1];

            const edge = roadNetwork.edges[edgeId];
            totalDistanceMeters += edge.distanceMeters;

            if (edge.shortcut || edge.roadType === "shortcut") shortcutCount++;

            // Destination intersection signal check
            const toNode = roadNetwork.nodes[toNodeId];
            if (toNode.trafficSignalId && roadNetwork.signals[toNode.trafficSignalId]) {
                trafficLightCount++;
                const sig = roadNetwork.signals[toNode.trafficSignalId];
                if (sig.state === "RED") redLightCount++;
                else if (sig.state === "YELLOW") yellowLightCount++;
            }

            // Real travel time for this segment
            const segTravelTime = graph.getTravelTimeSeconds(edgeId, toNodeId);
            if (segTravelTime !== Infinity) {
                totalTravelTimeSeconds += segTravelTime;
            }

            // Directed road coordinates
            const directedCoords = graph.getDirectedCoordinates(edgeId, fromNodeId);

            if (routeCoordinates.length === 0) {
                routeCoordinates.push(...directedCoords);
            } else {
                // Avoid duplicating the junction connection coordinate
                routeCoordinates.push(...directedCoords.slice(1));
            }
        }

        const distanceKm = Number((totalDistanceMeters / 1000).toFixed(2));
        const estimatedTimeMin = Number((totalTravelTimeSeconds / 60).toFixed(1));
        const costVal = Number(distances.get(targetNodeId).toFixed(1));

        // 7. Standardized Route Object (Section 6)
        const route = {
            id: `route-${mode}-${Date.now()}`,
            success: true,
            mode,
            startNodeId,
            destinationNodeId: targetNodeId,
            startNode,
            targetNode,
            pathNodeIds,
            edgeIds: pathEdgeIds,
            coordinates: routeCoordinates,
            distanceMeters: Math.round(totalDistanceMeters),
            distanceKm,
            estimatedTimeSeconds: Math.round(totalTravelTimeSeconds),
            estimatedTimeMin,
            cost: costVal,
            trafficLightCount,
            redLightCount,
            yellowLightCount,
            shortcutCount,
            nodesExplored,
            edgesEvaluated,
            calcTimeMs,
            createdAt: Date.now(),
            steps
        };

        // Section 25 & 51: Assert Route Integrity
        // If route does not pass all 10 integrity checks, this throws an error and prevents rendering
        if (typeof navigationState !== 'undefined' && navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
            navigationState.assertRouteIntegrity(route, roadNetwork);
        }

        // Section 53: Log Route Metrics
        console.log(`[ROUTING] Success! Mode: ${mode}, Destination: ${targetNodeId}, Edges: ${pathEdgeIds.length}, Coordinates: ${routeCoordinates.length}, Dist: ${distanceKm}km, ETA: ${estimatedTimeMin}min`);

        return route;
    }
}

if (typeof window !== 'undefined') {
    window.DijkstraRouter = DijkstraRouter;
    window.MinHeapPriorityQueue = MinHeapPriorityQueue;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DijkstraRouter, MinHeapPriorityQueue };
}
