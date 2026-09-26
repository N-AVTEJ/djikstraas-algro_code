/**
 * ============================================================================
 * MAIN APPLICATION CONTROLLER (Vanilla JavaScript ES6+)
 * ============================================================================
 * 
 * Orchestrates:
 * - Hyderabad Road Graph initialization (28+ landmark junctions & 40+ roads)
 * - Interactive Tool selection (Select, Start, End, Wall, Traffic Light, Shortcut)
 * - Dijkstra shortest-path calculations and auto-recalculation
 * - Real-time traffic light cycles (1.5x Yellow <-> 4.0x Red every 3s)
 * - Vehicle animation & mid-transit dynamic rerouting
 * - Step-by-step algorithm visualizer
 * - Real-time stats dashboard and live execution log
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    activeTool: 'SELECT', // 'SELECT' | 'START' | 'END' | 'WALL' | 'TRAFFIC' | 'SHORTCUT'
    startNodeId: 'cyber_towers',
    endNodeId: 'jubilee_rd36',
    shortcutSourceNodeId: null,
    autoRecalculate: true,
    showGraphOverlay: true,
    showLabels: false,
    
    // Algorithm visualizer state
    visualizerActive: false,
    visualizerSteps: [],
    visualizerStepIndex: 0,
    visualizerTimerId: null,
    visualizerSpeedMs: 400,

    // Last Dijkstra result
    lastResult: null
  };

  // 1. Initialize Graph, Map, Traffic and Vehicle
  const graph = new Graph();
  buildHyderabadRoadNetwork(graph);

  const cityMap = new CityMapVisualizer('map', [17.4390, 78.3810], 14);
  const traffic = new TrafficController(graph, 3000);
  const vehicle = new VehicleAnimator(cityMap.map);

  // Set initial preset traffic lights
  traffic.addLight('mindspace_junc', 'YELLOW');
  traffic.addLight('inorbit_mall', 'RED');
  traffic.addLight('madhapur_100ft', 'YELLOW');
  traffic.addLight('ikea_junc', 'RED');

  traffic.start();

  // Initial render
  cityMap.renderRoadNetwork(graph);
  cityMap.renderJunctionNodes(graph, handleNodeClick);
  updateTrafficMarkersOnMap();

  // Set default start & end
  const initialStartNode = graph.nodes.get(state.startNodeId);
  const initialEndNode = graph.nodes.get(state.endNodeId);
  if (initialStartNode) cityMap.setStartMarker(initialStartNode);
  if (initialEndNode) cityMap.setEndMarker(initialEndNode);

  // Run initial route calculation
  calculateAndRenderRoute(false);

  // 2. Event Listeners & UI Binding
  bindToolbarButtons();
  bindActionButtons();
  bindVisualizerControls();
  bindVehicleControls();
  bindMapClickEvents();

  // Subscribe to traffic changes
  traffic.onChange((event) => {
    updateTrafficMarkersOnMap();
    cityMap.renderRoadNetwork(graph);
    cityMap.renderJunctionNodes(graph, handleNodeClick);

    if (state.autoRecalculate && state.startNodeId && state.endNodeId) {
      const oldCost = state.lastResult ? state.lastResult.totalCost : Infinity;
      calculateAndRenderRoute(true); // Retain vehicle transit progress
      const newCost = state.lastResult ? state.lastResult.totalCost : Infinity;

      if (oldCost !== newCost && state.lastResult && state.lastResult.success) {
        logMessage(`?? Traffic state updated. Route dynamically recalculated (Cost: ${oldCost.toFixed(1)} ? ${newCost.toFixed(1)}).`, 'traffic');
      }
    }
  });

  // Vehicle progress listener for status badge
  vehicle.onStatusChange((evt) => {
    const statusEl = document.getElementById('vehicle-status-badge');
    if (statusEl) {
      statusEl.textContent = evt.status;
      statusEl.className = `status-pill status-${evt.status.toLowerCase()}`;
    }
  });

  // ==========================================================================
  // ROAD NETWORK GENERATION (HYDERABAD)
  // ==========================================================================
  function buildHyderabadRoadNetwork(g) {
    const junctions = [
      { id: 'cyber_towers', name: 'Cyber Towers Junction', lat: 17.4504, lng: 78.3809 },
      { id: 'hitec_metro', name: 'HITEC City Metro', lat: 17.4485, lng: 78.3775 },
      { id: 'mindspace_junc', name: 'Mindspace Junction', lat: 17.4426, lng: 78.3792 },
      { id: 'inorbit_mall', name: 'Inorbit Mall / Durgam View', lat: 17.4348, lng: 78.3862 },
      { id: 'cable_bridge', name: 'Durgam Cheruvu Cable Bridge', lat: 17.4359, lng: 78.3970 },
      { id: 'jubilee_rd36', name: 'Jubilee Hills Road 36', lat: 17.4380, lng: 78.4095 },
      { id: 'madhapur_100ft', name: 'Madhapur 100ft Road', lat: 17.4470, lng: 78.3910 },
      { id: 'knowledge_city', name: 'Knowledge City Gate', lat: 17.4360, lng: 78.3750 },
      { id: 'ikea_junc', name: 'IKEA Junction', lat: 17.4345, lng: 78.3702 },
      { id: 'biodiversity_junc', name: 'Bio-Diversity Junction', lat: 17.4265, lng: 78.3725 },
      { id: 'gachibowli_flyover', name: 'Gachibowli Flyover', lat: 17.4200, lng: 78.3650 },
      { id: 'dlf_cybercity', name: 'DLF Cybercity', lat: 17.4290, lng: 78.3580 },
      { id: 'financial_dist', name: 'Financial District Circle', lat: 17.4180, lng: 78.3480 },
      { id: 'kondapur_junc', name: 'Kondapur Junction', lat: 17.4620, lng: 78.3680 },
      { id: 'kothaguda_x_roads', name: 'Kothaguda X Roads', lat: 17.4580, lng: 78.3620 },
      { id: 'botanical_garden', name: 'Botanical Garden Junction', lat: 17.4480, lng: 78.3600 },
      { id: 'hafeezpet_flyover', name: 'Hafeezpet Road', lat: 17.4720, lng: 78.3550 },
      { id: 'radisson_junc', name: 'Radisson Hitec Junction', lat: 17.4225, lng: 78.3585 },
      { id: 'durgam_lake_south', name: 'Durgam Cheruvu South Prom', lat: 17.4285, lng: 78.3920 },
      { id: 'kavuri_hills', name: 'Kavuri Hills Junction', lat: 17.4450, lng: 78.4015 },
      { id: 'jubilee_checkpost', name: 'Jubilee Hills Checkpost', lat: 17.4295, lng: 78.4125 },
      { id: 'film_nagar', name: 'Film Nagar Cultural Center', lat: 17.4180, lng: 78.4080 },
      { id: 'nanakramguda_rotary', name: 'Nanakramguda Rotary', lat: 17.4120, lng: 78.3530 },
      { id: 'wipro_circle', name: 'Wipro Circle Gachibowli', lat: 17.4150, lng: 78.3410 },
      { id: 'wave_rock', name: 'WaveRock SEZ', lat: 17.4080, lng: 78.3430 },
      { id: 'silpa_layout_flyover', name: 'Silpa Layout Flyover', lat: 17.4230, lng: 78.3790 },
      { id: 't_hub', name: 'T-Hub Phase 2 Knowledge City', lat: 17.4390, lng: 78.3715 },
      { id: 'my_home_bhooja', name: 'My Home Bhooja Skyway', lat: 17.4385, lng: 78.3840 }
    ];

    for (const j of junctions) {
      g.addNode(j.id, j.name, j.lat, j.lng);
    }

    const roads = [
      // Core HITEC Corridor
      { id: 'e_cyber_hitec', from: 'cyber_towers', to: 'hitec_metro', type: 'NORMAL' },
      { id: 'e_cyber_mindspace', from: 'cyber_towers', to: 'mindspace_junc', type: 'NORMAL' },
      { id: 'e_cyber_madhapur', from: 'cyber_towers', to: 'madhapur_100ft', type: 'NORMAL' },
      { id: 'e_hitec_kothaguda', from: 'hitec_metro', to: 'kothaguda_x_roads', type: 'NORMAL' },
      { id: 'e_hitec_thub', from: 'hitec_metro', to: 't_hub', type: 'NORMAL' },
      
      // Mindspace & Knowledge City
      { id: 'e_mindspace_bhooja', from: 'mindspace_junc', to: 'my_home_bhooja', type: 'NORMAL' },
      { id: 'e_mindspace_inorbit', from: 'mindspace_junc', to: 'inorbit_mall', type: 'NORMAL' },
      { id: 'e_mindspace_knowledge', from: 'mindspace_junc', to: 'knowledge_city', type: 'NORMAL' },
      { id: 'e_thub_knowledge', from: 't_hub', to: 'knowledge_city', type: 'SHORTCUT' },
      { id: 'e_knowledge_ikea', from: 'knowledge_city', to: 'ikea_junc', type: 'NORMAL' },
      { id: 'e_ikea_biodiversity', from: 'ikea_junc', to: 'biodiversity_junc', type: 'NORMAL' },
      
      // Inorbit & Cable Bridge to Jubilee Hills
      { id: 'e_bhooja_inorbit', from: 'my_home_bhooja', to: 'inorbit_mall', type: 'NORMAL' },
      { id: 'e_inorbit_cable', from: 'inorbit_mall', to: 'cable_bridge', type: 'SHORTCUT' },
      { id: 'e_cable_jubilee', from: 'cable_bridge', to: 'jubilee_rd36', type: 'NORMAL' },
      { id: 'e_inorbit_durgamsouth', from: 'inorbit_mall', to: 'durgam_lake_south', type: 'NORMAL' },
      { id: 'e_durgamsouth_jubileecheck', from: 'durgam_lake_south', to: 'jubilee_checkpost', type: 'NORMAL' },
      { id: 'e_jubilee_checkpost', from: 'jubilee_rd36', to: 'jubilee_checkpost', type: 'NORMAL' },
      { id: 'e_jubileecheck_filmnagar', from: 'jubilee_checkpost', to: 'film_nagar', type: 'NORMAL' },
      
      // Madhapur & Kavuri Hills Arterial
      { id: 'e_madhapur_kavuri', from: 'madhapur_100ft', to: 'kavuri_hills', type: 'NORMAL' },
      { id: 'e_kavuri_jubilee', from: 'kavuri_hills', to: 'jubilee_rd36', type: 'NORMAL' },
      { id: 'e_bhooja_madhapur', from: 'my_home_bhooja', to: 'madhapur_100ft', type: 'NORMAL' },

      // Gachibowli & Bio-Diversity Southern Ring
      { id: 'e_biodiversity_silpa', from: 'biodiversity_junc', to: 'silpa_layout_flyover', type: 'SHORTCUT' },
      { id: 'e_silpa_durgamsouth', from: 'silpa_layout_flyover', to: 'durgam_lake_south', type: 'NORMAL' },
      { id: 'e_biodiversity_gachibowli', from: 'biodiversity_junc', to: 'gachibowli_flyover', type: 'NORMAL' },
      { id: 'e_gachibowli_dlf', from: 'gachibowli_flyover', to: 'dlf_cybercity', type: 'NORMAL' },
      { id: 'e_gachibowli_radisson', from: 'gachibowli_flyover', to: 'radisson_junc', type: 'NORMAL' },
      { id: 'e_gachibowli_nanakram', from: 'gachibowli_flyover', to: 'nanakramguda_rotary', type: 'NORMAL' },

      // Financial District & Wipro Circle
      { id: 'e_dlf_financial', from: 'dlf_cybercity', to: 'financial_dist', type: 'NORMAL' },
      { id: 'e_financial_wipro', from: 'financial_dist', to: 'wipro_circle', type: 'NORMAL' },
      { id: 'e_wipro_waverock', from: 'wipro_circle', to: 'wave_rock', type: 'NORMAL' },
      { id: 'e_nanakram_waverock', from: 'nanakramguda_rotary', to: 'wave_rock', type: 'NORMAL' },
      { id: 'e_nanakram_financial', from: 'nanakramguda_rotary', to: 'financial_dist', type: 'SHORTCUT' },

      // Botanical Garden & Northern Bypass
      { id: 'e_dlf_botanical', from: 'dlf_cybercity', to: 'botanical_garden', type: 'NORMAL' },
      { id: 'e_botanical_kothaguda', from: 'botanical_garden', to: 'kothaguda_x_roads', type: 'NORMAL' },
      { id: 'e_kothaguda_kondapur', from: 'kothaguda_x_roads', to: 'kondapur_junc', type: 'NORMAL' },
      { id: 'e_kondapur_cyber', from: 'kondapur_junc', to: 'cyber_towers', type: 'NORMAL' },
      { id: 'e_kondapur_hafeezpet', from: 'kondapur_junc', to: 'hafeezpet_flyover', type: 'NORMAL' },
      { id: 'e_hafeezpet_kothaguda', from: 'hafeezpet_flyover', to: 'kothaguda_x_roads', type: 'NORMAL' },
      { id: 'e_botanical_thub', from: 'botanical_garden', to: 't_hub', type: 'SHORTCUT' }
    ];

    for (const r of roads) {
      g.addEdge(r.id, r.from, r.to, r.type, false, true);
    }
  }

  // ==========================================================================
  // TOOLBAR & TOOL SELECTION
  // ==========================================================================
  function bindToolbarButtons() {
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        toolButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeTool = btn.dataset.tool;
        state.shortcutSourceNodeId = null;
        updateToolInstruction();
      });
    });

    const autoRecalcCheck = document.getElementById('chk-auto-recalc');
    if (autoRecalcCheck) {
      autoRecalcCheck.addEventListener('change', (e) => {
        state.autoRecalculate = e.target.checked;
      });
    }

    const showGraphCheck = document.getElementById('chk-show-graph');
    if (showGraphCheck) {
      showGraphCheck.addEventListener('change', (e) => {
        state.showGraphOverlay = e.target.checked;
        cityMap.showGraphOverlay = e.target.checked;
        cityMap.renderJunctionNodes(graph, handleNodeClick);
      });
    }

    const showLabelsCheck = document.getElementById('chk-show-labels');
    if (showLabelsCheck) {
      showLabelsCheck.addEventListener('change', (e) => {
        state.showLabels = e.target.checked;
        cityMap.showJunctionLabels = e.target.checked;
        cityMap.renderJunctionNodes(graph, handleNodeClick);
      });
    }
  }

  function updateToolInstruction() {
    const hintEl = document.getElementById('tool-hint-text');
    if (!hintEl) return;

    switch (state.activeTool) {
      case 'SELECT':
        hintEl.textContent = '?? Click any junction or road on the map to inspect details.';
        break;
      case 'START':
        hintEl.textContent = '?? Click any junction or location to set the START point.';
        break;
      case 'END':
        hintEl.textContent = '?? Click any junction or location to set the DESTINATION.';
        break;
      case 'WALL':
        hintEl.textContent = '?? Click any junction or road to toggle an OBSTACLE (Weight = ?).';
        break;
      case 'TRAFFIC':
        hintEl.textContent = '?? Click any junction to place / toggle a TRAFFIC LIGHT (Cycles Yellow ? Red every 3s).';
        break;
      case 'SHORTCUT':
        hintEl.textContent = state.shortcutSourceNodeId
          ? `?? Select the 2nd junction to connect with [${graph.nodes.get(state.shortcutSourceNodeId).name}]`
          : '?? Click the 1st junction to create / toggle a SHORTCUT road (Cost = 0.5x).';
        break;
    }
  }

  // ==========================================================================
  // ACTION BUTTONS
  // ==========================================================================
  function bindActionButtons() {
    document.getElementById('btn-run-dijkstra').addEventListener('click', () => {
      calculateAndRenderRoute(false);
    });

    document.getElementById('btn-recalculate').addEventListener('click', () => {
      calculateAndRenderRoute(true);
    });

    document.getElementById('btn-clear-route').addEventListener('click', () => {
      cityMap.clearRoute();
      vehicle.clear();
      resetStats();
      logMessage('Route cleared from map.', 'info');
    });

    document.getElementById('btn-reset-map').addEventListener('click', () => {
      resetEverything();
    });
  }

  // ==========================================================================
  // MAP CLICK & INTERACTION HANDLER
  // ==========================================================================
  function bindMapClickEvents() {
    cityMap.map.on('click', (e) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;

      const nearestNode = graph.findNearestNode(lat, lng, 1200);

      if (nearestNode) {
        handleNodeClick(nearestNode);
      } else {
        logMessage(`Clicked coordinate (${lat.toFixed(4)}, ${lng.toFixed(4)}) - no junction within 1.2km.`, 'info');
      }
    });
  }

  function handleNodeClick(node) {
    if (!node) return;

    switch (state.activeTool) {
      case 'SELECT':
        displayNodeDetails(node);
        break;

      case 'START':
        state.startNodeId = node.id;
        cityMap.setStartMarker(node);
        logMessage(`?? Start point set to [${node.name}].`, 'success');
        if (state.autoRecalculate) calculateAndRenderRoute(false);
        break;

      case 'END':
        state.endNodeId = node.id;
        cityMap.setEndMarker(node);
        logMessage(`?? Destination set to [${node.name}].`, 'success');
        if (state.autoRecalculate) calculateAndRenderRoute(false);
        break;

      case 'WALL':
        const newBlocked = !node.isBlocked;
        graph.setNodeBlocked(node.id, newBlocked);
        cityMap.renderRoadNetwork(graph);
        cityMap.renderJunctionNodes(graph, handleNodeClick);
        logMessage(newBlocked
          ? `?? Obstacle placed at [${node.name}]. Node is now impassable (Weight: ?).`
          : `?? Obstacle removed from [${node.name}]. Node is open.`,
          newBlocked ? 'warning' : 'info'
        );
        if (state.autoRecalculate) calculateAndRenderRoute(true);
        break;

      case 'TRAFFIC':
        if (traffic.hasLight(node.id)) {
          const newState = traffic.toggleLight(node.id);
          logMessage(`?? Toggled traffic light at [${node.name}] to ${newState} (${newState === 'RED' ? '4.0x' : '1.5x'} cost).`, 'traffic');
        } else {
          traffic.addLight(node.id, 'YELLOW');
          logMessage(`?? Added new traffic light at [${node.name}] (YELLOW: 1.5x cost).`, 'traffic');
        }
        updateTrafficMarkersOnMap();
        cityMap.renderJunctionNodes(graph, handleNodeClick);
        if (state.autoRecalculate) calculateAndRenderRoute(true);
        break;

      case 'SHORTCUT':
        if (!state.shortcutSourceNodeId) {
          state.shortcutSourceNodeId = node.id;
          updateToolInstruction();
          logMessage(`?? Selected 1st junction [${node.name}]. Now click 2nd junction to create shortcut.`, 'info');
        } else {
          if (state.shortcutSourceNodeId === node.id) {
            logMessage('Cannot create shortcut to the same junction.', 'warning');
            state.shortcutSourceNodeId = null;
            updateToolInstruction();
            return;
          }

          const nodeAId = state.shortcutSourceNodeId;
          const nodeBId = node.id;
          state.shortcutSourceNodeId = null;
          updateToolInstruction();

          const existingEdge = graph.findEdgeBetween(nodeAId, nodeBId);
          if (existingEdge) {
            const nextType = existingEdge.roadType === 'SHORTCUT' ? 'NORMAL' : 'SHORTCUT';
            graph.setRoadType(existingEdge.id, nextType);
            logMessage(`?? Converted road [${graph.nodes.get(nodeAId).name} ? ${node.name}] to ${nextType} (Cost: ${nextType === 'SHORTCUT' ? '0.5x' : '1.0x'}).`, 'success');
          } else {
            const newEdgeId = `shortcut_${nodeAId}_${nodeBId}`;
            graph.addEdge(newEdgeId, nodeAId, nodeBId, 'SHORTCUT', false, true);
            logMessage(`?? Created new Express Shortcut road between [${graph.nodes.get(nodeAId).name}] and [${node.name}] (Cost: 0.5x).`, 'success');
          }

          cityMap.renderRoadNetwork(graph);
          cityMap.renderJunctionNodes(graph, handleNodeClick);
          if (state.autoRecalculate) calculateAndRenderRoute(true);
        }
        break;
    }
  }

  function displayNodeDetails(node) {
    let trafficState = traffic.getLightState(node.id);
    let trafficLabel = trafficState === 'NONE' ? 'None' : `${trafficState} (${trafficState === 'RED' ? '4.0x' : '1.5x'} cost)`;
    let status = node.isBlocked ? 'Blocked (Obstacle)' : 'Open';

    const neighbors = graph.adjacencyList.get(node.id) || [];
    const connectedNames = neighbors.map(n => graph.nodes.get(n.neighborId).name).join(', ');

    logMessage(`?? [${node.name}] | Status: ${status} | Traffic: ${trafficLabel} | Connected to: ${connectedNames}`, 'info');
  }

  function updateTrafficMarkersOnMap() {
    for (const node of graph.nodes.values()) {
      const state = traffic.getLightState(node.id);
      cityMap.updateTrafficMarker(node, state);
    }
  }

  // ==========================================================================
  // DIJKSTRA CALCULATION & RENDERING
  // ==========================================================================
  function calculateAndRenderRoute(retainVehicleProgress = false) {
    if (!state.startNodeId || !state.endNodeId) {
      updateRouteStatusUI('SELECT_POINTS', 'Please select both Start and Destination points.');
      return;
    }

    if (state.startNodeId === state.endNodeId) {
      updateRouteStatusUI('SAME_POINTS', 'Start and Destination are the same junction.');
      cityMap.clearRoute();
      vehicle.clear();
      return;
    }

    updateRouteStatusUI('CALCULATING', 'Executing Dijkstra shortest-path algorithm...');

    const t0 = performance.now();
    const result = DijkstraSolver.solve(graph, state.startNodeId, state.endNodeId);
    const t1 = performance.now();
    const calcTimeMs = (t1 - t0).toFixed(2);

    state.lastResult = result;
    state.visualizerSteps = result.steps || [];

    if (!result.success) {
      updateRouteStatusUI('NO_ROUTE', result.message || 'No valid route exists between the selected points.');
      cityMap.clearRoute();
      vehicle.clear();
      updateStatisticsPanel(result, calcTimeMs);
      logMessage(`? Dijkstra: ${result.message}`, 'error');
      return;
    }

    updateRouteStatusUI('COMPLETE', `Optimal route calculated in ${calcTimeMs}ms (Cost: ${result.totalCost.toFixed(1)}).`);
    cityMap.drawOptimalRoute(result.pathNodes);

    const routeCoords = result.pathNodes.map(n => [n.lat, n.lng]);
    vehicle.setRoute(routeCoords, retainVehicleProgress);

    updateStatisticsPanel(result, calcTimeMs);

    const pathNames = result.pathNodes.map(n => n.name).join(' ? ');
    logMessage(`? Optimal Path Found: ${pathNames} | Total Weighted Cost: ${result.totalCost.toFixed(1)} | Distance: ${(result.totalDistance / 1000).toFixed(2)} km`, 'success');
  }

  // ==========================================================================
  // STEP-BY-STEP ALGORITHM VISUALIZER
  // ==========================================================================
  function bindVisualizerControls() {
    const playBtn = document.getElementById('btn-viz-play');
    const pauseBtn = document.getElementById('btn-viz-pause');
    const stepFwdBtn = document.getElementById('btn-viz-forward');
    const stepBackBtn = document.getElementById('btn-viz-backward');
    const resetBtn = document.getElementById('btn-viz-reset');
    const speedSlider = document.getElementById('viz-speed-slider');

    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        state.visualizerSpeedMs = parseInt(e.target.value, 10);
        document.getElementById('viz-speed-val').textContent = `${state.visualizerSpeedMs}ms`;
      });
    }

    if (playBtn) playBtn.addEventListener('click', () => startAlgorithmVisualizer());
    if (pauseBtn) pauseBtn.addEventListener('click', () => pauseAlgorithmVisualizer());
    if (stepFwdBtn) stepFwdBtn.addEventListener('click', () => stepVisualizerForward());
    if (stepBackBtn) stepBackBtn.addEventListener('click', () => stepVisualizerBackward());
    if (resetBtn) resetBtn.addEventListener('click', () => resetAlgorithmVisualizer());
  }

  function startAlgorithmVisualizer() {
    if (!state.visualizerSteps || state.visualizerSteps.length === 0) {
      calculateAndRenderRoute(false);
    }

    if (state.visualizerSteps.length === 0) return;

    state.visualizerActive = true;
    document.getElementById('btn-viz-play').style.display = 'none';
    document.getElementById('btn-viz-pause').style.display = 'inline-flex';

    if (state.visualizerStepIndex >= state.visualizerSteps.length) {
      state.visualizerStepIndex = 0;
    }

    cityMap.visualizerLayerGroup.clearLayers();

    if (state.visualizerTimerId) clearInterval(state.visualizerTimerId);
    state.visualizerTimerId = setInterval(() => {
      if (state.visualizerStepIndex >= state.visualizerSteps.length) {
        pauseAlgorithmVisualizer();
        logMessage('?? Algorithm Visualization Complete.', 'success');
        if (state.lastResult && state.lastResult.success) {
          cityMap.drawOptimalRoute(state.lastResult.pathNodes);
        }
        return;
      }
      renderCurrentVisualizerStep();
      state.visualizerStepIndex++;
    }, state.visualizerSpeedMs);
  }

  function pauseAlgorithmVisualizer() {
    state.visualizerActive = false;
    if (state.visualizerTimerId) {
      clearInterval(state.visualizerTimerId);
      state.visualizerTimerId = null;
    }
    document.getElementById('btn-viz-play').style.display = 'inline-flex';
    document.getElementById('btn-viz-pause').style.display = 'none';
  }

  function stepVisualizerForward() {
    pauseAlgorithmVisualizer();
    if (state.visualizerStepIndex < state.visualizerSteps.length) {
      renderCurrentVisualizerStep();
      state.visualizerStepIndex++;
    }
  }

  function stepVisualizerBackward() {
    pauseAlgorithmVisualizer();
    if (state.visualizerStepIndex > 1) {
      state.visualizerStepIndex -= 2;
      renderCurrentVisualizerStep();
      state.visualizerStepIndex++;
    }
  }

  function resetAlgorithmVisualizer() {
    pauseAlgorithmVisualizer();
    state.visualizerStepIndex = 0;
    cityMap.visualizerLayerGroup.clearLayers();
    if (state.lastResult && state.lastResult.success) {
      cityMap.drawOptimalRoute(state.lastResult.pathNodes);
    }
    document.getElementById('viz-step-counter').textContent = `Step: 0 / ${state.visualizerSteps.length}`;
  }

  function renderCurrentVisualizerStep() {
    const step = state.visualizerSteps[state.visualizerStepIndex];
    if (!step) return;

    cityMap.drawAlgorithmStep(graph, step);
    document.getElementById('viz-step-counter').textContent = `Step: ${state.visualizerStepIndex + 1} / ${state.visualizerSteps.length}`;
    if (step.log) {
      logMessage(`[Step ${state.visualizerStepIndex + 1}] ${step.log}`, 'algo');
    }
  }

  // ==========================================================================
  // VEHICLE ANIMATION CONTROLS
  // ==========================================================================
  function bindVehicleControls() {
    document.getElementById('btn-vehicle-start').addEventListener('click', () => {
      vehicle.start();
      logMessage('?? Vehicle animation started.', 'info');
    });

    document.getElementById('btn-vehicle-pause').addEventListener('click', () => {
      vehicle.pause();
      logMessage('?? Vehicle paused.', 'info');
    });

    document.getElementById('btn-vehicle-reset').addEventListener('click', () => {
      vehicle.reset();
      logMessage('?? Vehicle reset to start.', 'info');
    });

    const speedSlider = document.getElementById('vehicle-speed-slider');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        vehicle.setSpeed(val);
        document.getElementById('vehicle-speed-val').textContent = `${val} m/s`;
      });
    }
  }

  // ==========================================================================
  // STATISTICS & UI PANELS
  // ==========================================================================
  function updateRouteStatusUI(code, message) {
    const badge = document.getElementById('route-status-badge');
    const msgEl = document.getElementById('route-status-msg');

    if (badge) {
      badge.textContent = code;
      badge.className = `status-pill status-${code.toLowerCase()}`;
    }
    if (msgEl) {
      msgEl.textContent = message;
    }
  }

  function updateStatisticsPanel(result, calcTimeMs) {
    const startNode = graph.nodes.get(state.startNodeId);
    const endNode = graph.nodes.get(state.endNodeId);

    document.getElementById('stat-start-name').textContent = startNode ? startNode.name : 'None';
    document.getElementById('stat-start-coords').textContent = startNode ? `${startNode.lat.toFixed(4)}, ${startNode.lng.toFixed(4)}` : '-';

    document.getElementById('stat-dest-name').textContent = endNode ? endNode.name : 'None';
    document.getElementById('stat-dest-coords').textContent = endNode ? `${endNode.lat.toFixed(4)}, ${endNode.lng.toFixed(4)}` : '-';

    if (result.success) {
      document.getElementById('stat-weighted-cost').textContent = result.totalCost.toFixed(1);
      document.getElementById('stat-road-distance').textContent = `${(result.totalDistance / 1000).toFixed(2)} km (${result.totalDistance}m)`;
      document.getElementById('stat-path-nodes').textContent = result.pathNodes.length;
      document.getElementById('stat-traffic-lights').textContent = result.stats.trafficLightsEncountered;
      document.getElementById('stat-shortcuts').textContent = result.stats.shortcutsUsed;
      document.getElementById('stat-calc-time').textContent = `${calcTimeMs} ms`;
    } else {
      document.getElementById('stat-weighted-cost').textContent = '?';
      document.getElementById('stat-road-distance').textContent = '0 km';
      document.getElementById('stat-path-nodes').textContent = '0';
      document.getElementById('stat-traffic-lights').textContent = '0';
      document.getElementById('stat-shortcuts').textContent = '0';
      document.getElementById('stat-calc-time').textContent = `${calcTimeMs} ms`;
    }

    let blockedCount = 0;
    for (const node of graph.nodes.values()) {
      if (node.isBlocked) blockedCount++;
    }
    for (const edge of graph.edges.values()) {
      if (edge.isBlocked) blockedCount++;
    }
    document.getElementById('stat-blocked-roads').textContent = blockedCount;
  }

  function resetStats() {
    document.getElementById('stat-weighted-cost').textContent = '-';
    document.getElementById('stat-road-distance').textContent = '-';
    document.getElementById('stat-path-nodes').textContent = '-';
    document.getElementById('stat-traffic-lights').textContent = '-';
    document.getElementById('stat-shortcuts').textContent = '-';
    document.getElementById('stat-blocked-roads').textContent = '0';
    updateRouteStatusUI('READY', 'Ready. Select Start & Destination to calculate route.');
  }

  function logMessage(text, type = 'info') {
    const stream = document.getElementById('log-stream');
    if (!stream) return;

    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-text">${text}</span>`;

    stream.appendChild(entry);
    stream.scrollTop = stream.scrollHeight;

    while (stream.children.length > 100) {
      stream.removeChild(stream.firstChild);
    }
  }

  function resetEverything() {
    traffic.stop();
    pauseAlgorithmVisualizer();
    vehicle.clear();

    graph.nodes.clear();
    graph.edges.clear();
    graph.adjacencyList.clear();
    buildHyderabadRoadNetwork(graph);

    traffic.reset();
    traffic.addLight('mindspace_junc', 'YELLOW');
    traffic.addLight('inorbit_mall', 'RED');
    traffic.addLight('madhapur_100ft', 'YELLOW');
    traffic.addLight('ikea_junc', 'RED');
    traffic.start();

    cityMap.resetAll();
    cityMap.renderRoadNetwork(graph);
    cityMap.renderJunctionNodes(graph, handleNodeClick);
    updateTrafficMarkersOnMap();

    state.startNodeId = 'cyber_towers';
    state.endNodeId = 'jubilee_rd36';
    state.shortcutSourceNodeId = null;

    const sNode = graph.nodes.get(state.startNodeId);
    const eNode = graph.nodes.get(state.endNodeId);
    if (sNode) cityMap.setStartMarker(sNode);
    if (eNode) cityMap.setEndMarker(eNode);

    calculateAndRenderRoute(false);
    logMessage('?? Entire Map & Graph reset to initial state.', 'info');
  }
});
