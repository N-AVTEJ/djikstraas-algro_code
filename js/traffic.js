/**
 * ============================================================================
 * TRAFFIC LIGHT SYSTEM & CONTROLLER (js/traffic.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Manages realistic 3-state traffic lights anchored to road intersections.
 * 2. States: GREEN (0s delay) -> YELLOW (moderate delay) -> RED (high delay) -> GREEN
 * 3. Automatically cycles traffic signals every 3 seconds when "Auto Traffic" is active.
 * 4. Notifies listeners (UI and master app controller) to dynamically recalculate Dijkstra.
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
     * Advance signal state: GREEN -> YELLOW -> RED -> GREEN
     */
    static getNextState(currentState) {
        const state = (currentState || 'GREEN').toUpperCase();
        if (state === 'GREEN') return 'YELLOW';
        if (state === 'YELLOW') return 'RED';
        return 'GREEN';
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
            if (node.trafficSignalId && this.graph.roadNetwork.signals) {
                delete this.graph.roadNetwork.signals[node.trafficSignalId];
                this.graph.signals.delete(node.trafficSignalId);
            }
            node.trafficSignalId = null;
            this.notify({ type: 'removed', nodeId });
            return { action: 'removed', node };
        } else {
            node.trafficLight = true;
            node.trafficState = 'yellow';
            const sigId = `sig_${nodeId}`;
            node.trafficSignalId = sigId;

            const newSignal = {
                id: sigId,
                nodeId: nodeId,
                state: 'YELLOW',
                delays: { green: 0, yellow: 20, red: 60 }
            };

            if (!this.graph.roadNetwork.signals) {
                this.graph.roadNetwork.signals = {};
            }
            this.graph.roadNetwork.signals[sigId] = newSignal;
            this.graph.signals.set(sigId, newSignal);

            this.notify({ type: 'added', nodeId, signal: newSignal });
            return { action: 'added', node, signal: newSignal };
        }
    }

    /**
     * Switch state of a specific traffic light
     */
    switchLight(nodeId) {
        const node = this.graph.nodes.get(nodeId);
        if (!node || !node.trafficLight) return;

        const nextState = TrafficLightController.getNextState(node.trafficState);
        node.trafficState = nextState.toLowerCase();

        if (node.trafficSignalId && this.graph.roadNetwork.signals?.[node.trafficSignalId]) {
            this.graph.roadNetwork.signals[node.trafficSignalId].state = nextState;
        }

        this.notify({ type: 'state_changed', nodeId, state: nextState });
    }

    /**
     * Periodic 3-second tick: cycles all active traffic signals
     */
    cycleTick() {
        let changed = false;
        const updatedNodes = [];

        // Cycle through all defined signals in the network
        if (this.graph.roadNetwork.signals) {
            for (const [sigId, signal] of Object.entries(this.graph.roadNetwork.signals)) {
                const next = TrafficLightController.getNextState(signal.state);
                signal.state = next;

                const node = this.graph.nodes.get(signal.nodeId);
                if (node) {
                    node.trafficState = next.toLowerCase();
                    node.trafficLight = true;
                }

                changed = true;
                updatedNodes.push({ id: signal.nodeId, state: next, signalId: sigId });
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

if (typeof window !== 'undefined') {
    window.TrafficLightController = TrafficLightController;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TrafficLightController;
}
