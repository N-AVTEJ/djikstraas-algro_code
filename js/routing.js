/**
 * ============================================================================
 * ROUTING CONTROLLER & DUAL-MODE ROUTE COMPARATOR (js/routing.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Coordinates Normal Route and Dijkstra Fastest Route on the SAME road network.
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

        // 1. Compute Normal Route (Geographic distance baseline)
        this.normalRoute = DijkstraRouter.findPath(this.graph, startNodeId, targetNodeId, {
            mode: 'normal',
            recordSteps: false
        });

        // 2. Compute Dijkstra Fastest Route (Travel-time and traffic optimized)
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
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RoutingManager;
}
