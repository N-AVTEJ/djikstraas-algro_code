/**
 * ============================================================================
 * SINGLE AUTHORITATIVE NAVIGATION STATE (js/navigationState.js)
 * ============================================================================
 *
 * Primary Architectural Rule:
 * There is exactly ONE authoritative navigation state in the entire application.
 * All UI labels, map markers, Dijkstra solvers, route polylines, and vehicle
 * animators MUST reference this state object.
 */

class NavigationStateManager {
    constructor() {
        this.state = {
            start: {
                nodeId: null,
                lat: null,
                lng: null,
                name: null
            },
            destination: {
                nodeId: null,
                lat: null,
                lng: null,
                name: null
            },
            activeRoute: null,
            normalRoute: null,
            dijkstraRoute: null
        };

        // Listeners for state change events
        this.listeners = [];
    }

    addListener(fn) {
        this.listeners.push(fn);
    }

    notify(type, data) {
        this.listeners.forEach(fn => fn(type, this.state, data));
    }

    /**
     * Section 3: Set Origin / Start Point
     */
    setStart(node, snappedCoord = null) {
        if (!node) return;

        const lat = snappedCoord ? snappedCoord[0] : node.lat;
        const lng = snappedCoord ? snappedCoord[1] : node.lng;

        this.state.start = {
            nodeId: node.id,
            lat,
            lng,
            name: node.name
        };

        // Clear active routes when start changes to prevent route mismatch
        this.clearRoutes();

        console.log(`[ROUTING] Start node set: ${node.id} (${node.name}) at [${lat}, ${lng}]`);
        this.notify('start_changed', this.state.start);
    }

    /**
     * Section 2 & 3: Set Destination Point
     * CLEAR: previous destination marker, previous route, previous vehicle route,
     * previous Dijkstra result, previous normal route.
     * DO NOT allow an old destination to remain internally active.
     */
    setDestination(node, snappedCoord = null) {
        if (!node) return;

        // Clear previous routes, results, and vehicle path before setting new destination
        this.clearRoutes();

        const lat = snappedCoord ? snappedCoord[0] : node.lat;
        const lng = snappedCoord ? snappedCoord[1] : node.lng;

        this.state.destination = {
            nodeId: node.id,
            lat,
            lng,
            name: node.name
        };

        console.log(`[ROUTING] Destination node set: ${node.id} (${node.name}) at [${lat}, ${lng}]`);
        this.notify('destination_changed', this.state.destination);
    }

    /**
     * Clear active and cached routes
     */
    clearRoutes() {
        this.state.activeRoute = null;
        this.state.normalRoute = null;
        this.state.dijkstraRoute = null;
        this.notify('routes_cleared', null);
    }

    /**
     * Set active routes (normal and dijkstra)
     */
    setRoutes(normalRoute, dijkstraRoute, activeMode = 'dijkstra') {
        this.state.normalRoute = normalRoute;
        this.state.dijkstraRoute = dijkstraRoute;
        this.state.activeRoute = activeMode === 'normal' ? normalRoute : dijkstraRoute;
        this.notify('routes_updated', { activeMode });
    }

    /**
     * Swap Origin and Destination
     */
    swapLocations() {
        if (!this.state.start.nodeId || !this.state.destination.nodeId) return false;

        const tempStart = { ...this.state.start };
        const tempDest = { ...this.state.destination };

        this.clearRoutes();

        this.state.start = tempDest;
        this.state.destination = tempStart;

        console.log(`[ROUTING] Swapped locations: Start is now ${this.state.start.name}, Dest is ${this.state.destination.name}`);
        this.notify('locations_swapped', this.state);
        return true;
    }

    /**
     * Reset complete state to empty
     */
    reset() {
        this.state.start = { nodeId: null, lat: null, lng: null, name: null };
        this.state.destination = { nodeId: null, lat: null, lng: null, name: null };
        this.state.activeRoute = null;
        this.state.normalRoute = null;
        this.state.dijkstraRoute = null;
        this.notify('reset', null);
    }

    /**
     * Section 4: Strict Destination Validation
     * Before running Dijkstra:
     * Check:
     * - start exists
     * - destination exists
     * - start node exists
     * - destination node exists
     * - both nodes exist in roadNetwork.nodes
     * - destination node matches destination marker
     * - route target matches destination node
     */
    validateNavigationState(roadNetwork) {
        if (!this.state.start || !this.state.start.nodeId) {
            return { valid: false, error: "Start location has not been selected." };
        }
        if (!this.state.destination || !this.state.destination.nodeId) {
            return { valid: false, error: "Destination has not been selected." };
        }

        const startNode = roadNetwork.nodes[this.state.start.nodeId];
        const destNode = roadNetwork.nodes[this.state.destination.nodeId];

        if (!startNode) {
            return {
                valid: false,
                error: `Navigation state is inconsistent: Start node '${this.state.start.nodeId}' does not exist in road network. Please reselect start.`
            };
        }
        if (!destNode) {
            return {
                valid: false,
                error: `Navigation state is inconsistent: Destination node '${this.state.destination.nodeId}' does not exist in road network. Please reselect destination.`
            };
        }

        if (startNode.blocked) {
            return { valid: false, error: `Start location (${startNode.name}) is currently blocked.` };
        }
        if (destNode.blocked) {
            return { valid: false, error: `Destination location (${destNode.name}) is currently blocked.` };
        }

        return {
            valid: true,
            startNode,
            destNode
        };
    }

    /**
     * Section 25: Route Integrity Checks (10 Hard Invariants)
     * Checks:
     * 1. route.startNodeId === navigationState.start.nodeId
     * 2. route.destinationNodeId === navigationState.destination.nodeId
     * 3. route.coordinates.length > 1
     * 4. first coordinate is near start
     * 5. last coordinate is near destination
     * 6. every edge exists
     * 7. every edge is not blocked
     * 8. consecutive edges connect correctly
     * 9. every coordinate is valid
     * 10. route distance > 0
     */
    assertRouteIntegrity(route, roadNetwork) {
        if (!route) {
            throw new Error("[ROUTE INTEGRITY ERROR] Route is null or undefined");
        }

        // 1. Start node match
        if (route.startNodeId !== this.state.start.nodeId) {
            throw new Error(`[ROUTE INTEGRITY ERROR] Start node mismatch: route has '${route.startNodeId}', navigationState has '${this.state.start.nodeId}'`);
        }

        // 2. Destination node match
        if (route.destinationNodeId !== this.state.destination.nodeId) {
            throw new Error(`[ROUTE DESTINATION MISMATCH] Destination node mismatch: route ends at '${route.destinationNodeId}', navigationState destination is '${this.state.destination.nodeId}'`);
        }

        // 3. Coordinates length > 1
        if (!route.coordinates || route.coordinates.length < 2) {
            throw new Error(`[ROUTE INTEGRITY ERROR] Route coordinates length must be > 1, got ${route.coordinates?.length}`);
        }

        // 4. First coordinate is near start
        const startDist = GeoUtils.distanceMeters(route.coordinates[0], [this.state.start.lat, this.state.start.lng]);
        if (startDist > 150) {
            throw new Error(`[ROUTE INTEGRITY ERROR] First coordinate is ${startDist.toFixed(1)}m away from start point (threshold: 150m)`);
        }

        // 5. Last coordinate is near destination
        const lastCoord = route.coordinates[route.coordinates.length - 1];
        const destDist = GeoUtils.distanceMeters(lastCoord, [this.state.destination.lat, this.state.destination.lng]);
        if (destDist > 150) {
            throw new Error(`[ROUTE INTEGRITY ERROR] Last coordinate is ${destDist.toFixed(1)}m away from destination point (threshold: 150m)`);
        }

        // 6 & 7. Every edge exists and is not blocked
        for (const edgeId of route.edgeIds) {
            const edge = roadNetwork.edges[edgeId];
            if (!edge) {
                throw new Error(`[ROUTE INTEGRITY ERROR] Edge '${edgeId}' does not exist in road network`);
            }
            if (edge.blocked) {
                throw new Error(`[ROUTE INTEGRITY ERROR] Edge '${edgeId}' is blocked but present in calculated route`);
            }
        }

        // 8. Consecutive edges connect correctly (Section 26)
        if (route.edgeIds.length > 1) {
            for (let i = 0; i < route.edgeIds.length - 1; i++) {
                const e1 = roadNetwork.edges[route.edgeIds[i]];
                const e2 = roadNetwork.edges[route.edgeIds[i + 1]];
                const nodes1 = [e1.from, e1.to];
                const nodes2 = [e2.from, e2.to];
                const shared = nodes1.filter(n => nodes2.includes(n));
                if (shared.length === 0) {
                    throw new Error(`[ROUTE INTEGRITY ERROR] Consecutive edges ${e1.id} and ${e2.id} do not share an intersection node!`);
                }
            }
        }

        // 9. Every coordinate is valid [lat, lng]
        for (let i = 0; i < route.coordinates.length; i++) {
            const c = route.coordinates[i];
            if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number' || isNaN(c[0]) || isNaN(c[1])) {
                throw new Error(`[ROUTE INTEGRITY ERROR] Invalid coordinate at index ${i}: ${JSON.stringify(c)}`);
            }
        }

        // 10. Route distance > 0
        if (!route.distanceMeters || route.distanceMeters <= 0) {
            throw new Error(`[ROUTE INTEGRITY ERROR] Route distance must be > 0, got ${route.distanceMeters}`);
        }

        return true;
    }
}

// Global Singleton Instance
const navigationState = new NavigationStateManager();

if (typeof window !== 'undefined') {
    window.navigationState = navigationState;
    window.NavigationStateManager = NavigationStateManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { navigationState, NavigationStateManager };
}
