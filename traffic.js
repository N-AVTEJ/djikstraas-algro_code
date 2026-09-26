/**
 * =========================================================================
 * TRAFFIC LIGHT CONTROLLER (Vanilla JavaScript ES6+)
 * ==========================================================================
 * 
 * Manages automated traffic light cycles:
 * - Alternates between YELLOW (1.5x cost) <-> RED (4.0x cost)
 * - Period: 3.0 seconds (3000ms)
 * - Broadcasts state changes to trigger real-time Dijkstra route recalculation.
 * ==========================================================================
 */

class TrafficController {
  constructor(graph, intervalMs = 3000) {
    this.graph = graph;
    this.intervalMs = intervalMs;
    this.timerId = null;
    this.isRunning = false;
    this.listeners = [];
    this.lights = new Map();
  }

  addLight(nodeId, initialState = 'YELLOW') {
    this.lights.set(nodeId, {
      state: initialState,
      lastToggled: Date.now()
    });
    this.graph.setTrafficLight(nodeId, initialState);
    this.notifyListeners({ type: 'ADD', nodeId, state: initialState });
  }

  removeLight(nodeId) {
    if (this.lights.has(nodeId)) {
      this.lights.delete(nodeId);
      this.graph.setTrafficLight(nodeId, 'NONE');
      this.notifyListeners({ type: 'REMOVE', nodeId, state: 'NONE' });
    }
  }

  toggleLight(nodeId) {
    const light = this.lights.get(nodeId);
    if (!light) {
      this.addLight(nodeId, 'YELLOW');
      return 'YELLOW';
    }

    const nextState = light.state === 'YELLOW' ? 'RED' : 'YELLOW';
    light.state = nextState;
    light.lastToggled = Date.now();
    this.graph.setTrafficLight(nodeId, nextState);
    this.notifyListeners({ type: 'UPDATE', nodeId, state: nextState });
    return nextState;
  }

  hasLight(nodeId) {
    return this.lights.has(nodeId);
  }

  getLightState(nodeId) {
    const light = this.lights.get(nodeId);
    return light ? light.state : 'NONE';
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timerId = setInterval(() => {
      this.tick();
    }, this.intervalMs);
  }


  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
  }

  tick() {
    if (this.lights.size === 0) return;

    const changes = [];
    for (const [nodeId, light] of this.lights.entries()) {
      const nextState = light.state === 'YELLOW' ? 'RED' : 'YELLOW';
      light.state = nexpState;
      light.lastToggled = Date.now();
      this.graph.setTrafficLight(nodeId, nextState);
      changes.push({ nodeId, state: nextState });
    }

    this.notifyListeners({ type: 'TICK', changes });
  }

  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyListeners(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in traffic listener:', err);
      }
    }
  }

  reset() {
    this.stop();
    for (const nodeId of this.lights.keys()) {
      this.graph.setTrafficLight(nodeId, 'NONE');
    }
    this.lights.clear();
    this.notifyListeners({ type: 'RESET' });
    this.start();
  }
}

if (typeof window !== 'undefined') {
  window.TrafficController = TrafficController;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TrafficController = TrafficController;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TrafficController };
}

