/**
 * ============================================================================
 * ROUTING CONTROLLER & DUAL-MODE ROUTE COMPARATOR (js/routing.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Coordinates Normal Route (Non-Dijkstra standard road baseline via BFS)
 *    and Dijkstra Fastest Route on the SAME authoritative road network.
 * 2. Generates genuine comparison statistics (Time Saved, Distance Diff).
 * 3. Formulates algorithmic explainability points ("Why Did Dijkstra Choose This Route?").
 * 4. Synchronizes calculated routes with navigationState.
 */

if (typeof require !== 'undefined') {
    if (typeof DijkstraRouter === 'undefined') {
        const dijkMod = require('./dijkstra.js');
        globalThis.DijkstraRouter = dijkMod.DijkstraRouter;
    }
    if (typeof navigationState === 'undefined') {
        const navMod = require('./navigationState.js');
        globalThis.navigationState = navMod.navigationState;
    }
}

/**
 * Standard unweighted road route solver (Section 21: Normal route does NOT use Dijkstra)
 */
class BreadthFirstRouter {
    static findPath(graph, startNodeId, targetNodeId) {
        const roadNetwork = graph.roadNetwork;
        const queue = [startNodeId];
        const visited = new Set([startNodeId]);
        const previous = new Map(); // nodeId -> { fromNodeId, edgeId }

        while (queue.length > 0) {
            const current = queue.shift();
            if (current === targetNodeId) break;

            const outgoing = graph.adjacencyMap.get(current) || [];
            for (const edge of outgoing) {
                const neighbor = edge.to;
                const edgeObj = roadNetwork.edges[edge.edgeId];
                if (edgeObj && edgeObj.blocked) continue;
                const neighborNode = roadNetwork.nodes[neighbor];
                if (neighborNode && neighborNode.blocked) continue;

                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    previous.set(neighbor, { fromNodeId: current, edgeId: edge.edgeId });
                    queue.push(neighbor);
                }
            }
        }

        if (!visited.has(targetNodeId)) {
            return {
                success: false,
                mode: 'normal',
                error: `No normal road route found between ${roadNetwork.nodes[startNodeId]?.name} and ${roadNetwork.nodes[targetNodeId]?.name}.`,
                coordinates: [],
                edgeIds: []
            };
        }

        // Backtrack Path Sequence
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

        // Assemble route coordinates directly from directed edge geometry
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

            const toNode = roadNetwork.nodes[toNodeId];
            if (toNode && toNode.trafficSignalId && roadNetwork.signals[toNode.trafficSignalId]) {
                trafficLightCount++;
                const sig = roadNetwork.signals[toNode.trafficSignalId];
                if (sig.state === "RED") redLightCount++;
                else if (sig.state === "YELLOW") yellowLightCount++;
            }

            const segTravelTime = graph.getTravelTimeSeconds(edgeId, toNodeId);
            totalTravelTimeSeconds += (segTravelTime !== Infinity ? segTravelTime : edge.distanceMeters / (edge.speedKmh * 1000 / 3600));

            const directedCoords = graph.getDirectedCoordinates(edgeId, fromNodeId);
            if (routeCoordinates.length === 0) {
                routeCoordinates.push(...directedCoords);
            } else {
                routeCoordinates.push(...directedCoords.slice(1));
            }
        }

        const distanceKm = Number((totalDistanceMeters / 1000).toFixed(2));
        const estimatedTimeMin = Number((totalTravelTimeSeconds / 60).toFixed(1));

        const route = {
            id: `route-normal-${Date.now()}`,
            success: true,
            mode: 'normal',
            startNodeId,
            destinationNodeId: targetNodeId,
            startNode: roadNetwork.nodes[startNodeId],
            targetNode: roadNetwork.nodes[targetNodeId],
            pathNodeIds,
            edgeIds: pathEdgeIds,
            coordinates: routeCoordinates,
            distanceMeters: totalDistanceMeters,
            distanceKm,
            estimatedTimeSeconds: totalTravelTimeSeconds,
            estimatedTimeMin,
            trafficLightCount,
            redLightCount,
            yellowLightCount,
            shortcutCount
        };

        if (typeof navigationState !== 'undefined') {
            navigationState.assertRouteIntegrity(route, roadNetwork);
        }

        return route;
    }
}

class RoutingManager {
    constructor(graph) {
        this.graph = graph;
        this.normalRoute = null;
        this.dijkstraRoute = null;
        this.activeMode = 'dijkstra'; // 'normal' | 'dijkstra' | 'compare'
    }

    /**
     * Compute both routes and update single authoritative navigationState
     */
    computeRoutes(startNodeId, targetNodeId, recordSteps = false) {
        // Section 4: Strict validation before running routing algorithms
        const validation = navigationState.validateNavigationState(this.graph.roadNetwork);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
                normal: null,
                dijkstra: null,
                comparison: null
            };
        }

        // 1. Compute Normal Route (Section 21: Casual/Normal road path via BreadthFirstRouter)
        this.normalRoute = BreadthFirstRouter.findPath(this.graph, startNodeId, targetNodeId);

        // 2. Compute Dijkstra Fastest Route (Travel-time and traffic signal dynamic optimization)
        this.dijkstraRoute = DijkstraRouter.findPath(this.graph, startNodeId, targetNodeId, {
            mode: 'dijkstra',
            recordSteps
        });

        // Register with authoritative navigationState
        navigationState.setRoutes(this.normalRoute, this.dijkstraRoute, this.activeMode);

        const comparison = this.generateComparison();

        return {
            success: this.dijkstraRoute.success || this.normalRoute.success,
            normal: this.normalRoute,
            dijkstra: this.dijkstraRoute,
            comparison
        };
    }

    /**
     * Section 23: Genuine Route Comparison
     */
    generateComparison() {
        if (!this.normalRoute || !this.dijkstraRoute) return null;
        if (!this.normalRoute.success || !this.dijkstraRoute.success) {
            return {
                valid: false,
                reason: this.dijkstraRoute.error || this.normalRoute.error || 'Route currently unavailable'
            };
        }

        const normTime = this.normalRoute.estimatedTimeMin;
        const dijkTime = this.dijkstraRoute.estimatedTimeMin;
        const normDist = this.normalRoute.distanceKm;
        const dijkDist = this.dijkstraRoute.distanceKm;

        const timeSaved = Math.max(0, Number((normTime - dijkTime).toFixed(1)));
        const distDiff = Number((dijkDist - normDist).toFixed(2));

        const redAvoided = Math.max(0, this.normalRoute.redLightCount - this.dijkstraRoute.redLightCount);
        const yellowAvoided = Math.max(0, this.normalRoute.yellowLightCount - this.dijkstraRoute.yellowLightCount);
        const shortcutsUsed = this.dijkstraRoute.shortcutCount;

        // Educational explainability points
        const reasons = [];

        if (redAvoided > 0) {
            reasons.push(`Bypassed ${redAvoided} RED traffic signal delay${redAvoided > 1 ? 's' : ''} (+${redAvoided * 30}s delay avoided)`);
        }
        if (yellowAvoided > 0) {
            reasons.push(`Avoided ${yellowAvoided} YELLOW signal cautionary slow-down${yellowAvoided > 1 ? 's' : ''}`);
        }
        if (shortcutsUsed > 0) {
            reasons.push(`Leveraged ${shortcutsUsed} Express Bypass Corridor (65 km/h high-speed transit)`);
        }
        if (timeSaved > 0) {
            reasons.push(`Saved ${timeSaved} minutes in total estimated travel time`);
        }
        if (distDiff > 0 && timeSaved > 0) {
            reasons.push(`Took a +${distDiff} km geographically longer road detour to save overall trip time`);
        } else if (distDiff < 0) {
            reasons.push(`Route is both ${Math.abs(distDiff)} km shorter and faster`);
        } else if (timeSaved === 0 && distDiff === 0) {
            reasons.push('Normal route is currently optimal under existing road & traffic conditions');
        }

        return {
            valid: true,
            normalDistanceKm: normDist,
            normalTimeMin: normTime,
            dijkstraDistanceKm: dijkDist,
            dijkstraTimeMin: dijkTime,
            timeSavedMin: timeSaved,
            distDiffKm: distDiff,
            redAvoided,
            shortcutsUsed,
            reasons
        };
    }
}

if (typeof window !== 'undefined') {
    window.RoutingManager = RoutingManager;
    window.BreadthFirstRouter = BreadthFirstRouter;
}
if (typeof module !== 'undefined' && module.exports) {
    RoutingManager.RoutingManager = RoutingManager;
    RoutingManager.BreadthFirstRouter = BreadthFirstRouter;
    module.exports = RoutingManager;
}
