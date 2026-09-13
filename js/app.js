/**
 * ============================================================================
 * APPLICATION MASTER CONTROLLER (js/app.js)
 * ============================================================================
 *
 * Coordinates:
 * - CityRoadGraph (js/graph.js)
 * - LeafletMapManager (js/map.js)
 * - RoutingManager (js/routing.js)
 * - TrafficLightController (js/traffic.js)
 * - VehicleNavigator (js/vehicle.js)
 * - POIManager (js/pois.js)
 * - UIManager (js/ui.js)
 * - Single Navigation State (js/navigationState.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Core Subsystem Instantiation
    const graph = new CityRoadGraph();
    const mapManager = new LeafletMapManager('map', graph);
    const routingManager = new RoutingManager(graph);
    const vehicle = new VehicleNavigator(mapManager.map);
    const ui = new UIManager();

    // POI Manager with direct start/destination setter callback
    const poiManager = new POIManager(mapManager.map, graph, (node, type) => {
        if (type === 'start') {
            setOriginNode(node);
        } else if (type === 'end') {
            setDestinationNode(node);
        }
    });

    let currentRoutesResult = null;
    let isVisualizing = false;
    let vizAbort = false;

    // 2. Traffic Light Manager with dynamic rerouting callback
    const trafficController = new TrafficLightController(graph, (event) => {
        // Re-render visual traffic light states on the map
        mapManager.renderRoadNetwork();

        // Dynamically recalculate route if active
        if (mapManager.startNodeId && mapManager.endNodeId && !isVisualizing) {
            handleDynamicTrafficRecalculate(event);
        }
    });

    // Start 3-second automatic traffic cycling
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
            const candidate = graph.findNearestRoadAndNode(lat, lng);
            if (!candidate || !candidate.node) {
                ui.showBanner('⚠️ Click nearer to the city road network.', 'warning');
                return;
            }

            // Visual snap ripple indicator
            mapManager.showSnapIndicator(lat, lng, candidate.snappedLat, candidate.snappedLng);

            if (tool === 'start') {
                setOriginNode(candidate.node, candidate.snappedLat, candidate.snappedLng);
            } else if (tool === 'end') {
                setDestinationNode(candidate.node, candidate.snappedLat, candidate.snappedLng);
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
        } else if (tool === 'select') {
            const candidate = graph.findNearestRoadAndNode(lat, lng);
            if (candidate && candidate.node) {
                ui.showBanner(`📍 Intersection: <b>${candidate.node.name}</b> (ID: <code>${candidate.node.id}</code>)`, 'info');
            }
        }
    }

    function handleNodeClick(node) {
        if (isVisualizing) return;
        const tool = ui.currentTool;

        switch (tool) {
            case 'start':
                setOriginNode(node);
                break;

            case 'end':
                setDestinationNode(node);
                break;

            case 'traffic-light':
                trafficController.switchLight(node.id);
                mapManager.renderRoadNetwork();
                const updatedState = (graph.roadNetwork.signals?.[node.trafficSignalId]?.state || 'YELLOW').toUpperCase();
                ui.showBanner(`🚦 Traffic Light at <b>${node.name}</b> switched to <b>${updatedState}</b>.`, 'info');
                ui.addTimelineEvent(`🚦 Traffic Light at ${node.name} switched to ${updatedState}.`);
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'block':
                node.blocked = !node.blocked;
                mapManager.renderRoadNetwork();
                ui.showBanner(`🧱 ${node.blocked ? 'Blocked' : 'Unblocked'} intersection: <b>${node.name}</b>.`, 'warning');
                ui.addTimelineEvent(`🧱 ${node.blocked ? 'Blocked' : 'Unblocked'} intersection ${node.name}.`, 'hazard');
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'select':
            default:
                ui.showBanner(`📍 Intersection: <b>${node.name}</b> | Signals: ${node.trafficLight ? node.trafficState.toUpperCase() : 'None'} | Blocked: ${node.blocked}`, 'info');
                break;
        }
    }

    function handleEdgeClick(edge) {
        if (isVisualizing) return;
        const tool = ui.currentTool;

        switch (tool) {
            case 'block':
                edge.blocked = !edge.blocked;
                const revEdge = graph.edges.get(`${edge.to}--${edge.from}`);
                if (revEdge) revEdge.blocked = edge.blocked;
                if (graph.roadNetwork.edges[edge.id]) graph.roadNetwork.edges[edge.id].blocked = edge.blocked;
                if (graph.roadNetwork.edges[`${edge.to}--${edge.from}`]) graph.roadNetwork.edges[`${edge.to}--${edge.from}`].blocked = edge.blocked;

                mapManager.renderRoadNetwork();
                ui.showBanner(`🧱 ${edge.blocked ? 'Blocked' : 'Unblocked'} road: <b>${edge.name}</b> (Weight: ${edge.blocked ? '∞' : 'Normal'}).`, 'warning');
                ui.addTimelineEvent(`🧱 ${edge.blocked ? 'Blocked' : 'Unblocked'} road ${edge.name}.`, 'hazard');
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'shortcut':
                const isShortcut = !edge.shortcut && edge.roadType !== 'shortcut';
                edge.shortcut = isShortcut;
                edge.roadType = isShortcut ? 'shortcut' : 'normal';
                edge.speedKmh = isShortcut ? 65 : 45;

                const revShortcut = graph.edges.get(`${edge.to}--${edge.from}`);
                if (revShortcut) {
                    revShortcut.shortcut = isShortcut;
                    revShortcut.roadType = edge.roadType;
                    revShortcut.speedKmh = edge.speedKmh;
                }

                if (graph.roadNetwork.edges[edge.id]) {
                    graph.roadNetwork.edges[edge.id].shortcut = isShortcut;
                    graph.roadNetwork.edges[edge.id].roadType = edge.roadType;
                    graph.roadNetwork.edges[edge.id].speedKmh = edge.speedKmh;
                }

                mapManager.renderRoadNetwork();
                ui.showBanner(`⚡ ${isShortcut ? 'Enabled Express Shortcut (65 km/h)' : 'Restored Normal Road'}: <b>${edge.name}</b>.`, 'success');
                ui.addTimelineEvent(`⚡ ${isShortcut ? 'Activated Express Shortcut' : 'Restored Normal Road'} on ${edge.name}.`);
                if (mapManager.startNodeId && mapManager.endNodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'select':
            default:
                ui.showBanner(`🛣️ Road: <b>${edge.name}</b> | Dist: ${(edge.distanceMeters / 1000).toFixed(2)} km | Speed: ${edge.speedKmh || 45} km/h | Blocked: ${edge.blocked}`, 'info');
                break;
        }
    }

    function setOriginNode(node, snappedLat = null, snappedLng = null) {
        mapManager.setStartMarker(node, snappedLat, snappedLng);
        navigationState.setStart(node, snappedLat ? [snappedLat, snappedLng] : null);

        ui.showBanner(`🟢 Origin snapped to road: <b>${node.name}</b>.`, 'success');
        ui.addTimelineEvent(`🟢 Origin set to ${node.name}.`);

        if (mapManager.endNodeId) {
            calculateAndRenderRoutes();
        }
    }

    function setDestinationNode(node, snappedLat = null, snappedLng = null) {
        mapManager.setEndMarker(node, snappedLat, snappedLng);
        navigationState.setDestination(node, snappedLat ? [snappedLat, snappedLng] : null);

        ui.showBanner(`🔴 Destination snapped to road: <b>${node.name}</b>.`, 'success');
        ui.addTimelineEvent(`🔴 Destination set to ${node.name}.`);

        if (mapManager.startNodeId) {
            calculateAndRenderRoutes();
        }
    }

    // 4. Compute Routes & Update Displays
    function calculateAndRenderRoutes(options = {}) {
        if (!mapManager.startNodeId || !mapManager.endNodeId) {
            ui.showBanner('⚠️ Please select both Start and Destination points.', 'warning');
            return null;
        }

        ui.setStatusBadge('CALCULATING', 'badge-calculating');

        const routes = routingManager.computeRoutes(
            mapManager.startNodeId,
            mapManager.endNodeId,
            options
        );

        currentRoutesResult = routes;
        navigationState.state.activeRoute = routes.dijkstra.success ? routes.dijkstra : routes.normal;

        const startNode = graph.nodes.get(mapManager.startNodeId);
        const endNode = graph.nodes.get(mapManager.endNodeId);

        if (routes.dijkstra.success || routes.normal.success) {
            mapManager.renderRoutes(routes, ui.currentMode);
            ui.setStatusBadge('OPTIMAL ROUTE', 'badge-ready');
            ui.updateTelemetry(routes, startNode, endNode);

            const active = (ui.currentMode === 'normal') ? routes.normal : routes.dijkstra;
            ui.showBanner(`✅ Route calculated! ${active.label}: <b>${active.totalDistanceKm} km</b> • <b>~${active.estimatedTimeMin} min</b>`, 'success');
        } else {
            mapManager.clearRoutes();
            vehicle.reset();
            ui.setStatusBadge('NO ROUTE', 'badge-error');
            ui.updateTelemetry(routes, startNode, endNode);
            ui.showBanner(`⚠️ ${routes.dijkstra.error || 'No passable route between points.'}`, 'error');
            ui.addTimelineEvent(`⚠️ Route obstructed: No passable path available.`, 'hazard');
        }

        return routes;
    }

    // Dynamic Traffic Light Recalculation
    function handleDynamicTrafficRecalculate(event) {
        if (!mapManager.startNodeId || !mapManager.endNodeId) return;

        const prevDijkstra = currentRoutesResult?.dijkstra;
        const prevPathKey = prevDijkstra?.pathNodeIds?.join('->');
        const prevTime = prevDijkstra?.estimatedTimeMin;

        const newRoutes = routingManager.computeRoutes(mapManager.startNodeId, mapManager.endNodeId);

        if (newRoutes.dijkstra.success) {
            const newPathKey = newRoutes.dijkstra.pathNodeIds.join('->');
            const pathChanged = prevPathKey !== newPathKey;
            const timeDiff = prevTime !== undefined ? Number((prevTime - newRoutes.dijkstra.estimatedTimeMin).toFixed(1)) : 0;

            currentRoutesResult = newRoutes;
            mapManager.renderRoutes(newRoutes, ui.currentMode);

            const startNode = graph.nodes.get(mapManager.startNodeId);
            const endNode = graph.nodes.get(mapManager.endNodeId);
            ui.updateTelemetry(newRoutes, startNode, endNode);

            if (pathChanged) {
                ui.showBanner(`⚡ Traffic light changed! Dijkstra rerouted via faster alternative (New ETA: ~${newRoutes.dijkstra.estimatedTimeMin} min).`, 'info');
                ui.addTimelineEvent(`⚡ Dynamic Reroute: Signal change triggered path recalculation via alternative corridor.`, 'warning');

                // Smoothly update vehicle path mid-drive
                if (vehicle.isPlaying) {
                    vehicle.updateRouteCoordinates(newRoutes.dijkstra.coordinates);
                }
            }
        }
    }

    // 5. Search Bar Autocomplete Integration
    if (ui.elements.searchInput) {
        ui.elements.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query.length === 0) {
                ui.elements.btnClearSearch.classList.add('hidden');
                ui.elements.searchDropdown.classList.add('hidden');
                ui.elements.searchDropdown.innerHTML = '';
                return;
            }

            ui.elements.btnClearSearch.classList.remove('hidden');
            const matches = poiManager.search(query);

            if (matches.length === 0) {
                ui.elements.searchDropdown.innerHTML = `<div class="search-result-item"><span class="search-item-title">No locations found</span></div>`;
                ui.elements.searchDropdown.classList.remove('hidden');
                return;
            }

            ui.elements.searchDropdown.innerHTML = matches.map(m => `
                <div class="search-result-item" data-id="${m.id}" data-lat="${m.lat}" data-lng="${m.lng}" data-node="${m.nearestNode || m.nodeId || ''}">
                    <span class="search-item-icon">${m.icon || '📍'}</span>
                    <div class="search-item-info">
                        <div class="search-item-title">${m.title}</div>
                        <div class="search-item-subtitle">${m.subtitle}</div>
                    </div>
                    <div class="search-item-actions">
                        <button class="btn btn-sm btn-quick-start" title="Set as Start">🟢 Start</button>
                        <button class="btn btn-sm btn-quick-dest" title="Set as Destination">🔴 Dest</button>
                    </div>
                </div>
            `).join('');

            ui.elements.searchDropdown.classList.remove('hidden');

            // Wire click handlers for search result buttons
            ui.elements.searchDropdown.querySelectorAll('.search-result-item').forEach(item => {
                const lat = parseFloat(item.dataset.lat);
                const lng = parseFloat(item.dataset.lng);
                const targetNodeId = item.dataset.node;

                const btnStart = item.querySelector('.btn-quick-start');
                const btnDest = item.querySelector('.btn-quick-dest');

                function resolveNode() {
                    let node = targetNodeId ? graph.nodes.get(targetNodeId) : null;
                    if (!node) {
                        const candidate = graph.findNearestRoadAndNode(lat, lng);
                        node = candidate?.node;
                    }
                    return node;
                }

                if (btnStart) {
                    btnStart.onclick = (ev) => {
                        ev.stopPropagation();
                        const node = resolveNode();
                        if (node) setOriginNode(node, lat, lng);
                        ui.elements.searchDropdown.classList.add('hidden');
                    };
                }

                if (btnDest) {
                    btnDest.onclick = (ev) => {
                        ev.stopPropagation();
                        const node = resolveNode();
                        if (node) setDestinationNode(node, lat, lng);
                        ui.elements.searchDropdown.classList.add('hidden');
                    };
                }

                item.onclick = () => {
                    mapManager.map.flyTo([lat, lng], 16, { duration: 0.8 });
                    ui.elements.searchDropdown.classList.add('hidden');
                };
            });
        });
    }

    // Hide search dropdown on outer click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            ui.elements.searchDropdown?.classList.add('hidden');
        }
    });

    // 6. Routing Mode Switch Listener
    ui.elements.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (currentRoutesResult) {
                mapManager.renderRoutes(currentRoutesResult, mode);
                const startNode = graph.nodes.get(mapManager.startNodeId);
                const endNode = graph.nodes.get(mapManager.endNodeId);
                ui.updateTelemetry(currentRoutesResult, startNode, endNode);
            }
        });
    });

    // 7. Vehicle Simulation Controls
    ui.elements.btnVehiclePlay?.addEventListener('click', () => {
        const activeRoute = (ui.currentMode === 'normal') ? currentRoutesResult?.normal : currentRoutesResult?.dijkstra;

        if (!activeRoute || !activeRoute.success || !activeRoute.coordinates) {
            ui.showBanner('⚠️ Calculate a valid route before starting vehicle simulation.', 'warning');
            return;
        }

        if (vehicle.isPaused) {
            vehicle.resume();
            ui.showBanner('🚗 Vehicle driving resumed.', 'info');
            ui.addTimelineEvent('🚗 Vehicle drive resumed.');
            return;
        }

        ui.showBanner(`🚗 Vehicle animating along road coordinates (${activeRoute.label})...`, 'info');
        ui.addTimelineEvent(`🚗 Vehicle departed from [${activeRoute.startNode?.name || 'Origin'}] along ${activeRoute.label}.`);

        vehicle.start(
            activeRoute.coordinates,
            () => {
                ui.showBanner('🏁 Vehicle reached Destination successfully!', 'success');
                ui.addTimelineEvent(`🏁 Arrived at Destination [${activeRoute.targetNode?.name || 'Destination'}]!`);
                ui.updateVehicleProgress(100);
            },
            (prog) => {
                ui.updateVehicleProgress(prog);
            }
        );
    });

    ui.elements.btnVehiclePause?.addEventListener('click', () => {
        vehicle.pause();
        ui.showBanner('⏸️ Vehicle simulation paused.', 'info');
        ui.addTimelineEvent('⏸️ Vehicle simulation paused.');
    });

    ui.elements.btnVehicleReset?.addEventListener('click', () => {
        vehicle.reset();
        ui.updateVehicleProgress(0);
        ui.showBanner('⏹️ Vehicle reset to origin.', 'info');
    });

    ui.elements.btnVehicleReplay?.addEventListener('click', () => {
        const activeRoute = (ui.currentMode === 'normal') ? currentRoutesResult?.normal : currentRoutesResult?.dijkstra;
        if (!activeRoute || !activeRoute.success) return;

        vehicle.reset();
        ui.updateVehicleProgress(0);
        ui.addTimelineEvent('🔁 Replaying route from start.');

        setTimeout(() => {
            vehicle.start(
                activeRoute.coordinates,
                () => {
                    ui.showBanner('🏁 Replay completed!', 'success');
                    ui.updateVehicleProgress(100);
                },
                (prog) => {
                    ui.updateVehicleProgress(prog);
                }
            );
        }, 150);
    });

    ui.elements.speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            ui.elements.speedBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const speed = parseFloat(btn.dataset.speed);
            vehicle.setSpeed(speed);
            ui.showBanner(`Vehicle animation speed set to ${speed}x.`, 'info');
        });
    });

    ui.elements.checkFollowVehicle?.addEventListener('change', (e) => {
        vehicle.setFollowVehicle(e.target.checked);
    });

    // 8. Toolbar Actions
    ui.elements.btnRunDijkstra?.addEventListener('click', () => {
        calculateAndRenderRoutes();
    });

    ui.elements.btnFitRoute?.addEventListener('click', () => {
        const activeRoute = (ui.currentMode === 'normal') ? currentRoutesResult?.normal : currentRoutesResult?.dijkstra;
        if (activeRoute && activeRoute.coordinates) {
            mapManager.fitRoute(activeRoute.coordinates);
        } else {
            mapManager.map.setView([17.4225, 78.4720], 14);
        }
    });

    ui.elements.btnClearRoute?.addEventListener('click', () => {
        mapManager.clearRoutes();
        vehicle.reset();
        currentRoutesResult = null;
        navigationState.clearRoutes();
        ui.updateTelemetry(null, graph.nodes.get(mapManager.startNodeId), graph.nodes.get(mapManager.endNodeId));
        ui.updateVehicleProgress(0);
        ui.showBanner('🧹 Route cleared.', 'info');
    });

    ui.elements.btnReset?.addEventListener('click', () => {
        mapManager.clearRoutes();
        mapManager.clearMarkers();
        vehicle.reset();
        graph.resetState();
        mapManager.renderRoadNetwork();
        currentRoutesResult = null;
        navigationState.reset();
        ui.clearTimeline();
        ui.updateTelemetry(null, null, null);
        ui.updateVehicleProgress(0);
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

    ui.elements.togglePOIs?.addEventListener('change', (e) => {
        poiManager.setVisibility(e.target.checked);
    });

    // 9. Step-by-Step Dijkstra Algorithm Visualizer
    ui.elements.btnVisualizeDijkstra?.addEventListener('click', async () => {
        if (!mapManager.startNodeId || !mapManager.endNodeId) {
            ui.showBanner('⚠️ Select Start and Destination before visualizing Dijkstra.', 'warning');
            return;
        }

        if (isVisualizing) return;

        isVisualizing = true;
        vizAbort = false;
        mapManager.clearRoutes();
        vehicle.reset();

        ui.elements.vizOverlayPanel.classList.remove('hidden');
        ui.setStatusBadge('EXPLORING', 'badge-calculating');

        const result = DijkstraRouter.findShortestPath(
            graph,
            mapManager.startNodeId,
            mapManager.endNodeId,
            { costType: 'fastest', recordSteps: true }
        );

        if (!result.steps || result.steps.length === 0) {
            isVisualizing = false;
            ui.elements.vizOverlayPanel.classList.add('hidden');
            return;
        }

        const vizLayer = L.layerGroup().addTo(mapManager.map);
        ui.elements.vizNodesCount.textContent = result.nodesExploredCount;
        ui.elements.vizEdgesCount.textContent = result.edgesEvaluatedCount;

        for (let i = 0; i < result.steps.length; i++) {
            if (vizAbort) break;
            const step = result.steps[i];

            ui.elements.vizStepCounter.textContent = `Step ${i + 1}/${result.steps.length}`;
            ui.elements.vizStepDesc.textContent = step.description;

            if (step.cost !== undefined) {
                ui.elements.vizCurrentCost.textContent = step.cost.toFixed(1);
            }

            if (step.type === 'visit') {
                const node = graph.nodes.get(step.nodeId);
                if (node) {
                    L.circleMarker([node.lat, node.lng], {
                        radius: 7,
                        fillColor: '#facc15',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 0.95
                    }).addTo(vizLayer);
                }
            } else if (step.type === 'relax') {
                const toNode = graph.nodes.get(step.toId);
                if (toNode) {
                    L.circleMarker([toNode.lat, toNode.lng], {
                        radius: 6,
                        fillColor: '#38bdf8',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 0.85
                    }).addTo(vizLayer);
                }
            }

            await new Promise(r => setTimeout(r, 220));
        }

        setTimeout(() => {
            mapManager.map.removeLayer(vizLayer);
            ui.elements.vizOverlayPanel.classList.add('hidden');
            isVisualizing = false;

            if (result.success) {
                calculateAndRenderRoutes();
                ui.showBanner(`🏁 Dijkstra exploration complete! Final optimal cost: <b>${result.cost}</b>.`, 'success');
            }
        }, 900);
    });

    ui.elements.btnStopViz?.addEventListener('click', () => {
        vizAbort = true;
    });

    // 10. Pre-Configured College Evaluator Demo Mode
    ui.elements.btnDemoMode?.addEventListener('click', async () => {
        // Step 1: Clean reset
        graph.resetState();
        mapManager.clearRoutes();
        mapManager.clearMarkers();
        vehicle.reset();
        ui.clearTimeline();

        ui.showBanner('🌟 <b>Demo Mode Loaded:</b> Setting up presentation scenario...', 'info');

        // Step 2: Set Origin (Lakdikapul) & Destination (Paradise Circle)
        const startNode = graph.nodes.get('lakdikapul');
        const endNode = graph.nodes.get('paradise');

        setOriginNode(startNode);
        setDestinationNode(endNode);

        // Step 3: Compute initial routes in Compare Mode
        ui.setActiveMode('compare');
        const routes = calculateAndRenderRoutes();
        mapManager.fitRoute(routes.dijkstra.coordinates);

        ui.showBanner('🌟 <b>Step 1:</b> Lakdikapul → Paradise Circle! Showing both Normal Route (blue) and Dijkstra Fastest (green).', 'success');
        ui.addTimelineEvent('🌟 Demo initialized: Comparing Lakdikapul → Paradise Circle routes.');

        // Step 4: Launch Vehicle along Dijkstra Route
        setTimeout(() => {
            ui.showBanner('🚗 <b>Step 2:</b> Vehicle driving along Dijkstra Route...', 'info');
            vehicle.start(
                routes.dijkstra.coordinates,
                () => {
                    ui.showBanner('🏁 Demo Scenario Complete: Arrived at Paradise Circle!', 'success');
                    ui.addTimelineEvent('🏁 Demo Scenario: Vehicle reached Paradise Circle!');
                    ui.updateVehicleProgress(100);
                },
                (prog) => {
                    ui.updateVehicleProgress(prog);
                }
            );
        }, 800);

        // Step 5: After 3.5 seconds, simulate congested RED light on Tank Bund South & activate Lower Tank Bund shortcut
        setTimeout(() => {
            const tbSig = graph.roadNetwork.signals?.['sig_tankbund_south'];
            if (tbSig) tbSig.state = 'RED';

            const tbNode = graph.nodes.get('tankbund_south');
            if (tbNode) tbNode.trafficState = 'red';

            // Activate Lower Tank Bund Express Shortcut
            const shortcutEdge = graph.edges.get('lower_tankbund--kavadiguda');
            if (shortcutEdge) {
                shortcutEdge.shortcut = true;
                shortcutEdge.roadType = 'shortcut';
                shortcutEdge.speedKmh = 65;
            }
            const revShortcut = graph.edges.get('kavadiguda--lower_tankbund');
            if (revShortcut) {
                revShortcut.shortcut = true;
                revShortcut.roadType = 'shortcut';
                revShortcut.speedKmh = 65;
            }

            mapManager.renderRoadNetwork();

            // Trigger Dynamic Recalculation
            handleDynamicTrafficRecalculate();
            ui.showBanner('🚨 <b>Step 3:</b> Signal at Tank Bund turned RED! Dijkstra instantly detected congestion and rerouted vehicle via Lower Tank Bund Express Shortcut!', 'warning');
            ui.addTimelineEvent('🚨 Severe RED signal at Tank Bund (+60s). Dijkstra dynamically switched to Lower Tank Bund Express Shortcut!', 'warning');
        }, 3600);
    });

    // Initial update
    ui.resetTelemetryValues();
});
