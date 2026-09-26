/**
 * ============================================================================
 * DIJKSTRA\'S ALGORITHM IMPLEMENTATION (Vanilla JavaScript ES6+)
 * ============================================================================
 * 
 * Educational Shortest-Path Graph Solver for Interactive City Navigation.
 * 
 * Conceptual Weights & Cost Multipliers:
 * - Normal Road: 1.0 (Base Distance * 1.0)
 * - Shortcut / Express Road: 0.5 (Base Distance * 0.5)
 * - Yellow Traffic Light (at junction): 1.5 multiplier
 * - Red Traffic Light (at junction): 4.0 multiplier
 * - Blocked Road / Obstacle / Wall: Infinity (Impassable, skipped by Dijkstra)
 * 
 * Time Complexity: O((V + E) log V) with Priority Queue or O(V^2) with Min-Search.
 * Space Complexity: O(V + E) for Graph adjacency list, distances map, and predecessor tree.
 * ============================================================================
 */

class Graph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.adjacencyList = new Map();
  }

  addNode(id, name, lat, lng, trafficLight = 'NONE', isBlocked = false) {
    this.nodes.set(id, {
      id,
      name,
      lat,
      lng,
      trafficLight, // 'NONE' | 'YELLOW' | 'RED'
      isBlocked: !!isBlocked
    });

    if (!this.adjacencyList.has(id)) {
      this.adjacencyList.set(id, []);
    }
  }

  addEdge(id, from, to, roadType = 'NORMAL', isBlocked = false, bidirectional = true) {
    const nodeA = this.nodes.get(from);
    const nodeB = this.nodes.get(to);

    if (!nodeA || !nodeB) {
      console.warn('Cannot add edge ' + id + ': nodes ' + from + ' or ' + to + ' not found.');
      return;
    }

    const distance = Graph.calculateHaversineDistance(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng);

    const edge = {
      id,
      from,
      to,
      baseDistance: distance,
      roadType, // 'NORMAL' | 'SHORTCUT'
      isBlocked: !!isBlocked,
      bidirectional
    };

    this.edges.set(id, edge);

    this.adjacencyList.get(from).push({
      neighborId: to,
      edgeId: id,
      baseDistance: distance,
      roadType,
      isBlocked: !!isBlocked
    });

    if (bidirectional) {
      this.adjacencyList.get(to).push({
        neighborId: from,
        edgeId: id,
        baseDistance: distance,
        roadType,
        isBlocked: !!isBlocked
      });
    }
  }

  removeEdge(id) {
    const edge = this.edges.get(id);
    if (!edge) return;

    this.edges.delete(id);

    const listFrom = this.adjacencyList.get(edge.from);
    if (listFrom) {
      this.adjacencyList.set(edge.from, listFrom.filter(e => e.edgeId !== id));
    }

    if (edge.bidirectional) {
      const listTo = this.adjacencyList.get(edge.to);
      if (listTo) {
        this.adjacencyList.set(edge.to, listTo.filter(e => e.edgeId !== id));
      }
    }
  }

  setNodeBlocked(nodeId, isBlocked) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.isBlocked = isBlocked;
    }
  }

  setEdgeBlocked(edgeId, isBlocked) {
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.isBlocked = isBlocked;
      for (const [nodeId, neighbors] of this.adjacencyList.entries()) {
        for (const neighbor of neighbors) {
          if (neighbor.edgeId === edgeId) {
            neighbor.isBlocked = isBlocked;
          }
        }
      }
    }
  }

  setTrafficLight(nodeId, state) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.trafficLight = state;
    }
  }

  setRoadType(edgeId, roadType) {
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.roadType = roadType;
      for (const [nodeId, neighbors] of this.adjacencyList.entries()) {
        for (const neighbor of neighbors) {
          if (neighbor.edgeId === edgeId) {
            neighbor.roadType = roadType;
          }
        }
      }
    }
  }

  findNearestNode(lat, lng, maxDistanceMeters = 5000) {
    let nearestNode = null;
    let minDistance = Infinity;

    for (const node of this.nodes.values()) {
      const dist = Graph.calculateHaversineDistance(lat, lng, node.lat, node.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestNode = node;
      }
    }

    return (minDistance <= maxDistanceMeters) ? nearestNode : null;
  }

  findNearestEdge(lat, lng, maxDistanceMeters = 300) {
    let nearestEdge = null;
    let minDistance = Infinity;

    for (const edge of this.edges.values()) {
      const nodeA = this.nodes.get(edge.from);
      const nodeB = this.nodes.get(edge.to);
      if (!nodeA || !nodeB) continue;

      const dist = Graph.distanceToSegment(lat, lng, nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestEdge = edge;
      }
    }

    return (minDistance <= maxDistanceMeters) ? nearestEdge : null;
  }

  findEdgeBetween(nodeAId, nodeBId) {
    for (const edge of this.edges.values()) {
      if ((edge.from === nodeAId && edge.to === nodeBId) ||
          (edge.bidirectional && edge.from === nodeBId && edge.to === nodeAId)) {
        return edge;
      }
    }
    return null;
  }

  calculateEdgeWeight(edge, targetNode) {
    if (edge.isBlocked || targetNode.isBlocked) {
      return Infinity;
    }

    const baseDistance = edge.baseDistance;

    let roadMultiplier = 1.0;
    if (edge.roadType === 'SHORTCUT') {
      roadMultiplier = 0.5;
    }

    let trafficMultiplier = 1.0;
    if (targetNode.trafficLight === 'YELLOW') {
      trafficMultiplier = 1.5;
    } else if (targetNode.trafficLight === 'RED') {
      trafficMultiplier = 4.0;
    }

    return baseDistance * roadMultiplier * trafficMultiplier;
  }

  static calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static distanceToSegment(pLat, pLng, lat1, lng1, lat2, lng2) {
    const x = pLng, y = pLat;
    const x1 = lng1, y1 = lat1;
    const x2 = lng2, y2 = lat2;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    return Graph.calculateHaversineDistance(pLat, pLng, yy, xx);
  }
}

class DijkstraSolver {
  static solve(graph, startNodeId, endNodeId) {
    const steps = [];
    const distances = new Map();
    const previousNode = new Map();
    const previousEdge = new Map();
    const visited = new Set();
    const unvisited = new Set();

    const startNode = graph.nodes.get(startNodeId);
    const endNode = graph.nodes.get(endNodeId);

    if (!startNode || !endNode) {
      return {
        success: false,
        message: 'Start or Destination junction not found in graph.',
        pathNodeIds: [],
        pathNodes: [],
        pathEdgeIds: [],
        totalCost: Infinity,
        totalDistance: 0,
        stats: { visitedCount: 0, trafficLightsEncountered: 0, shortcutsUsed: 0, blockedAvoided: 0 },
        steps: []
      };
    }

    if (startNode.isBlocked || endNode.isBlocked) {
      return {
        success: false,
        message: 'Start or Destination junction is currently blocked by an obstacle.',
        pathNodeIds: [],
        pathNodes: [],
        pathEdgeIds: [],
        totalCost: Infinity,
        totalDistance: 0,
        stats: { visitedCount: 0, trafficLightsEncountered: 0, shortcutsUsed: 0, blockedAvoided: 0 },
        steps: []
      };
    }

    for (const nodeId of graph.nodes.keys()) {
      distances.set(nodeId, Infinity);
      previousNode.set(nodeId, null);
      previousEdge.set(nodeId, null);
      unvisited.add(nodeId);
    }

    distances.set(startNodeId, 0);

    const snapshotDistances = () => {
      const snap = {};
      for (const [id, dist] of distances.entries()) {
        snap[id] = dist;
      }
      return snap;
    };

    steps.push({
      type: 'INIT',
      currentNodeId: startNodeId,
      currentDistance: 0,
      unvisitedSet: Array.from(unvisited),
      visitedSet: [],
      distancesSnapshot: snapshotDistances(),
      log: 'Initialized graph. Start node [' + (startNode.name || startNodeId) + '] set to cost 0.0.'
    });

    let destinationReached = false;

    while (unvisited.size > 0) {
      let currentId = null;
      let minDistance = Infinity;

      for (const nodeId of unvisited) {
        const dist = distances.get(nodeId);
        if (dist < minDistance) {
          minDistance = dist;
          currentId = nodeId;
        }
      }

      if (currentId === null || minDistance === Infinity) {
        steps.push({
          type: 'NO_PATH',
          currentNodeId: null,
          currentDistance: Infinity,
          unvisitedSet: Array.from(unvisited),
          visitedSet: Array.from(visited),
          distancesSnapshot: snapshotDistances(),
          log: 'No further reachable unvisited nodes. Exploration ended.'
        });
        break;
      }

      const currentNode = graph.nodes.get(currentId);

      unvisited.delete(currentId);
      visited.add(currentId);

      steps.push({
        type: 'VISIT',
        currentNodeId: currentId,
        currentDistance: minDistance,
        unvisitedSet: Array.from(unvisited),
        visitedSet: Array.from(visited),
        distancesSnapshot: snapshotDistances(),
        log: 'Visiting [' + (currentNode.name || currentId) + '] with cumulative cost ' + minDistance.toFixed(1) + '.'
      });

      if (currentId === endNodeId) {
        destinationReached = true;
        steps.push({
          type: 'COMPLETE',
          currentNodeId: currentId,
          currentDistance: minDistance,
          unvisitedSet: Array.from(unvisited),
          visitedSet: Array.from(visited),
          distancesSnapshot: snapshotDistances(),
          log: 'Destination [' + (endNode.name || endNodeId) + '] reached with optimal cost ' + minDistance.toFixed(1) + '!'
        });
        break;
      }

      const neighbors = graph.adjacencyList.get(currentId) || [];

      for (const neighborInfo of neighbors) {
        const neighborId = neighborInfo.neighborId;

        if (visited.has(neighborId)) {
          continue;
        }

        const neighborNode = graph.nodes.get(neighborId);
        const edge = graph.edges.get(neighborInfo.edgeId);

        if (!neighborNode || !edge) continue;

        const segmentCost = graph.calculateEdgeWeight(edge, neighborNode);

        if (segmentCost === Infinity) {
          steps.push({
            type: 'RELAX',
            currentNodeId: currentId,
            evaluatedNeighborId: neighborId,
            edgeId: edge.id,
            segmentCost: Infinity,
            updated: false,
            unvisitedSet: Array.from(unvisited),
            visitedSet: Array.from(visited),
            distancesSnapshot: snapshotDistances(),
            log: 'Edge to [' + (neighborNode.name || neighborId) + '] is blocked (Obstacle). Skipped.'
          });
          continue;
        }

        const tentativeDistance = minDistance + segmentCost;
        const currentNeighborDistance = distances.get(neighborId);

        let updated = false;
        if (tentativeDistance < currentNeighborDistance) {
          distances.set(neighborId, tentativeDistance);
          previousNode.set(neighborId, currentId);
          previousEdge.set(neighborId, edge.id);
          updated = true;
        }

        steps.push({
          type: 'RELAX',
          currentNodeId: currentId,
          evaluatedNeighborId: neighborId,
          edgeId: edge.id,
          segmentCost,
          tentativeDistance,
          updated,
          unvisitedSet: Array.from(unvisited),
          visitedSet: Array.from(visited),
          distancesSnapshot: snapshotDistances(),
          log: updated
            ? 'Relaxed edge to [' + (neighborNode.name || neighborId) + ']: new best cost ' + tentativeDistance.toFixed(1) + ' (was ' + (currentNeighborDistance === Infinity ? '∞' : currentNeighborDistance.toFixed(1)) + ').'
            : 'Checked edge to [' + (neighborNode.name || neighborId) + ']: cost ' + tentativeDistance.toFixed(1) + ' >= current ' + currentNeighborDistance.toFixed(1) + '.'
        });
      }
    }

    if (!destinationReached || distances.get(endNodeId) === Infinity) {
      return {
        success: false,
        message: 'No valid route exists between the selected points.',
        pathNodeIds: [],
        pathNodes: [],
        pathEdgeIds: [],
        totalCost: Infinity,
        totalDistance: 0,
        stats: {
          visitedCount: visited.size,
          trafficLightsEncountered: 0,
          shortcutsUsed: 0,
          blockedAvoided: 0
        },
        steps
      };
    }

    const pathNodeIds = [];
    const pathEdgeIds = [];
    let curr = endNodeId;

    while (curr !== null) {
      pathNodeIds.unshift(curr);
      const prevE = previousEdge.get(curr);
      if (prevE) {
        pathEdgeIds.unshift(prevE);
      }
      curr = previousNode.get(curr);
    }

    const pathNodes = pathNodeIds.map(id => graph.nodes.get(id));

    let totalDistance = 0;
    let trafficLightsEncountered = 0;
    let shortcutsUsed = 0;

    for (let i = 0; i < pathNodes.length; i++) {
      const node = pathNodes[i];
      if (node.trafficLight === 'YELLOW' || node.trafficLight === 'RED') {
        trafficLightsEncountered++;
      }
    }

    for (const edgeId of pathEdgeIds) {
      const edge = graph.edges.get(edgeId);
      if (edge) {
        totalDistance += edge.baseDistance;
        if (edge.roadType === 'SHORTCUT') {
          shortcutsUsed++;
        }
      }
    }

    return {
      success: true,
      pathNodeIds,
      pathNodes,
      pathEdgeIds,
      totalCost: distances.get(endNodeId),
      totalDistance: Math.round(totalDistance),
      stats: {
        visitedCount: visited.size,
        trafficLightsEncountered,
        shortcutsUsed,
        blockedAvoided: 0
      },
      steps
    };
  }
}

if (typeof window !== 'undefined') {
  window.Graph = Graph;
  window.DijkstraSolver = DijkstraSolver;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Graph = Graph;
  globalThis.DijkstraSolver = DijkstraSolver;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Graph, DijkstraSolver };
}

