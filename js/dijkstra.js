/**
 * ============================================================================
 * MANUAL DIJKSTRA'S ALGORITHM IMPLEMENTATION (js/dijkstra.js)
 * ============================================================================
 *
 * Core Shortest-Path Algorithm:
 * Implemented natively in vanilla JavaScript without third-party routing APIs.
 *
 * Traversal Cost Model:
 *   Edge Cost = Road Segment Distance (km) * Road Multiplier + Destination Delay
 *   - Normal Road:    Multiplier = 1.0
 *   - Shortcut Road:  Multiplier = 0.5 (Express corridor)
 *   - Yellow Light:   +1.5 cost penalty
 *   - Red Light:      +4.0 cost penalty
 *   - Blocked Edge:   Weight = Infinity (Impassable)
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
     * Compute shortest path from startNodeId to targetNodeId
     *
     * @param {CityRoadGraph} graph - Topological Road Graph
     * @param {string} startNodeId - Origin Node ID
     * @param {string} targetNodeId - Destination Node ID
     * @param {boolean} recordSteps - Whether to log step-by-step states for visualizer
     * @returns {Object} Route result containing path nodes, edges, coordinates, distances, and costs
     */
    static findShortestPath(graph, startNodeId, targetNodeId, recordSteps = false) {
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

        // 2. Initialize Data Structures
        const distances = new Map(); // nodeId -> tentative cost
        const previous = new Map();  // nodeId -> { fromNodeId, edge }
        const visited = new Set();   // Settled nodes
        const pq = new MinHeapPriorityQueue();
        const steps = [];            // Step-by-step exploration log

        for (const [nodeId] of graph.nodes) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
        }

        // Distance to origin is 0
        distances.set(startNodeId, 0);
        pq.push(startNodeId, 0);

        if (recordSteps) {
            steps.push({
                type: 'init',
                nodeId: startNodeId,
                cost: 0,
                description: `Initialized search at [${startNode.name}]. Tentative cost = 0. All other nodes = ∞.`
            });
        }

        let destinationReached = false;

        // 3. Main Dijkstra Greedy Traversal
        while (!pq.isEmpty()) {
            const { item: currentId, priority: currentCost } = pq.pop();

            // Ignore stale entries from heap
            if (visited.has(currentId)) continue;
            if (currentCost === Infinity) break;

            visited.add(currentId);
            const currentNode = graph.nodes.get(currentId);

            if (recordSteps) {
                steps.push({
                    type: 'visit',
                    nodeId: currentId,
                    cost: currentCost,
                    description: `Evaluating intersection [${currentNode.name}] (Current shortest cost: ${currentCost.toFixed(2)})`
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
                const neighborId = edge.to;
                const neighborNode = graph.nodes.get(neighborId);

                // Skip settled nodes
                if (visited.has(neighborId)) continue;

                // Dynamic edge cost evaluation
                const edgeCost = graph.getDynamicCost(edge);
                if (edgeCost === Infinity) {
                    // Blocked road / obstacle
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

        // 5. Reconstruct Shortest Path
        if (!destinationReached && distances.get(targetNodeId) === Infinity) {
            return {
                success: false,
                error: `NO ROUTE AVAILABLE: The selected destination cannot be reached from the start point due to road blockades.`,
                calcTimeMs: Number(calcTimeMs.toFixed(2)),
                steps
            };
        }

        // Backtrack path
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

        // Single Source of Truth: Assemble continuous road coordinates
        const pathNodes = pathNodeIds.map(id => graph.nodes.get(id));
        const roadCoordinates = [];
        let totalRoadDistanceKm = 0;
        let trafficLightCount = 0;
        let shortcutCount = 0;
        let blockedEdgesEncountered = 0;

        for (let i = 0; i < pathEdges.length; i++) {
            const edge = pathEdges[i];
            totalRoadDistanceKm += edge.distance;
            if (edge.roadType === 'shortcut') shortcutCount++;

            // Destination node of this edge
            const toNode = graph.nodes.get(edge.to);
            if (toNode && toNode.trafficLight) {
                trafficLightCount++;
            }

            // Append edge coordinates
            const coords = edge.coordinates;
            if (roadCoordinates.length === 0) {
                roadCoordinates.push(...coords);
            } else {
                // Avoid repeating shared intersection coordinate
                roadCoordinates.push(...coords.slice(1));
            }
        }

        const totalCost = Number(distances.get(targetNodeId).toFixed(2));

        return {
            success: true,
            startNode,
            targetNode,
            pathNodeIds,
            pathNodes,
            pathEdges,
            roadCoordinates,
            totalCost,
            totalDistanceKm: Number(totalRoadDistanceKm.toFixed(2)),
            stepCount: pathNodes.length,
            trafficLightCount,
            shortcutCount,
            calcTimeMs: Number(calcTimeMs.toFixed(2)),
            steps
        };
    }
}
