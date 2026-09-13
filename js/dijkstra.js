/**
 * ============================================================================
 * MANUAL DIJKSTRA'S ALGORITHM IMPLEMENTATION (js/dijkstra.js)
 * ============================================================================
 *
 * Core Shortest-Path Algorithm:
 * - Implemented natively in vanilla JavaScript without third-party routing APIs.
 * - Binary Min-Heap Priority Queue achieving O((V + E) * log V) time complexity.
 * - Single Source of Truth: Constructs continuous road polyline coordinates directly
 *   from traversed road geometry edges for Leaflet polyline rendering and vehicle movement.
 */

if (typeof require !== 'undefined') {
    if (typeof GeoUtils === 'undefined') {
        globalThis.GeoUtils = require('./geoUtils.js');
    }
}

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
     * Compute path using Dijkstra's Algorithm
     *
     * @param {CityRoadGraph} graph - Topological Road Graph
     * @param {string} startNodeId - Origin Node ID
     * @param {string} targetNodeId - Destination Node ID
     * @param {Object|boolean} options - Cost function or boolean for recordSteps
     * @returns {Object} Route result containing path nodes, edges, coordinates, distances, and costs
     */
    static findShortestPath(graph, startNodeId, targetNodeId, options = {}) {
        const startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        let recordSteps = false;
        let costType = 'fastest'; // 'fastest' | 'distance'
        let customCostFn = null;

        if (typeof options === 'boolean') {
            recordSteps = options;
        } else if (typeof options === 'object' && options !== null) {
            recordSteps = Boolean(options.recordSteps);
            costType = options.costType || 'fastest';
            customCostFn = options.costFn || null;
        }

        // 1. Validation
        if (!graph || !graph.nodes.has(startNodeId)) {
            return { success: false, error: `Start location '${startNodeId}' is not in the road network.` };
        }
        if (!graph.nodes.has(targetNodeId)) {
            return { success: false, error: `Destination '${targetNodeId}' is not in the road network.` };
        }

        const startNode = graph.nodes.get(startNodeId);
        const targetNode = graph.nodes.get(targetNodeId);

        if (startNode.blocked) {
            return { success: false, error: `Start intersection [${startNode.name}] is currently blocked.` };
        }
        if (targetNode.blocked) {
            return { success: false, error: `Destination [${targetNode.name}] is currently blocked.` };
        }

        // 2. Cost function resolution
        const getCost = customCostFn || ((edge) => {
            return costType === 'distance' ? graph.getDistanceCost(edge) : graph.getFastestCost(edge);
        });

        // 3. Initialize Data Structures
        const distances = new Map(); // nodeId -> tentative minimum cost
        const previous = new Map();  // nodeId -> { fromNodeId, edge }
        const visited = new Set();   // Settled nodes
        const pq = new MinHeapPriorityQueue();
        const steps = [];

        let nodesExploredCount = 0;
        let edgesEvaluatedCount = 0;

        for (const [nodeId] of graph.nodes) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
        }

        // Distance to start is 0
        distances.set(startNodeId, 0);
        pq.push(startNodeId, 0);

        if (recordSteps) {
            steps.push({
                type: 'init',
                nodeId: startNodeId,
                cost: 0,
                description: `Initialized search at [${startNode.name}]. Starting cost = 0. All other nodes = ∞.`
            });
        }

        let destinationReached = false;

        // 4. Main Dijkstra Greedy Traversal
        while (!pq.isEmpty()) {
            const { item: currentId, priority: currentCost } = pq.pop();

            if (visited.has(currentId)) continue;
            if (currentCost === Infinity) break;

            visited.add(currentId);
            nodesExploredCount++;
            const currentNode = graph.nodes.get(currentId);

            if (recordSteps) {
                steps.push({
                    type: 'visit',
                    nodeId: currentId,
                    cost: currentCost,
                    description: `Evaluating intersection [${currentNode.name}] (Current shortest cost: ${currentCost.toFixed(1)})`
                });
            }

            if (currentId === targetNodeId) {
                destinationReached = true;
                if (recordSteps) {
                    steps.push({
                        type: 'reached',
                        nodeId: targetNodeId,
                        cost: currentCost,
                        description: `Destination [${targetNode.name}] reached! Optimal cost: ${currentCost.toFixed(1)}.`
                    });
                }
                break;
            }

            // 5. Relax outgoing road edges
            const outgoingEdges = graph.adjacencyList.get(currentId) || [];
            for (const edge of outgoingEdges) {
                edgesEvaluatedCount++;
                const neighborId = edge.to;
                const neighborNode = graph.nodes.get(neighborId);

                if (visited.has(neighborId)) continue;

                const edgeCost = getCost(edge);
                if (edgeCost === Infinity) {
                    if (recordSteps) {
                        steps.push({
                            type: 'blocked',
                            fromId: currentId,
                            toId: neighborId,
                            description: `Road to [${neighborNode?.name || neighborId}] is BLOCKED. Skipping.`
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
                            description: `Relaxed road to [${neighborNode.name}]: cost improved to ${newCost.toFixed(1)}.`
                        });
                    }
                }
            }
        }

        const endTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const calcTimeMs = Number((endTime - startTime).toFixed(2));

        // 6. Path Reconstruction
        if (!destinationReached && distances.get(targetNodeId) === Infinity) {
            return {
                success: false,
                error: `NO ROUTE AVAILABLE: Destination [${targetNode.name}] is unreachable due to road blockades.`,
                destinationNodeId: targetNodeId,
                startNodeId,
                calcTimeMs,
                steps
            };
        }

        const pathNodeIds = [];
        const pathEdges = [];
        const edgeIds = [];
        let curr = targetNodeId;

        while (curr !== null) {
            pathNodeIds.unshift(curr);
            const prevEntry = previous.get(curr);
            if (prevEntry) {
                pathEdges.unshift(prevEntry.edge);
                edgeIds.unshift(prevEntry.edge.id);
                curr = prevEntry.fromNodeId;
            } else {
                curr = null;
            }
        }

        // 7. Assemble exact road coordinates (Single Source of Truth)
        const pathNodes = pathNodeIds.map(id => graph.nodes.get(id));
        const roadCoordinates = [];
        let totalDistanceMeters = 0;
        let trafficLightCount = 0;
        let shortcutCount = 0;
        const trafficLightsEncountered = [];

        for (let i = 0; i < pathEdges.length; i++) {
            const edge = pathEdges[i];
            const dist = edge.distanceMeters || (edge.distanceKm * 1000);
            totalDistanceMeters += dist;

            if (edge.shortcut || edge.roadType === 'shortcut') {
                shortcutCount++;
            }

            const toNode = graph.nodes.get(edge.to);
            const sigId = edge.trafficSignalId || (toNode ? toNode.trafficSignalId : null);
            const signal = sigId ? (graph.roadNetwork.signals?.[sigId] || graph.signals.get(sigId)) : null;

            if (signal) {
                trafficLightCount++;
                trafficLightsEncountered.push({
                    nodeId: edge.to,
                    name: toNode?.name || edge.to,
                    state: signal.state
                });
            }

            const coords = edge.coordinates;
            if (roadCoordinates.length === 0) {
                roadCoordinates.push(...coords);
            } else {
                // Avoid duplicating the junction coordinate
                roadCoordinates.push(...coords.slice(1));
            }
        }

        const totalDistanceKm = Number((totalDistanceMeters / 1000).toFixed(2));
        const finalCost = Number(distances.get(targetNodeId).toFixed(2));

        // Estimated travel time in minutes
        // If costType is 'fastest', cost is travel time in seconds
        let estimatedTimeSec = costType === 'fastest' ? finalCost : (totalDistanceMeters / ((40 * 1000) / 3600));
        let estimatedTimeMin = Number((estimatedTimeSec / 60).toFixed(1));

        return {
            success: true,
            startNodeId,
            destinationNodeId: targetNodeId,
            startNode,
            targetNode,
            pathNodeIds,
            pathNodes,
            edgeIds,
            pathEdges,
            coordinates: roadCoordinates,
            roadCoordinates,
            cost: finalCost,
            totalDistanceMeters: Math.round(totalDistanceMeters),
            totalDistanceKm,
            estimatedTimeSec: Math.round(estimatedTimeSec),
            estimatedTimeMin,
            trafficLightCount,
            trafficLightsEncountered,
            shortcutCount,
            nodesExploredCount,
            edgesEvaluatedCount,
            calcTimeMs,
            steps
        };
    }
}

if (typeof window !== 'undefined') {
    window.MinHeapPriorityQueue = MinHeapPriorityQueue;
    window.DijkstraRouter = DijkstraRouter;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MinHeapPriorityQueue, DijkstraRouter };
}
