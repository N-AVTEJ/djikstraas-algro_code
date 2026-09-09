/**
 * ============================================================================
 * APPLICATION MASTER CONTROLLER (js/app.js)
 * ============================================================================
 *
 * Coordinates:
 * - CityRoadGraph (js/graph.js)
 * - LeafletMapManager (js/map.js)
 * - DijkstraRouter (js/dijkstra.js)
 * - TrafficLightController (js/traffic.js)
 * - RouteRenderer (js/route.js)
 * - VehicleNavigator (js/vehicle.js)
 * - UIManager (js/ui.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Core Subsystem Instantiation
    const graph = new CityRoadGraph();
    const mapManager = new LeafletMapManager('map', graph);
    const routeRenderer = new RouteRenderer(mapManager.map, mapManager.layers);
    const vehicle = new VehicleNavigator(mapManager.map);
    const ui = new UIManager();

    let currentRouteResult = null;
    let isVisualizing = false;
    let vizAbortController = null;

    // 2. Traffic Light Manager with dynamic rerouting callback
    const trafficController = new TrafficLightController(graph, (event) => {
        // Re-render visual traffic light states
        mapManager.renderRoadNetwork();

        // Dynamically recalculate route if active
        if (mapManager.startNodeId && mapManager.endNodeId && !isVisualizing) {
            handleDynamicTrafficRecalculate();
        }
    });

    // Start 3-second traffic light cycle
    trafficController.start();

    // 3. Map Click & Snapping Handler
    mapManager.onMapClickCallback = (latlng) => {
        handleMapClick(latlng.lat, latlng.lng);
    };

    mapManager.onNodeClickCallback = (node) => {
        handleNodeClick(node);
    };

    mapManager.onEdgeClickCallback = (edge) => {
        handleEdgeClick(edge);
    };

    function handleMapClick(lat, lng) {
        if (isVisualizing) return;

        const tool = ui.currentTool;

        if (tool === 'start' || tool === 'end') {
            // Intelligent Snap-to-Road
            const candidate = graph.findNearestRoadAndNode(lat, lng);
            if (!candidate) {
                ui.showBanner('⚠️ Click nearer to the city road network.', 'warning');
                return;
            }

            // Visual snap ripple indicator
            mapManager.showSnapIndicator(lat, lng, candidate.snappedLat, candidate.snappedLng);

            if (tool === 'start') {
                mapManager.setStartMarker(candidate.node);
                ui.showBanner(`🔵 Start snapped to road at: <b>${candidate.node.name}</b>.`, 'success');
                if (mapManager.endNodeId) {
                    calculateAndRenderRoute();
                }
            } else if (tool === 'end') {
                mapManager.setEndMarker(candidate.node);
                ui.showBanner(`🟣 Destination snapped to road at: <b>${candidate.node.name}</b>.`, 'success');
                if (mapManager.startNodeId) {
                    calculateAndRenderRoute();
                }
            }
        } else if (tool === 'traffic-light') {
            const candidate = graph.findNearestRoadAndNode(lat, lng);
            if (candidate && candidate.node) {
                handleNodeClick(candidate.node);
            }
        } else if (tool === 'shortcut' || tool === 'block') {
            const candidate = graph.findNearestRoadAndNode(lat, lng);
            if (candidate && candidate.edge) {
                handleEdgeClick(candidate.edge);
            } else if (candidate && candidate.node) {
                handleNodeClick(candidate.node);
            }
        }
    }

    function handleNodeClick(node) {
        if (isVisualizing) return;
        const tool = ui.currentTool;

        switch (tool) {
            case 'start':
                mapManager.setStartMarker(node);
                ui.showBanner(`🔵 Start set to: <b>${node.name}</b>.`, 'success');
                if (mapManager.endNodeId) calculateAndRenderRoute();
                break;

            case 'end':
                mapManager.setEndMarker(node);
                ui.showBanner(`🟣 Destination set to: <b>${node.name}</b>.`, 'success');
                if (mapManager.startNodeId) calculateAndRenderRoute();
                break;

            case 'traffic-light':
                const res = trafficController.toggleTrafficLight(node.id);
                mapManager.renderRoadNetwork();
                if (res.action === 'added') {
                    ui.showBanner(`🚦 Added Traffic Signal at <b>${node.name}</b> (Cycles Yellow 1.5 ↔ Red 4.0 every 3s).`, 'info');
                } else {
                    ui.showBanner(`🚦 Removed Traffic Signal from <b>${node.name}</b>.`, 'info');
                }
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoute();
                break;

            case 'block':
                node.blocked = !node.blocked;
                mapManager.renderRoadNetwork();
                ui.showBanner(`🧱 ${node.blocked ? 'Blocked' : 'Unblocked'} intersection: <b>${node.name}</b> (Cost: ${node.blocked ? '∞' : 'Normal'}).`, 'warning');
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoute();
                break;

            case 'select':
            default:
                ui.showBanner(`📍 Intersection: <b>${node.name}</b> (ID: ${node.id}) | Traffic Light: ${node.trafficLight ? node.trafficState.toUpperCase() : 'None'} | Blocked: ${node.blocked}`, 'info');
                break;
        }

        updateUiTelemetry();
    }

    function handleEdgeClick(edge) {
        if (isVisualizing) return;
        const tool = ui.currentTool;

        switch (tool) {
            case 'block':
                // Toggle blocked state in both directions
                edge.blocked = !edge.blocked;
                const revEdge = graph.edges.get(`${edge.to}--${edge.from}`);
                if (revEdge) revEdge.blocked = edge.blocked;

                mapManager.renderRoadNetwork();
                ui.showBanner(`🧱 ${edge.blocked ? 'Blocked' : 'Unblocked'} road: <b>${edge.name}</b> (Cost: ${edge.blocked ? '∞' : 'Normal'}).`, 'warning');
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoute();
                break;

            case 'shortcut':
                // Toggle shortcut state
                edge.roadType = edge.roadType === 'shortcut' ? 'normal' : 'shortcut';
                edge.baseCost = edge.roadType === 'shortcut' ? 0.5 : 1.0;
                const revShortcut = graph.edges.get(`${edge.to}--${edge.from}`);
                if (revShortcut) {
                    revShortcut.roadType = edge.roadType;
                    revShortcut.baseCost = edge.baseCost;
                }

                mapManager.renderRoadNetwork();
                ui.showBanner(`🟢 ${edge.roadType === 'shortcut' ? 'Enabled Express Shortcut (0.5x cost)' : 'Restored Normal Road (1.0x cost)'}: <b>${edge.name}</b>.`, 'success');
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoute();
                break;

            case 'select':
            default:
                ui.showBanner(`🛣️ Road: <b>${edge.name}</b> | Distance: ${edge.distance} km | Type: ${edge.roadType} | Blocked: ${edge.blocked}`, 'info');
                break;
        }

        updateUiTelemetry();
    }

    // 4. Dijkstra Execution & Rendering
    function calculateAndRenderRoute(recordSteps = false) {
        if (!mapManager.startNodeId || !mapManager.endNodeId) {
            ui.showBanner('⚠️ Please select both a Start and Destination point.', 'warning');
            return null;
        }

        ui.setStatusBadge('CALCULATING', 'badge-calculating');

        const result = DijkstraRouter.findShortestPath(
            graph,
            mapManager.startNodeId,
            mapManager.endNodeId,
            recordSteps
        );

        currentRouteResult = result;

        if (result.success) {
            routeRenderer.renderRoute(result);
            ui.setStatusBadge('OPTIMAL ROUTE', 'badge-ready');
            ui.showBanner(`✅ Optimal road route found! Cost: <b>${result.totalCost}</b> | Distance: <b>${result.totalDistanceKm} km</b> | Nodes: <b>${result.stepCount}</b>.`, 'success');
        } else {
            routeRenderer.clear();
            vehicle.reset();
            ui.setStatusBadge('NO ROUTE', 'badge-error');
            ui.showBanner(`⚠️ ${result.error}`, 'error');
        }

        updateUiTelemetry();
        return result;
    }

    // Dynamic rerouting when traffic lights change
    function handleDynamicTrafficRecalculate() {
        if (!mapManager.startNodeId || !mapManager.endNodeId) return;

        const previousCost = currentRouteResult?.totalCost;
        const prevPathKey = currentRouteResult?.pathNodeIds?.join('->');

        const result = DijkstraRouter.findShortestPath(graph, mapManager.startNodeId, mapManager.endNodeId);

        if (result.success) {
            const newPathKey = result.pathNodeIds.join('->');
            const pathChanged = prevPathKey !== newPathKey;

            if (pathChanged || result.totalCost !== previousCost) {
                currentRouteResult = result;
                routeRenderer.renderRoute(result);
                updateUiTelemetry();

                if (pathChanged) {
                    ui.showBanner(`⚡ Traffic light changed! Dijkstra dynamically routed via cheaper alternative (Cost: ${result.totalCost}).`, 'info');
                    // Reroute vehicle smoothly
                    if (vehicle.isPlaying) {
                        vehicle.updateRouteCoordinates(result.roadCoordinates);
                    }
                }
            }
        } else {
            currentRouteResult = result;
            routeRenderer.clear();
            vehicle.reset();
            updateUiTelemetry();
        }
    }

    function updateUiTelemetry() {
        const startNode = mapManager.startNodeId ? graph.nodes.get(mapManager.startNodeId) : null;
        const endNode = mapManager.endNodeId ? graph.nodes.get(mapManager.endNodeId) : null;
        ui.updateTelemetry(currentRouteResult, graph, startNode, endNode);
    }

    // 5. Vehicle Controls
    ui.elements.btnVehiclePlay?.addEventListener('click', () => {
        if (!currentRouteResult || !currentRouteResult.success) {
            ui.showBanner('⚠️ Calculate a valid route before animating the vehicle.', 'warning');
            return;
        }

        if (vehicle.isPaused) {
            vehicle.resume();
            ui.showBanner('🚗 Resumed vehicle simulation.', 'info');
            return;
        }

        ui.showBanner('🚗 Vehicle driving along road geometry...', 'info');
        vehicle.start(
            currentRouteResult.roadCoordinates,
            () => {
                ui.showBanner('🏁 Vehicle reached Destination successfully!', 'success');
            },
            (progress) => {
                // Optional progress telemetry updates
            }
        );
    });

    ui.elements.btnVehiclePause?.addEventListener('click', () => {
        vehicle.pause();
        ui.showBanner('⏸️ Vehicle simulation paused.', 'info');
    });

    ui.elements.btnVehicleReset?.addEventListener('click', () => {
        vehicle.reset();
        ui.showBanner('⏹️ Vehicle simulation reset to origin.', 'info');
    });

    ui.elements.vehicleSpeedSelect?.addEventListener('change', (e) => {
        vehicle.setSpeed(e.target.value);
    });

    ui.elements.checkFollowVehicle?.addEventListener('change', (e) => {
        vehicle.setFollowVehicle(e.target.checked);
    });

    // 6. Action Buttons
    ui.elements.btnRunDijkstra?.addEventListener('click', () => {
        calculateAndRenderRoute();
    });

    ui.elements.btnFitRoute?.addEventListener('click', () => {
        if (currentRouteResult && currentRouteResult.roadCoordinates) {
            mapManager.fitRoute(currentRouteResult.roadCoordinates);
        } else {
            mapManager.map.setView([17.4225, 78.4720], 14);
        }
    });

    ui.elements.btnClearRoute?.addEventListener('click', () => {
        routeRenderer.clear();
        vehicle.reset();
        currentRouteResult = null;
        updateUiTelemetry();
        ui.showBanner('🧹 Cleared route.', 'info');
    });

    ui.elements.btnReset?.addEventListener('click', () => {
        routeRenderer.clear();
        vehicle.reset();
        mapManager.clearMarkers();
        graph.resetState();
        mapManager.renderRoadNetwork();
        currentRouteResult = null;
        updateUiTelemetry();
        ui.showBanner('🔄 Reset all network modifications, obstacles, and routes to initial state.', 'info');
    });

    ui.elements.toggleGraph?.addEventListener('change', (e) => {
        mapManager.setGraphOverlayVisibility(e.target.checked);
    });

    ui.elements.toggleAutoTraffic?.addEventListener('change', (e) => {
        if (e.target.checked) {
            trafficController.start();
            ui.showBanner('🚦 Automatic 3-second traffic light cycling activated.', 'info');
        } else {
            trafficController.stop();
            ui.showBanner('🚦 Automatic traffic light cycling paused.', 'info');
        }
    });

    // 7. Demo Mode: Predefined College Presentation Scenario
    ui.elements.btnDemoMode?.addEventListener('click', () => {
        // Reset to clean state
        graph.resetState();
        routeRenderer.clear();
        vehicle.reset();

        // 1. Origin: Lakdikapul Junction
        const startNode = graph.nodes.get('lakdikapul');
        mapManager.setStartMarker(startNode);

        // 2. Destination: Paradise Circle
        const endNode = graph.nodes.get('paradise');
        mapManager.setEndMarker(endNode);

        // 3. Setup competing routes:
        // Set Tank Bund South to Red (+4.0)
        const tbSouth = graph.nodes.get('tankbund_south');
        if (tbSouth) {
            tbSouth.trafficLight = true;
            tbSouth.trafficState = 'red';
        }

        // Set Lower Tank Bund as Express Shortcut (0.5x)
        const ltbEdge = graph.edges.get('lower_tankbund--kavadiguda');
        if (ltbEdge) {
            ltbEdge.roadType = 'shortcut';
            ltbEdge.baseCost = 0.5;
        }

        // Block Somajiguda to Begumpet Road to force central lake corridor
        const blockEdge = graph.edges.get('somajiguda--begumpet');
        if (blockEdge) {
            blockEdge.blocked = true;
            const revBlock = graph.edges.get('begumpet--somajiguda');
            if (revBlock) revBlock.blocked = true;
        }

        mapManager.renderRoadNetwork();

        // 4. Calculate optimal route
        const result = calculateAndRenderRoute();

        // 5. Fit viewport and launch vehicle
        if (result && result.success) {
            mapManager.fitRoute(result.roadCoordinates);
            ui.showBanner('🌟 Demo Scenario Loaded: Lakdikapul → Paradise Circle! Watch how the 3-second traffic lights trigger dynamic rerouting.', 'success');

            // Auto-start vehicle after brief moment
            setTimeout(() => {
                vehicle.start(result.roadCoordinates);
            }, 600);
        }
    });

    // 8. Step-by-Step Dijkstra Algorithm Visualizer
    ui.elements.btnVisualizeDijkstra?.addEventListener('click', async () => {
        if (!mapManager.startNodeId || !mapManager.endNodeId) {
            ui.showBanner('⚠️ Select Start and Destination before visualizing the algorithm.', 'warning');
            return;
        }

        if (isVisualizing) {
            if (vizAbortController) vizAbortController.abort = true;
            return;
        }

        isVisualizing = true;
        vizAbortController = { abort: false };
        routeRenderer.clear();
        vehicle.reset();
        ui.setStatusBadge('EXPLORING', 'badge-calculating');

        const result = DijkstraRouter.findShortestPath(
            graph,
            mapManager.startNodeId,
            mapManager.endNodeId,
            true
        );

        if (!result.steps || result.steps.length === 0) {
            isVisualizing = false;
            return;
        }

        ui.showBanner('🧠 Step-by-step Dijkstra exploration running...', 'info');

        // Visual marker layer for exploration
        const vizLayer = L.layerGroup().addTo(mapManager.map);

        for (let i = 0; i < result.steps.length; i++) {
            if (vizAbortController.abort) break;
            const step = result.steps[i];

            if (step.type === 'visit') {
                const node = graph.nodes.get(step.nodeId);
                if (node) {
                    const circle = L.circleMarker([node.lat, node.lng], {
                        radius: 7,
                        fillColor: '#ffd600',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 0.9
                    }).addTo(vizLayer);
                }
            } else if (step.type === 'relax') {
                const toNode = graph.nodes.get(step.toId);
                if (toNode) {
                    const circle = L.circleMarker([toNode.lat, toNode.lng], {
                        radius: 6,
                        fillColor: '#00e5ff',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 0.8
                    }).addTo(vizLayer);
                }
            }

            ui.showBanner(`Step ${i + 1}/${result.steps.length}: ${step.description}`, 'info');
            await new Promise(r => setTimeout(r, 220));
        }

        // Fade out exploration and render final shortest path
        setTimeout(() => {
            mapManager.map.removeLayer(vizLayer);
            isVisualizing = false;
            if (result.success) {
                currentRouteResult = result;
                routeRenderer.renderRoute(result);
                updateUiTelemetry();
                ui.showBanner(`🏁 Dijkstra completed! Final path cost: ${result.totalCost}.`, 'success');
            }
        }, 800);
    });

    // Initial update
    updateUiTelemetry();
});
