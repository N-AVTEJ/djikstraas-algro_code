/**
 * ============================================================================
 * TRAFFIC SIGNAL ARCHITECTURE & CONTROLLER (js/traffic.js)
 * ============================================================================
 *
 * Requirements (Sections 13, 14, 15, 17, 18):
 * 1. Signals belong to REAL graph intersection nodes with >= 2 connected edges.
 * 2. Coordinates strictly derived from roadNetwork.nodes[signal.nodeId].
 * 3. Never placed on water, parks, or arbitrary coordinates.
 * 4. Signal delays: Green = 0s, Yellow = 10s, Red = 30s.
 * 5. 3-Second automated cycle updates signal states and notifies navigation controller.
 * 6. validateTrafficSignals() purges invalid signals from active network.
 */

class TrafficLightController {
    constructor(graph, onStateChange) {
        this.graph = graph;
        this.onStateChange = onStateChange; // callback(event)
        this.timer = null;
        this.isRunning = false;
        this.intervalMs = 3000; // 3 seconds standard
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
        console.log('[TRAFFIC] Automated 3-second traffic light cycle started');
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
        console.log('[TRAFFIC] Automated traffic light cycle stopped');
    }

    /**
     * Section 14: Add or remove a traffic signal at an intersection
     * Only permitted if node.type === "intersection" AND node.connectedEdges.length >= 2
     */
    toggleTrafficLight(nodeId) {
        const node = this.graph.roadNetwork.nodes[nodeId];
        if (!node) return null;

        if (node.trafficSignalId && this.graph.roadNetwork.signals[node.trafficSignalId]) {
            // Remove existing signal
            const sigId = node.trafficSignalId;
            delete this.graph.roadNetwork.signals[sigId];
            node.trafficSignalId = null;
            console.log(`[TRAFFIC] Signal removed at ${node.name} (${nodeId})`);
            this.notify({ type: 'removed', nodeId, signalId: sigId });
            return { action: 'removed', node };
        } else {
            // Validate before adding
            if (node.type !== "intersection" || !node.connectedEdges || node.connectedEdges.length < 2) {
                console.warn(`[TRAFFIC] Cannot place signal on node '${nodeId}': Must be an intersection with >= 2 connected road edges.`);
                return null;
            }

            const sigId = `sig_${nodeId}`;
            this.graph.roadNetwork.signals[sigId] = {
                id: sigId,
                nodeId: node.id,
                state: "GREEN",
                delays: { green: 0, yellow: 10, red: 30 }
            };
            node.trafficSignalId = sigId;
            console.log(`[TRAFFIC] Signal created at ${node.name} (${nodeId}) -> GREEN`);
            this.notify({ type: 'added', nodeId, signalId: sigId });
            return { action: 'added', node, signal: this.graph.roadNetwork.signals[sigId] };
        }
    }

    /**
     * Switch state of a specific traffic light manually
     * Cycle: GREEN -> YELLOW -> RED -> GREEN
     */
    switchLight(nodeId) {
        const node = this.graph.roadNetwork.nodes[nodeId];
        if (!node || !node.trafficSignalId) return;

        const signal = this.graph.roadNetwork.signals[node.trafficSignalId];
        if (!signal) return;

        const nextStates = {
            'GREEN': 'YELLOW',
            'YELLOW': 'RED',
            'RED': 'GREEN'
        };

        const oldState = signal.state;
        signal.state = nextStates[signal.state] || 'GREEN';

        console.log(`[TRAFFIC] Signal ${signal.id} at ${node.name} switched from ${oldState} to ${signal.state}`);
        this.notify({
            type: 'state_changed',
            nodeId,
            signalId: signal.id,
            state: signal.state
        });
    }

    /**
     * Section 18: Automated 3-second cycle tick
     * Advances all active signals and triggers dynamic reroute evaluation
     */
    cycleTick() {
        const signals = this.graph.roadNetwork.signals;
        const nextStates = {
            'GREEN': 'YELLOW',
            'YELLOW': 'RED',
            'RED': 'GREEN'
        };

        const updatedSignals = [];

        for (const [sigId, signal] of Object.entries(signals)) {
            signal.state = nextStates[signal.state] || 'GREEN';
            const node = this.graph.roadNetwork.nodes[signal.nodeId];
            updatedSignals.push({
                id: sigId,
                nodeId: signal.nodeId,
                nodeName: node ? node.name : signal.nodeId,
                state: signal.state
            });
        }

        if (updatedSignals.length > 0) {
            this.notify({
                type: 'cycle',
                updatedSignals
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
