/**
 * ============================================================================
 * MANUAL DIJKSTRA'S ALGORITHM IMPLEMENTATION (js/dijkstra.js)
 * ============================================================================
 *
 * Core Shortest-Path & Fastest-Route Engine:
 * Implemented natively in vanilla JavaScript without third-party routing APIs.
 *
 * Traversal Cost Model:
 *   Mode 1: 'fastest' (Dijkstra Fastest Simulated Route)
 *     Cost = Travel Time (min) = (Distance / Speed) * 60 * Multiplier + Signal Delay
 *   Mode 2: 'normal' (Normal / Casual Route)
 *     Cost = Physical Road Distance (km)
 *
 * Complexity:
 *   - Time:  O((V + E) * log V) using Binary Min-Heap Priority Queue
 *   - Space: O(V + E) for adjacency list, predecessor map, and distance table
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
            let leftIdx = 2 * index + 1;
            let rightIdx = 2 * index + 2;
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
     * Compute shortest/fastest path from startNodeId to targetNodeId
     *
     * @param {CityRoadGraph} graph - Topological Road Graph
     * @param {string} startNodeId - Origin Node ID
     * @param {string} targetNodeId - Destination Node ID
     * @param {Object} options - { mode: 'fastest' | 'normal', recordSteps: boolean }
     * @returns {Object} Route result containing path nodes, edges, coordinates, distances, and costs
     */
    static findPath(graph, startNodeId, targetNodeId, options = {}) {
        const mode = options.mode || 'fastest';
        const recordSteps = options.recordSteps || false;
        const startTime = performance.now();

        // 1. Input Validation
        if (!graph.nodes.has(startNodeId)) {
            return { success: false, error: `Start location '${startNodeId}' is not in the road network.` };
        }
        if (!graph.nodes.has(targetNodeId)) {
            return { success: false, error: `Destination '${targetNodeId}' is not in the road network.` };
        }

        const startNode = graph.nodes.get(startNodeId);
        const targetNode = graph.nodes.get(targetNodeId);

        if (startNode.blocked) {
            return { success: false, error: `Start point (${startNode.name}) is currently blocked.` };
        }
        if (targetNode.blocked) {
            return { success: false, error: `Destination (${targetNode.name}) is currently blocked.` };
        }

        if (startNodeId === targetNodeId) {
            return {
                success: true,
                mode,
                startNode,
                targetNode,
                pathNodeIds: [startNodeId],
                pathNodes: [startNode],
                pathEdges: [],
                roadCoordinates: [[startNode.lat, startNode.lng]],
                totalDistanceKm: 0,
                estimatedTimeMin: 0,
                weightedCost: 0,
                trafficLightCount: 0,
                redLightCount: 0,
                yellowLightCount: 0,
                shortcutCount: 0,
                nodesExplored: 1,
                edgesEvaluated: 0,
                calcTimeMs: 0.1,
                steps: []
            };
        }

        // 2. Data Structures
        const distances = new Map(); // nodeId -> tentative cost
        const previous = new Map();  // nodeId -> { fromNodeId, edge }
        const visited = new Set();   // Settled nodes
        const pq = new MinHeapPriorityQueue();
        const steps = [];            // Step-by-step exploration log

        let nodesExplored = 0;
        let edgesEvaluated = 0;

        for (const [nodeId] of graph.nodes) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
        }

        // Distance/Cost to origin is 0
        distances.set(startNodeId, 0);
        pq.push(startNodeId, 0);

        if (recordSteps) {
            steps.push({
                type: 'init',
                nodeId: startNodeId,
                cost: 0,
                description: `Initialized ${mode.toUpperCase()} search at [${startNode.name}]. Tentative cost = 0. All other nodes = ∞.`
            });
        }

        let destinationReached = false;

        // 3. Greedy Dijkstra Traversal
        while (!pq.isEmpty()) {
            const { item: currentId, priority: currentCost } = pq.pop();

            // Ignore stale entries from heap
            if (visited.has(currentId)) continue;
            if (currentCost === Infinity) break;

            visited.add(currentId);
            nodesExplored++;
            const currentNode = graph.nodes.get(currentId);

            if (recordSteps) {
                steps.push({
                    type: 'visit',
                    nodeId: currentId,
                    cost: currentCost,
                    description: `Evaluating intersection [${currentNode.name}] (Tentative cost: ${currentCost.toFixed(2)})`
                });
            }

            // Destination reached with optimal cost
            if (currentId === targetNodeId) {
                destinationReached = true;
                if (recordSteps) {
                    steps.push({
                        type: 'reached',
                        nodeId: targetNodeId,
                        cost: currentCost,
                        description: `Destination [${targetNode.name}] reached! Optimal cost: ${currentCost.toFixed(2)}.`
                    });
                }
                break;
            }

            // 4. Relax outgoing road edges
            const outgoingEdges = graph.adjacencyList.get(currentId) || [];
            for (const edge of outgoingEdges) {
                edgesEvaluated++;
                const neighborId = edge.to;
                const neighborNode = graph.nodes.get(neighborId);

                // Skip settled nodes
                if (visited.has(neighborId)) continue;

                // Dynamic edge cost evaluation based on routing mode
                const edgeCost = graph.getDynamicCost(edge, mode);
                if (edgeCost === Infinity) {
                    if (recordSteps) {
                        steps.push({
                            type: 'blocked',
                            fromId: currentId,
                            toId: neighborId,
                            description: `Road to [${neighborNode?.name}] is BLOCKED. Skipping.`
                        });
                    }
                    continue;
                }

                const newCost = currentCost + edgeCost;
                const existingCost = distances.get(neighborId);

                if (newCost < existingCost) {
                    distances.set(neighborId, newCost);
                    previous.set(neighborId, { fromNodeId: currentId, edge });
                    pq.push(neighborId, newCost);

                    if (recordSteps) {
                        steps.push({
                            type: 'relax',
                            fromId: currentId,
                            toId: neighborId,
                            edgeCost,
                            newCost,
                            description: `Relaxed road to [${neighborNode.name}]: cost improved from ${existingCost === Infinity ? '∞' : existingCost.toFixed(2)} to ${newCost.toFixed(2)}.`
                        });
                    }
                }
            }
        }

        const calcTimeMs = performance.now() - startTime;

        // 5. Check if route was found
        if (!destinationReached && distances.get(targetNodeId) === Infinity) {
            return {
                success: false,
                mode,
                error: `No route is currently available between ${startNode.name} and ${targetNode.name}. Try removing a road blockade.`,
                nodesExplored,
                edgesEvaluated,
                calcTimeMs: Number(calcTimeMs.toFixed(2)),
                steps
            };
        }

        // 6. Backtrack path
        const pathNodeIds = [];
        const pathEdges = [];
        let curr = targetNodeId;

        while (curr !== null) {
            pathNodeIds.unshift(curr);
            const prevEntry = previous.get(curr);
            if (prevEntry) {
                pathEdges.unshift(prevEntry.edge);
                curr = prevEntry.fromNodeId;
            } else {
                curr = null;
            }
        }

        // 7. Assemble continuous road coordinates and calculate real metrics
        const pathNodes = pathNodeIds.map(id => graph.nodes.get(id));
        const roadCoordinates = [];
        let totalRoadDistanceKm = 0;
        let trafficLightCount = 0;
        let redLightCount = 0;
        let yellowLightCount = 0;
        let shortcutCount = 0;
        let totalTimeMinutes = 0;

        for (let i = 0; i < pathEdges.length; i++) {
            const edge = pathEdges[i];
            totalRoadDistanceKm += edge.distance;
            if (edge.roadType === 'shortcut') shortcutCount++;

            // Destination intersection of this edge
            const toNode = graph.nodes.get(edge.to);
            if (toNode && toNode.trafficLight) {
                trafficLightCount++;
                if (toNode.trafficState === 'red') redLightCount++;
                else if (toNode.trafficState === 'yellow') yellowLightCount++;
            }

            // Real travel time for this edge
            const edgeTravelTime = graph.getTravelTimeCost(edge);
            if (edgeTravelTime !== Infinity) {
                totalTimeMinutes += edgeTravelTime;
            }

            // Append edge coordinates
            const coords = edge.coordinates;
            if (roadCoordinates.length === 0) {
                roadCoordinates.push(...coords);
            } else {
                roadCoordinates.push(...coords.slice(1));
            }
        }

        const weightedCost = Number(distances.get(targetNodeId).toFixed(2));
        const estimatedTimeMin = Number(totalTimeMinutes.toFixed(1));

        return {
            success: true,
            mode,
            startNode,
            targetNode,
            pathNodeIds,
            pathNodes,
            pathEdges,
            roadCoordinates,
            totalDistanceKm: Number(totalRoadDistanceKm.toFixed(2)),
            estimatedTimeMin,
            weightedCost,
            stepCount: pathNodes.length,
            trafficLightCount,
            redLightCount,
            yellowLightCount,
            shortcutCount,
            nodesExplored,
            edgesEvaluated,
            calcTimeMs: Number(calcTimeMs.toFixed(2)),
            steps
        };
    }
}
