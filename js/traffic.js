/**
 * ============================================================================
 * TRAFFIC LIGHT SYSTEM & CONTROLLER (js/traffic.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Tracks traffic lights on road intersections.
 * 2. Alternates traffic light states every 3 seconds:
 *      Yellow (delay +1.5) <--> Red (delay +4.0)
 * 3. Dispatches notifications to trigger instant Dijkstra rerouting without page reload.
 * 4. Supports manual placement and toggling on road intersections.
 */

class TrafficLightController {
    constructor(graph, onStateChange) {
        this.graph = graph;
        this.onStateChange = onStateChange;
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
            node.trafficState = 'yellow';
            this.notify({ type: 'removed', nodeId });
            return { action: 'removed', node };
        } else {
            node.trafficLight = true;
            node.trafficState = 'yellow';
            this.notify({ type: 'added', nodeId });
            return { action: 'added', node };
        }
    }

    /**
     * Switch state of a specific traffic light
     */
    switchLight(nodeId) {
        const node = this.graph.nodes.get(nodeId);
        if (!node || !node.trafficLight) return;

        node.trafficState = node.trafficState === 'yellow' ? 'red' : 'yellow';
        this.notify({ type: 'state_changed', nodeId, state: node.trafficState });
    }

    /**
     * Periodic 3-second tick: flip states of all active traffic lights
     */
    cycleTick() {
        let changed = false;
        const updatedNodes = [];

        for (const [, node] of this.graph.nodes) {
            if (node.trafficLight) {
                node.trafficState = node.trafficState === 'yellow' ? 'red' : 'yellow';
                changed = true;
                updatedNodes.push({ id: node.id, state: node.trafficState });
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
