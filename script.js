/**
 * ============================================================================
 * MAIN APPLICATION CONTROLLER (script.js)
 * ============================================================================
 * 
 * Orchestrates the application components:
 * - MapManager (Leaflet UI)
 * - CityGraph (Graph Data Structure)
 * - DijkstraSolver (Pure JS Shortest Path Algorithm)
 * - TrafficLightManager (Real-Time 3s Traffic Cycle)
 * - VehicleSimulator (Vehicle Animation & Dynamic Rerouting)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Instantiate Core Subsystems
    const graph = new CityGraph();
    const mapManager = new MapManager('map', graph);
    const vehicle = new VehicleSimulator(mapManager.map);

    let currentRouteResult = null;
    let isAutoTrafficEnabled = true;
    let isVisualizingAlgorithm = false;
    let visualizationAbortController = null;

    // 2. Instantiate Traffic Manager with real-time recalculation callback
    const trafficManager = new TrafficLightManager(graph, (event) => {
        // Re-render markers for updated traffic lights
        mapManager.renderGraphLayers();

        // If a route is active and start/end are set, trigger dynamic recalculation
        if (mapManager.startNodeId && mapManager.endNodeId && !isVisualizingAlgorithm) {
            handleDynamicRecalculate();
        }
    });

    // Start auto traffic 3-second cycle
    trafficManager.start();

    // 3. UI DOM Element References
    const elements = {
        // Toolbar Tool Buttons
        toolBtns: document.querySelectorAll('.tool-btn'),
        btnSelect: document.getElementById('toolSelect'),
        btnStart: document.getElementById('toolStart'),
        btnEnd: document.getElementById('toolEnd'),
        btnWall: document.getElementById('toolWall'),
        btnTrafficLight: document.getElementById('toolTrafficLight'),
        btnShortcut: document.getElementById('toolShortcut'),

        // Action Buttons
        btnRunDijkstra: document.getElementById('btnRunDijkstra'),
        btnVisualizeAlgo: document.getElementById('btnVisualizeAlgo'),
        btnClearRoute: document.getElementById('btnClearRoute'),
        btnResetMap: document.getElementById('btnResetMap'),

        // Vehicle Controls
        btnVehiclePlay: document.getElementById('btnVehiclePlay'),
        btnVehiclePause: document.getElementById('btnVehiclePause'),
        btnVehicleReset: document.getElementById('btnVehicleReset'),
        vehicleSpeedSelect: document.getElementById('vehicleSpeedSelect'),

        // Toggles
        toggleGraph: document.getElementById('toggleGraphOverlay'),
        toggleAutoTraffic: document.getElementById('toggleAutoTraffic'),

        // Info Banner & Status
        infoBanner: document.getElementById('infoBanner'),
        routeStatusBadge: document.getElementById('routeStatusBadge'),

        // Statistics Display Elements
        statStartLoc: document.getElementById('statStartLoc'),
        statEndLoc: document.getElementById('statEndLoc'),
        statWeightedCost: document.getElementById('statWeightedCost'),
        statDistance: document.getElementById('statDistance'),
        statSteps: document.getElementById('statSteps'),
        statTrafficLights: document.getElementById('statTrafficLights'),
        statShortcuts: document.getElementById('statShortcuts'),
        statObstacles: document.getElementById('statObstacles'),
        statExecTime: document.getElementById('statExecTime'),

        // Step visualizer log box
        algoLogPanel: document.getElementById('algoLogPanel'),
        algoLogContent: document.getElementById('algoLogContent'),
        btnCloseAlgoLog: document.getElementById('btnCloseAlgoLog')
    };

    // 4. Set Active Tool Handler
    function setActiveTool(toolName) {
        mapManager.activeTool = toolName;
        elements.toolBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        const toolDescriptions = {
            'select': '🔍 Select Tool: Click any intersection or road to inspect details.',
            'start': '🔵 Set Start Tool: Click any intersection to place the origin point.',
            'end': '🟣 Set Destination Tool: Click any intersection to place the destination.',
            'wall': '🧱 Obstacle Tool: Click roads or intersections to block them (Cost = ∞).',
            'traffic-light': '🚦 Traffic Light Tool: Click intersections to add/remove traffic lights (Yellow 1.5 ↔ Red 4.0).',
            'shortcut': '🟢 Express Shortcut Tool: Click road segments to toggle 0.5x high-speed status.'
        };

        showBanner(toolDescriptions[toolName] || 'Select a tool from the toolbar.');
    }

    elements.toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveTool(btn.dataset.tool);
        });
    });

    // 5. Map and Node Click Logic
    mapManager.onNodeClickCallback = (node) => {
        handleNodeInteraction(node);
    };

    mapManager.onEdgeClickCallback = (edge) => {
        handleEdgeInteraction(edge);
    };

    mapManager.onMapClickCallback = (latlng) => {
        // Find nearest node or edge
        if (mapManager.activeTool === 'start' || mapManager.activeTool === 'end' || mapManager.activeTool === 'traffic-light') {
            const nearestNode = mapManager.findNearestNode(latlng.lat, latlng.lng);
            if (nearestNode) {
                handleNodeInteraction(nearestNode);
            } else {
                showBanner('📍 No city intersection found near clicked position. Please click closer to a node.', 'warning');
            }
        } else if (mapManager.activeTool === 'wall' || mapManager.activeTool === 'shortcut') {
            const nearestEdge = mapManager.findNearestEdge(latlng.lat, latlng.lng);
            if (nearestEdge) {
                handleEdgeInteraction(nearestEdge);
            } else {
                const nearestNode = mapManager.findNearestNode(latlng.lat, latlng.lng);
                if (nearestNode) {
                    handleNodeInteraction(nearestNode);
                }
            }
        }
    };

    function handleNodeInteraction(node) {
        switch (mapManager.activeTool) {
            case 'start':
                mapManager.setStartNode(node.id);
                showBanner(`🔵 Start set to: ${node.name}. Now set a destination or run Dijkstra.`, 'success');
                if (mapManager.endNodeId) {
                    calculateAndRenderRoute();
                }
                break;

            case 'end':
                mapManager.setEndNode(node.id);
                showBanner(`🟣 Destination set to: ${node.name}. Calculating optimal route...`, 'success');
                if (mapManager.startNodeId) {
                    calculateAndRenderRoute();
                }
                break;

            case 'traffic-light':
                const result = trafficManager.toggleTrafficLightAtNode(node.id);
                mapManager.renderGraphLayers();
                if (result.action === 'added') {
                    showBanner(`🚦 Added Traffic Light at ${node.name} (Alternates 1.5 ↔ 4.0 cost every 3s).`, 'info');
                } else {
                    showBanner(`🚦 Removed Traffic Light from ${node.name}.`, 'info');
                }
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoute();
                }
                break;

            case 'wall':
                node.isBlocked = !node.isBlocked;
                mapManager.renderGraphLayers();
                showBanner(`🧱 ${node.isBlocked ? 'Blocked' : 'Unblocked'} intersection: ${node.name} (Cost: ${node.isBlocked ? '∞' : '1.0'}).`, 'warning');
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoute();
                }
                break;

            case 'select':
            default:
                showBanner(`📍 Intersection: <b>${node.name}</b> (Type: ${node.type}, Blocked: ${node.isBlocked})`, 'info');
                break;
        }
        updateStatisticsPanel();
    }

    function handleEdgeInteraction(edge) {
        const u = graph.nodes.get(edge.source);
        const v = graph.nodes.get(edge.target);
        const roadName = `${u.name} ↔ ${v.name}`;

        switch (mapManager.activeTool) {
            case 'wall':
                // Toggle blocked state for both directions
                edge.isBlocked = !edge.isBlocked;
                const revEdge = graph.edges.get(`${edge.target}--${edge.source}`);
                if (revEdge) revEdge.isBlocked = edge.isBlocked;

                mapManager.renderGraphLayers();
                showBanner(`🧱 ${edge.isBlocked ? 'Blocked' : 'Unblocked'} road: ${roadName} (Cost = ${edge.isBlocked ? '∞' : 'Normal'}).`, 'warning');
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoute();
                }
                break;

            case 'shortcut':
                // Toggle shortcut state
                edge.roadType = edge.roadType === 'shortcut' ? 'normal' : 'shortcut';
                const revShortcut = graph.edges.get(`${edge.target}--${edge.source}`);
                if (revShortcut) revShortcut.roadType = edge.roadType;

                mapManager.renderGraphLayers();
                showBanner(`🟢 ${edge.roadType === 'shortcut' ? 'Created Express Shortcut (0.5x cost)' : 'Restored Normal Road (1.0x cost)'}: ${roadName}.`, 'success');
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoute();
                }
                break;

            case 'select':
            default:
                showBanner(`🛣️ Road: <b>${roadName}</b> | Distance: ${edge.distance} km | Type: ${edge.roadType} | Blocked: ${edge.isBlocked}`, 'info');
                break;
        }
        updateStatisticsPanel();
    }

    // 6. Dijkstra Route Calculation
    function calculateAndRenderRoute(recordSteps = false) {
        if (!mapManager.startNodeId || !mapManager.endNodeId) {
            showBanner('⚠️ Please select both a Start and Destination node.', 'warning');
            return null;
        }

        updateStatusBadge('CALCULATING', 'badge-calculating');

        const result = DijkstraSolver.findShortestPath(
            graph,
            mapManager.startNodeId,
            mapManager.endNodeId,
            recordSteps
        );

        currentRouteResult = result;

        if (result.success) {
            updateStatusBadge('COMPLETE', 'badge-complete');
            mapManager.drawShortestPath(result.pathNodes);
            showBanner(`✅ Optimal path found! Cost: <b>${result.totalCost}</b>, Distance: <b>${result.totalDistanceKm} km</b>, Nodes: <b>${result.stepCount}</b>.`, 'success');
        } else {
            updateStatusBadge('NO ROUTE', 'badge-no-route');
            mapManager.clearRoute();
            showBanner(`⚠️ ${result.error}`, 'error');
            if (vehicle.isPlaying) {
                vehicle.reset();
            }
        }

        updateStatisticsPanel(result);
        return result;
    }

    // Dynamic rerouting triggered on traffic cycle
    function handleDynamicRecalculate() {
        if (!mapManager.startNodeId || !mapManager.endNodeId) return;

        const previousCost = currentRouteResult?.totalCost;
        const result = DijkstraSolver.findShortestPath(graph, mapManager.startNodeId, mapManager.endNodeId);

        if (result.success) {
            // Check if path or cost changed
            const pathChanged = !currentRouteResult || 
                JSON.stringify(result.pathNodeIds) !== JSON.stringify(currentRouteResult.pathNodeIds);

            if (pathChanged || result.totalCost !== previousCost) {
                currentRouteResult = result;
                mapManager.drawShortestPath(result.pathNodes);
                updateStatisticsPanel(result);
                updateStatusBadge('COMPLETE', 'badge-complete');

                if (pathChanged) {
                    showBanner(`⚡ Traffic changed! Dijkstra recalculated a cheaper alternative route (Cost: ${result.totalCost}).`, 'info');
                    // Intelligently adapt vehicle
                    if (vehicle.isPlaying) {
                        vehicle.updatePath(result.pathNodes);
                    }
                }
            }
        } else {
            currentRouteResult = result;
            mapManager.clearRoute();
            updateStatisticsPanel(result);
            updateStatusBadge('NO ROUTE', 'badge-no-route');
        }
    }

    // 7. Step-by-Step Algorithm Visualizer Mode
    async function runAlgorithmVisualization() {
        if (!mapManager.startNodeId || !mapManager.endNodeId) {
            showBanner('⚠️ Please select both a Start and Destination node first.', 'warning');
            return;
        }

        if (isVisualizingAlgorithm) {
            // Abort ongoing visualization
            if (visualizationAbortController) {
                visualizationAbortController.abort = true;
            }
            return;
        }

        isVisualizingAlgorithm = true;
        visualizationAbortController = { abort: false };

        mapManager.clearRoute();
        mapManager.clearAlgorithmViz();
        updateStatusBadge('EXPLORING', 'badge-calculating');

        // Open log panel
        elements.algoLogPanel.classList.remove('hidden');
        elements.algoLogContent.innerHTML = '<div class="log-entry log-info">Starting Dijkstra step-by-step exploration...</div>';

        const result = DijkstraSolver.findShortestPath(graph, mapManager.startNodeId, mapManager.endNodeId, true);
        const steps = result.steps || [];

        for (let i = 0; i < steps.length; i++) {
            if (visualizationAbortController.abort) break;

            const step = steps[i];
            const logItem = document.createElement('div');
            logItem.className = 'log-entry';

            switch (step.type) {
                case 'visit_node':
                    mapManager.highlightExplorationNode(step.nodeId, 'visited');
                    logItem.classList.add('log-visit');
                    logItem.innerHTML = `<span>[Step ${i+1}]</span> <b>Visited:</b> ${step.description}`;
                    break;

                case 'relax_edge':
                    mapManager.highlightExplorationNode(step.targetId, 'evaluating');
                    logItem.classList.add('log-relax');
                    logItem.innerHTML = `<span>[Step ${i+1}]</span> <b>Edge Relaxed:</b> ${step.description}`;
                    break;

                case 'blocked_edge':
                    logItem.classList.add('log-blocked');
                    logItem.innerHTML = `<span>[Step ${i+1}]</span> <b>Blocked:</b> ${step.description}`;
                    break;

                case 'reached_destination':
                    logItem.classList.add('log-success');
                    logItem.innerHTML = `<span>[Step ${i+1}]</span> <b>Destination Reached:</b> ${step.description}`;
                    break;

                default:
                    logItem.classList.add('log-info');
                    logItem.innerHTML = `<span>[Step ${i+1}]</span> ${step.description}`;
            }

            elements.algoLogContent.appendChild(logItem);
            elements.algoLogContent.scrollTop = elements.algoLogContent.scrollHeight;

            // Small delay for smooth visual pacing
            await new Promise(r => setTimeout(r, 180));
        }

        isVisualizingAlgorithm = false;

        if (!visualizationAbortController.abort && result.success) {
            mapManager.clearAlgorithmViz();
            mapManager.drawShortestPath(result.pathNodes);
            updateStatusBadge('COMPLETE', 'badge-complete');
            updateStatisticsPanel(result);
            showBanner(`🎉 Visualization Complete! Optimal Shortest Path formed (Cost: ${result.totalCost}).`, 'success');
        } else if (!result.success) {
            updateStatusBadge('NO ROUTE', 'badge-no-route');
            showBanner(`⚠️ Exploration concluded: No valid route found.`, 'error');
        }
    }

    // 8. Vehicle Animation Controls
    elements.btnVehiclePlay.addEventListener('click', () => {
        if (!currentRouteResult || !currentRouteResult.success || !currentRouteResult.pathNodes) {
            showBanner('⚠️ Please calculate a valid route before animating the vehicle.', 'warning');
            return;
        }

        if (vehicle.isPaused) {
            vehicle.resume();
            showBanner('🚗 Vehicle animation resumed.', 'info');
        } else {
            vehicle.setSpeed(parseFloat(elements.vehicleSpeedSelect.value));
            vehicle.start(
                currentRouteResult.pathNodes,
                () => {
                    showBanner('🎉 Vehicle reached destination safely!', 'success');
                },
                (progress) => {
                    // Update step in status if needed
                }
            );
            showBanner('🚗 Vehicle en route to destination...', 'info');
        }
    });

    elements.btnVehiclePause.addEventListener('click', () => {
        if (vehicle.isPlaying && !vehicle.isPaused) {
            vehicle.pause();
            showBanner('⏸️ Vehicle animation paused.', 'info');
        }
    });

    elements.btnVehicleReset.addEventListener('click', () => {
        vehicle.reset();
        showBanner('⏹️ Vehicle animation reset.', 'info');
    });

    elements.vehicleSpeedSelect.addEventListener('change', (e) => {
        vehicle.setSpeed(parseFloat(e.target.value));
    });

    // 9. Toolbar Action Listeners
    elements.btnRunDijkstra.addEventListener('click', () => {
        calculateAndRenderRoute();
    });

    elements.btnVisualizeAlgo.addEventListener('click', () => {
        runAlgorithmVisualization();
    });

    elements.btnClearRoute.addEventListener('click', () => {
        mapManager.clearRoute();
        vehicle.reset();
        currentRouteResult = null;
        updateStatusBadge('READY', 'badge-ready');
        updateStatisticsPanel();
        showBanner('🧹 Route cleared. Map network remains configured.', 'info');
    });

    elements.btnResetMap.addEventListener('click', () => {
        if (isVisualizingAlgorithm && visualizationAbortController) {
            visualizationAbortController.abort = true;
        }
        vehicle.reset();
        mapManager.reset();
        currentRouteResult = null;
        elements.algoLogPanel.classList.add('hidden');
        updateStatusBadge('READY', 'badge-ready');
        updateStatisticsPanel();
        showBanner('🔄 Map completely reset to default state.', 'info');
    });

    // 10. Toggles
    elements.toggleGraph.addEventListener('change', (e) => {
        mapManager.toggleGraphOverlay(e.target.checked);
        showBanner(`🕸️ Graph overlay ${e.target.checked ? 'Enabled' : 'Disabled'}.`, 'info');
    });

    elements.toggleAutoTraffic.addEventListener('change', (e) => {
        isAutoTrafficEnabled = e.target.checked;
        if (isAutoTrafficEnabled) {
            trafficManager.start();
            showBanner('⏱️ 3-second automatic traffic cycling active.', 'info');
        } else {
            trafficManager.stop();
            showBanner('⏸️ Automatic traffic cycling paused.', 'info');
        }
    });

    elements.btnCloseAlgoLog.addEventListener('click', () => {
        elements.algoLogPanel.classList.add('hidden');
    });

    // 11. Statistics & UI Helper Functions
    function updateStatisticsPanel(result = currentRouteResult) {
        const startNode = mapManager.startNodeId ? graph.nodes.get(mapManager.startNodeId) : null;
        const endNode = mapManager.endNodeId ? graph.nodes.get(mapManager.endNodeId) : null;

        elements.statStartLoc.textContent = startNode ? `${startNode.name} (${startNode.lat.toFixed(3)}, ${startNode.lng.toFixed(3)})` : 'None Selected';
        elements.statEndLoc.textContent = endNode ? `${endNode.name} (${endNode.lat.toFixed(3)}, ${endNode.lng.toFixed(3)})` : 'None Selected';

        let obstacleCount = 0;
        for (const [, n] of graph.nodes) { if (n.isBlocked) obstacleCount++; }
        for (const [, e] of graph.edges) { if (e.isBlocked) obstacleCount += 0.5; }
        elements.statObstacles.textContent = Math.floor(obstacleCount);

        if (result && result.success) {
            elements.statWeightedCost.textContent = result.totalCost.toFixed(2);
            elements.statDistance.textContent = `${result.totalDistanceKm} km`;
            elements.statSteps.textContent = result.stepCount;
            elements.statTrafficLights.textContent = result.trafficLightsCount;
            elements.statShortcuts.textContent = result.shortcutsCount;
            elements.statExecTime.textContent = `${result.calculationTimeMs} ms`;
        } else if (result && result.noRoute) {
            elements.statWeightedCost.textContent = '∞';
            elements.statDistance.textContent = 'N/A';
            elements.statSteps.textContent = '0';
            elements.statTrafficLights.textContent = '0';
            elements.statShortcuts.textContent = '0';
            elements.statExecTime.textContent = `${result.calculationTimeMs || 0} ms`;
        } else {
            elements.statWeightedCost.textContent = '--';
            elements.statDistance.textContent = '--';
            elements.statSteps.textContent = '--';
            elements.statTrafficLights.textContent = '--';
            elements.statShortcuts.textContent = '--';
            elements.statExecTime.textContent = '--';
        }
    }

    function updateStatusBadge(text, className) {
        elements.routeStatusBadge.textContent = text;
        elements.routeStatusBadge.className = `status-badge ${className}`;
    }

    function showBanner(message, type = 'info') {
        elements.infoBanner.innerHTML = message;
        elements.infoBanner.className = `info-banner banner-${type}`;
    }

    // Set initial tool
    setActiveTool('start');
    updateStatisticsPanel();
});