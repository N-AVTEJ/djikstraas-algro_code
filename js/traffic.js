/**
 * ============================================================================
 * TRAFFIC LIGHT SYSTEM & CONTROLLER (js/traffic.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Connected to real road intersections.
 * 2. Manages 3-state traffic cycle: GREEN -> YELLOW -> RED -> GREEN.
 *      - Green:  +0s delay (clean flow)
 *      - Yellow: +20s delay (+0.33 min)
 *      - Red:    +75s delay (+1.25 min)
 * 3. 3-Second automatic cycle timer when "Auto Traffic" is active.
 * 4. Dispatches dynamic update callbacks for instant Dijkstra recalculation.
 */

class TrafficLightController {
    constructor(graph, onStateChange) {
        this.graph = graph;
        this.onStateChange = onStateChange; // callback(event)
        this.timer = null;
        this.isRunning = false;
        this.intervalMs = 3000; // 3 seconds
    }

    /**
     * Start the 3-second automatic cycling timer
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.timer = setInterval(() => {
            this.cycleTick();
        }, this.intervalMs);
    }

    /**
     * Stop automatic cycling
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
    }

    /**
     * Toggle traffic light presence on an intersection node
     */
    toggleTrafficLight(nodeId) {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return null;

        if (node.trafficLight) {
            node.trafficLight = false;
            node.trafficState = 'green';
            this.notify({ type: 'removed', nodeId });
            return { action: 'removed', node };
        } else {
            node.trafficLight = true;
            node.trafficState = 'green';
            this.notify({ type: 'added', nodeId });
            return { action: 'added', node };
        }
    }

    /**
     * Switch state of a specific traffic light manually
     * Cycle: GREEN -> YELLOW -> RED -> GREEN
     */
    switchLight(nodeId) {
        const node = this.graph.nodes.get(nodeId);
        if (!node || !node.trafficLight) return;

        const nextStates = {
            'green': 'yellow',
            'yellow': 'red',
            'red': 'green'
        };
        node.trafficState = nextStates[node.trafficState] || 'green';
        this.notify({ type: 'state_changed', nodeId, state: node.trafficState });
    }

    /**
     * Periodic 3-second tick: advance states of all active traffic lights
     */
    cycleTick() {
        let changed = false;
        const updatedNodes = [];
        const nextStates = {
            'green': 'yellow',
            'yellow': 'red',
            'red': 'green'
        };

        for (const [, node] of this.graph.nodes) {
            if (node.trafficLight) {
                node.trafficState = nextStates[node.trafficState] || 'green';
                changed = true;
                updatedNodes.push({ id: node.id, name: node.name, state: node.trafficState });
            }
        }

        if (changed && this.onStateChange) {
            this.onStateChange({
                type: 'cycle',
                updatedNodes
            });
        }
    }

    notify(event) {
        if (this.onStateChange) {
            this.onStateChange(event);
        }
    }
}
