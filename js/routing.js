/**
 * ============================================================================
 * ROUTING CONTROLLER & DUAL-MODE COMPARATOR (js/routing.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Manages "Normal / Casual Route" (shortest geographical baseline road path).
 * 2. Manages "Dijkstra Fastest Route" (travel time-optimized route with live signals & speeds).
 * 3. Generates side-by-side comparison metrics (Time Saved, Distance Diff).
 * 4. Generates "Why Did Dijkstra Choose This Route?" explainability insights.
 */

class RoutingManager {
    constructor(graph) {
        this.graph = graph;
        this.normalRoute = null;
        this.dijkstraRoute = null;
        this.activeMode = 'dijkstra'; // 'normal' | 'dijkstra' | 'compare'
    }

    /**
     * Compute both Normal Route and Dijkstra Fastest Route
     */
    computeRoutes(startNodeId, targetNodeId, recordSteps = false) {
        // 1. Compute Normal Route (Geographic distance baseline)
        this.normalRoute = DijkstraRouter.findPath(this.graph, startNodeId, targetNodeId, {
            mode: 'normal',
            recordSteps: false
        });

        // 2. Compute Dijkstra Fastest Route (Travel-time optimized)
        this.dijkstraRoute = DijkstraRouter.findPath(this.graph, startNodeId, targetNodeId, {
            mode: 'fastest',
            recordSteps
        });

        const comparison = this.generateComparison();
        return {
            normal: this.normalRoute,
            dijkstra: this.dijkstraRoute,
            comparison
        };
    }

    /**
     * Compare Normal Route vs Dijkstra Route
     */
    generateComparison() {
        if (!this.normalRoute || !this.dijkstraRoute) return null;
        if (!this.normalRoute.success || !this.dijkstraRoute.success) {
            return {
                valid: false,
                reason: this.dijkstraRoute.error || this.normalRoute.error || 'Route unavailable'
            };
        }

        const normTime = this.normalRoute.estimatedTimeMin;
        const dijkTime = this.dijkstraRoute.estimatedTimeMin;
        const normDist = this.normalRoute.totalDistanceKm;
        const dijkDist = this.dijkstraRoute.totalDistanceKm;

        const timeSaved = Math.max(0, Number((normTime - dijkTime).toFixed(1)));
        const distDiff = Number((dijkDist - normDist).toFixed(2));

        const redAvoided = Math.max(0, this.normalRoute.redLightCount - this.dijkstraRoute.redLightCount);
        const shortcutsUsed = this.dijkstraRoute.shortcutCount;

        // Formulate clear, educational explainability points
        const reasons = [];

        if (redAvoided > 0) {
            reasons.push(`Avoided ${redAvoided} red traffic light delay${redAvoided > 1 ? 's' : ''}`);
        }
        if (shortcutsUsed > 0) {
            reasons.push(`Utilized ${shortcutsUsed} express shortcut bypass${shortcutsUsed > 1 ? 'es' : ''}`);
        }
        if (timeSaved > 0) {
            reasons.push(`${timeSaved} minutes faster simulated travel time`);
        }
        if (distDiff > 0 && timeSaved > 0) {
            reasons.push(`Diverted +${distDiff} km longer in distance to gain high-speed roads and skip delays`);
        } else if (distDiff < 0) {
            reasons.push(`${Math.abs(distDiff)} km shorter road path`);
        } else if (timeSaved === 0 && distDiff === 0) {
            reasons.push('Normal route is already optimal under current traffic conditions');
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
