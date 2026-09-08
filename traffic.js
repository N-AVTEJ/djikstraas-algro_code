/**
 * ============================================================================
 * TRAFFIC LIGHT SYSTEM & REAL-TIME CONTROLLER
 * ============================================================================
 * 
 * Manages traffic light nodes in the city graph.
 * - Alternates state every 3 seconds: Yellow (cost 1.5) <-> Red (cost 4.0)
 * - Automatically triggers Dijkstra route recalculation when state changes
 * - Provides visual update events for Leaflet markers
 */

class TrafficLightManager {
    constructor(graph, onStateChangeCallback) {
        this.graph = graph;
        this.onStateChangeCallback = onStateChangeCallback;
        this.timer = null;
        this.isRunning = false;
        this.intervalMs = 3000; // 3 seconds cycle
    }

    /**
     * Add or toggle traffic light at a specific node
     */
    toggleTrafficLightAtNode(nodeId) {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return null;

        if (node.type === 'traffic-light') {
            // Remove traffic light
            node.type = 'normal';
            node.lightState = 'yellow';
            this.notifyChange('removed', node);
            return { action: 'removed', node };
        } else {
            // Add traffic light
            node.type = 'traffic-light';
            node.lightState = 'yellow';
            this.notifyChange('added', node);
            return { action: 'added', node };
        }
    }

    /**
     * Set specific state on a traffic light node
     */
    setLightState(nodeId, state) {
        const node = this.graph.nodes.get(nodeId);
        if (!node || node.type !== 'traffic-light') return;

        if (state === 'yellow' || state === 'red') {
            node.lightState = state;
            this.notifyChange('state_changed', node);
        }
    }

    /**
     * Start the automated 3-second cycle for all active traffic lights
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.timer = setInterval(() => {
            this.tick();
        }, this.intervalMs);
    }

    /**
     * Stop the automated cycle
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
    }

    /**
     * Execute a single traffic cycle step
     */
    tick() {
        let changed = false;
        const changedNodes = [];

        for (const [, node] of this.graph.nodes) {
            if (node.type === 'traffic-light') {
                // Switch: Yellow -> Red -> Yellow -> Red
                node.lightState = node.lightState === 'yellow' ? 'red' : 'yellow';
                changed = true;
                changedNodes.push(node);
            }
        }

        if (changed && this.onStateChangeCallback) {
            this.onStateChangeCallback({
                type: 'cycle_tick',
                changedNodes
            });
        }
    }

    /**
     * Get list of all traffic lights currently in the graph
     */
    getAllTrafficLights() {
        const list = [];
        for (const [, node] of this.graph.nodes) {
            if (node.type === 'traffic-light') {
                list.push(node);
            }
        }
        return list;
    }

    /**
     * Helper to invoke the callback on change
     */
    notifyChange(action, node) {
        if (this.onStateChangeCallback) {
            this.onStateChangeCallback({
                type: action,
                node
            });
        }
    }
}
