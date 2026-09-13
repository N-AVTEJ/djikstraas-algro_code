/**
 * ============================================================================
 * ROUTING MANAGER & DUAL ROUTE COMPARATOR (js/routing.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Computes Route Mode 1: "Normal / Casual Route" (pure geometric road distance,
 *    no signal optimization, subtle blue/gray route line).
 * 2. Computes Route Mode 2: "Dijkstra Fastest Route" (simulated travel time
 *    considering road speed, traffic lights, shortcuts, and blockades, bright green).
 * 3. Compares both routes to produce metrics:
 *    - Time Saved (min)
 *    - Distance Difference (+/- km)
 * 4. Generates clear explainability cards: "Why did Dijkstra choose this route?".
 */

if (typeof require !== 'undefined') {
    if (typeof DijkstraRouter === 'undefined') {
        const dijkstraMod = require('./dijkstra.js');
        globalThis.DijkstraRouter = dijkstraMod.DijkstraRouter;
    }
}

class RoutingManager {
    constructor(graph) {
        this.graph = graph;
    }

    /**
     * Compute both Normal Route and Dijkstra Fastest Route for comparison
     *
     * @param {string} startNodeId
     * @param {string} destNodeId
     * @param {Object} options
     * @returns {Object} { normal, dijkstra, comparison, explain }
     */
    computeRoutes(startNodeId, destNodeId, options = {}) {
        if (!startNodeId || !destNodeId) {
            return {
                normal: { success: false, error: 'Select both origin and destination.' },
                dijkstra: { success: false, error: 'Select both origin and destination.' },
                comparison: null,
                explain: []
            };
        }

        // 1. Calculate Normal / Casual Route (Minimizes pure road distance)
        const normal = DijkstraRouter.findShortestPath(this.graph, startNodeId, destNodeId, {
            costType: 'distance',
            recordSteps: false
        });
        if (normal.success) {
            normal.mode = 'normal';
            normal.label = 'Normal / Casual Route';
            normal.color = '#3b82f6'; // Subtle Blue/Gray
        }

        // 2. Calculate Dijkstra Fastest Route (Minimizes dynamic travel time + signals + shortcuts)
        const dijkstra = DijkstraRouter.findShortestPath(this.graph, startNodeId, destNodeId, {
            costType: 'fastest',
            recordSteps: options.recordSteps || false
        });
        if (dijkstra.success) {
            dijkstra.mode = 'dijkstra';
            dijkstra.label = 'Dijkstra Fastest Route';
            dijkstra.color = '#00e676'; // High-visibility Emerald Green
        }

        // 3. Formulate Comparison & Explainability
        let comparison = null;
        const explain = [];

        if (normal.success && dijkstra.success) {
            const timeSavedMin = Number(Math.max(0, normal.estimatedTimeMin - dijkstra.estimatedTimeMin).toFixed(1));
            const timeSavedSec = Math.max(0, normal.estimatedTimeSec - dijkstra.estimatedTimeSec);
            const distDiffKm = Number((dijkstra.totalDistanceKm - normal.totalDistanceKm).toFixed(2));

            comparison = {
                normalDistanceKm: normal.totalDistanceKm,
                normalTimeMin: normal.estimatedTimeMin,
                dijkstraDistanceKm: dijkstra.totalDistanceKm,
                dijkstraTimeMin: dijkstra.estimatedTimeMin,
                timeSavedMin,
                timeSavedSec,
                distDiffKm,
                dijkstraIsFaster: dijkstra.estimatedTimeMin < normal.estimatedTimeMin,
                isSameRoute: dijkstra.pathNodeIds.join('->') === normal.pathNodeIds.join('->')
            };

            // Count Red lights avoided by Dijkstra compared to Normal route
            const normalRedLights = normal.trafficLightsEncountered?.filter(s => s.state === 'RED').length || 0;
            const dijkstraRedLights = dijkstra.trafficLightsEncountered?.filter(s => s.state === 'RED').length || 0;
            const redLightsAvoided = Math.max(0, normalRedLights - dijkstraRedLights);

            if (redLightsAvoided > 0) {
                explain.push(`Avoided ${redLightsAvoided} congested RED traffic signal${redLightsAvoided > 1 ? 's' : ''}`);
            }

            if (dijkstra.shortcutCount > 0) {
                explain.push(`Utilized ${dijkstra.shortcutCount} express shortcut corridor${dijkstra.shortcutCount > 1 ? 's' : ''}`);
            }

            if (timeSavedMin > 0) {
                explain.push(`${timeSavedMin} min faster travel time than normal route`);
            } else {
                explain.push(`Direct shortest distance matches fastest travel corridor`);
            }

            if (distDiffKm > 0) {
                explain.push(`Took slightly longer road (+${distDiffKm} km) to bypass severe traffic delays`);
            }

            explain.push(`Calculated in ${dijkstra.calcTimeMs} ms with Binary Min-Heap Priority Queue`);
        }

        return {
            normal,
            dijkstra,
            comparison,
            explain
        };
    }
}

if (typeof window !== 'undefined') {
    window.RoutingManager = RoutingManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RoutingManager;
}
