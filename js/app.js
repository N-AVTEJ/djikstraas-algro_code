/**
 * ============================================================================
 * APPLICATION MASTER CONTROLLER (js/app.js)
 * ============================================================================
 *
 * Master Orchestrator for CITYNAV:
 * - GeoUtils (js/geoUtils.js)
 * - CityRoadGraph (js/graph.js)
 * - NavigationStateManager (js/navigationState.js)
 * - LeafletMapManager (js/map.js)
 * - RoutingManager (js/routing.js)
 * - TrafficLightController (js/traffic.js)
 * - VehicleNavigator (js/vehicle.js)
 * - POIManager (js/pois.js)
 * - UIManager (js/ui.js)
 * - CityNavTestSuite (js/tests.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[CITYNAV] Initializing CityNav Navigation Simulator Engine...');

    // 1. Instantiate Core Subsystems
    const graph = new CityRoadGraph();
    const mapManager = new LeafletMapManager('map', graph);
    const routingManager = new RoutingManager(graph);
    const vehicle = new VehicleNavigator(mapManager.map);
    const ui = new UIManager();
    const testSuite = new CityNavTestSuite(graph, routingManager, vehicle, mapManager);

    let isVisualizing = false;
    let vizAbortController = null;

    // 2. Synchronize navigationState changes with UI & Markers
    navigationState.addListener((type, state, data) => {
        ui.updateTripLabels(state.start, state.destination);
        ui.updateDebugHud(graph, state.activeRoute, vehicle);

        if (type === 'start_changed') {
            mapManager.updateStartMarker();
        } else if (type === 'destination_changed') {
            mapManager.updateDestinationMarker();
            mapManager.clearRoutes();
            vehicle.reset();
        } else if (type === 'routes_cleared') {
            mapManager.clearRoutes();
        } else if (type === 'reset') {
            mapManager.clearMarkers();
            mapManager.clearRoutes();
            vehicle.reset();
        }
    });

    // 3. Instantiate POI & Search Manager
    const poiManager = new POIManager(mapManager.map, (nodeId, type) => {
        const node = graph.roadNetwork.nodes[nodeId];
        if (!node) return;

        if (type === 'start') {
            navigationState.setStart(node);
            ui.showBanner(`🟢 Start set to: <b>${node.name}</b>`, 'success');
            ui.addTimelineEvent(`Selected start location: ${node.name}`);
            if (navigationState.state.destination.nodeId) calculateAndRenderRoutes();
        } else if (type === 'end') {
            navigationState.setDestination(node);
            ui.showBanner(`🔴 Destination set to: <b>${node.name}</b>`, 'success');
            ui.addTimelineEvent(`Selected destination: ${node.name}`);
            if (navigationState.state.start.nodeId) calculateAndRenderRoutes();
        }
    });

    // 4. Traffic Light Controller & 3-Second Automated Cycle (Section 18)
    const trafficController = new TrafficLightController(graph, (event) => {
        mapManager.renderRoadNetwork();

        // If an active route exists, evaluate dynamic rerouting
        if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId && !isVisualizing) {
            handleDynamicTrafficRecalculate();
        }
    });

    trafficController.start();

    // 5. Map Click & Road Snapping (Section 3 & 43)
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
            const snap = graph.snapPointToRoad(lat, lng);
            if (!snap.success || !snap.node) {
                ui.showBanner('⚠️ Please click closer to a road in the Central Hyderabad network.', 'warning');
                return;
            }

            mapManager.showSnapIndicator(lat, lng, snap.snappedLat, snap.snappedLng);

            if (tool === 'start') {
                navigationState.setStart(snap.node, [snap.snappedLat, snap.snappedLng]);
                ui.showBanner(`🟢 Start snapped to road at: <b>${snap.node.name}</b>`, 'success');
                ui.addTimelineEvent(`Snapped start to road: ${snap.node.name}`);
                if (navigationState.state.destination.nodeId) calculateAndRenderRoutes();
            } else if (tool === 'end') {
                navigationState.setDestination(snap.node, [snap.snappedLat, snap.snappedLng]);
                ui.showBanner(`🔴 Destination snapped to road at: <b>${snap.node.name}</b>`, 'success');
                ui.addTimelineEvent(`Snapped destination to road: ${snap.node.name}`);
                if (navigationState.state.start.nodeId) calculateAndRenderRoutes();
            }
        } else if (tool === 'traffic-light') {
            const snap = graph.snapPointToRoad(lat, lng);
            if (snap.success && snap.node) handleNodeClick(snap.node);
        } else if (tool === 'shortcut' || tool === 'block') {
            const snap = graph.snapPointToRoad(lat, lng);
            if (snap.success && snap.edge) handleEdgeClick(snap.edge);
        }
    }

    function handleNodeClick(node) {
        if (isVisualizing) return;
        const tool = ui.currentTool;

        switch (tool) {
            case 'start':
                navigationState.setStart(node);
                ui.showBanner(`🟢 Start set to: <b>${node.name}</b>`, 'success');
                ui.addTimelineEvent(`Start: ${node.name}`);
                if (navigationState.state.destination.nodeId) calculateAndRenderRoutes();
                break;

            case 'end':
                navigationState.setDestination(node);
                ui.showBanner(`🔴 Destination set to: <b>${node.name}</b>`, 'success');
                ui.addTimelineEvent(`Destination: ${node.name}`);
                if (navigationState.state.start.nodeId) calculateAndRenderRoutes();
                break;

            case 'traffic-light':
                if (node.trafficSignalId) {
                    trafficController.switchLight(node.id);
                    mapManager.renderRoadNetwork();
                    const sig = graph.roadNetwork.signals[node.trafficSignalId];
                    ui.showBanner(`🚦 Switched signal at <b>${node.name}</b> to <b>${sig.state}</b> (+${sig.delays[sig.state.toLowerCase()]}s delay)`, 'info');
                    ui.addTimelineEvent(`Traffic light at ${node.name} switched to ${sig.state}`);
                } else {
                    const res = trafficController.toggleTrafficLight(node.id);
                    if (res) {
                        mapManager.renderRoadNetwork();
                        ui.showBanner(`🚦 Added Traffic Signal at <b>${node.name}</b> (Green 0s, Yellow 10s, Red 30s)`, 'info');
                        ui.addTimelineEvent(`Added traffic signal at ${node.name}`);
                    } else {
                        ui.showBanner(`⚠️ Cannot place signal: Intersection must have >= 2 connected road edges.`, 'warning');
                    }
                }
                if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'block':
                node.blocked = !node.blocked;
                mapManager.renderRoadNetwork();
                ui.showBanner(`🚧 ${node.blocked ? 'Blocked' : 'Unblocked'} intersection: <b>${node.name}</b>`, 'warning');
                ui.addTimelineEvent(`${node.blocked ? 'Blocked' : 'Unblocked'} intersection ${node.name}`);
                if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'inspect':
            default:
                const sig = node.trafficSignalId ? graph.roadNetwork.signals[node.trafficSignalId] : null;
                ui.showBanner(`📍 Intersection: <b>${node.name}</b> | Connected Roads: ${node.connectedEdges?.length || 0} | Signal: ${sig ? sig.state : 'None'} | Blocked: ${node.blocked}`, 'info');
                break;
        }
    }

    function handleEdgeClick(edge) {
        if (isVisualizing) return;
        const tool = ui.currentTool;

        switch (tool) {
            case 'block':
                edge.blocked = !edge.blocked;
                mapManager.renderRoadNetwork();
                ui.showBanner(`🚧 ${edge.blocked ? 'Blocked road' : 'Unblocked road'}: <b>${edge.name}</b> (Weight: ${edge.blocked ? '∞' : edge.distanceKm + 'km'})`, 'warning');
                ui.addTimelineEvent(`Road blockade toggled on ${edge.name}`);
                if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'shortcut':
                edge.shortcut = !edge.shortcut;
                edge.roadType = edge.shortcut ? 'shortcut' : 'normal';
                edge.speedKmh = edge.shortcut ? 65 : 45;
                mapManager.renderRoadNetwork();
                ui.showBanner(`⚡ ${edge.shortcut ? 'Enabled Express Shortcut (65 km/h bypass)' : 'Restored Normal Road'}: <b>${edge.name}</b>`, 'success');
                ui.addTimelineEvent(`Shortcut ${edge.shortcut ? 'enabled' : 'disabled'} on ${edge.name}`);
                if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
                    calculateAndRenderRoutes();
                }
                break;

            case 'inspect':
            default:
                ui.showBanner(`🛣️ Road: <b>${edge.name}</b> | Speed: ${edge.speedKmh} km/h | Dist: ${edge.distanceKm} km | Blocked: ${edge.blocked}`, 'info');
                break;
        }
    }

    // 6. Dual Route Calculation & Rendering (Sections 4, 21, 22, 48)
    function calculateAndRenderRoutes(recordSteps = false) {
        const startNodeId = navigationState.state.start.nodeId;
        const targetNodeId = navigationState.state.destination.nodeId;

        if (!startNodeId || !targetNodeId) {
            ui.showBanner('⚠️ Please select both a Start and Destination point.', 'warning');
            return null;
        }

        ui.setStatusBadge('CALCULATING', 'badge-calculating');

        const routes = routingManager.computeRoutes(startNodeId, targetNodeId, recordSteps);
        mapManager.clearRoutes();

        const mode = ui.currentMode; // 'normal' | 'dijkstra' | 'compare'
        const dijkstraRes = routes.dijkstra;
        const normalRes = routes.normal;

        if (routes.success && dijkstraRes && dijkstraRes.success) {
            // Section 48: Mode Display Rule
            if (mode === 'normal') {
                if (normalRes && normalRes.success) {
                    mapManager.renderNormalRoute(normalRes);
                    ui.setStatusBadge('NORMAL ROUTE', 'badge-ready');
                    ui.showBanner(`🔵 Displaying Normal Route (${normalRes.distanceKm} km, ~${normalRes.estimatedTimeMin} min).`, 'info');
                }
            } else if (mode === 'dijkstra') {
                mapManager.renderDijkstraRoute(dijkstraRes);
                ui.setStatusBadge('OPTIMAL ROUTE', 'badge-ready');
                ui.showBanner(`🟢 Dijkstra Fastest Route found! Est. Time: <b>${dijkstraRes.estimatedTimeMin} min</b> | Distance: <b>${dijkstraRes.distanceKm} km</b>.`, 'success');
            } else if (mode === 'compare') {
                if (normalRes && normalRes.success) mapManager.renderNormalRoute(normalRes);
                mapManager.renderDijkstraRoute(dijkstraRes);
                ui.setStatusBadge('COMPARING', 'badge-ready');
                ui.showBanner(`⚖️ Comparing Routes: Normal (Blue) vs Dijkstra Fastest (Green). Time Saved: <b>${routes.comparison?.timeSavedMin || 0} min</b>.`, 'success');
            }

            ui.updateComparisonAndExplainability(routes.comparison);
            ui.updateTelemetry(dijkstraRes);
            ui.updateDebugHud(graph, dijkstraRes, vehicle);

            // Fit map bounds to route
            const activeCoords = mode === 'normal' ? normalRes?.coordinates : dijkstraRes?.coordinates;
            if (activeCoords) mapManager.fitRoute(activeCoords);
        } else {
            ui.setStatusBadge('NO ROUTE', 'badge-error');
            const errMsg = dijkstraRes?.error || routes.error || 'No route found.';
            ui.showBanner(`⚠️ ${errMsg}`, 'error');
            ui.updateComparisonAndExplainability(null);
            vehicle.reset();
            ui.updateDebugHud(graph, null, vehicle);
        }

        return routes;
    }

    // 7. Dynamic Traffic Recalculation & Vehicle Synchronization (Section 12, 18, 40)
    function handleDynamicTrafficRecalculate() {
        const startNodeId = navigationState.state.start.nodeId;
        const targetNodeId = navigationState.state.destination.nodeId;
        if (!startNodeId || !targetNodeId) return;

        const prevDijkstra = navigationState.state.dijkstraRoute;
        const prevPathKey = prevDijkstra?.pathNodeIds?.join('->');
        const prevTime = prevDijkstra?.estimatedTimeMin;

        const routes = routingManager.computeRoutes(startNodeId, targetNodeId);
        const newDijkstra = routes.dijkstra;

        if (newDijkstra && newDijkstra.success) {
            const newPathKey = newDijkstra.pathNodeIds.join('->');
            const pathChanged = prevPathKey !== newPathKey;
            const timeChanged = prevTime !== newDijkstra.estimatedTimeMin;

            if (pathChanged || timeChanged) {
                mapManager.clearRoutes();

                if (ui.currentMode === 'normal' && routes.normal?.success) {
                    mapManager.renderNormalRoute(routes.normal);
                } else if (ui.currentMode === 'compare') {
                    if (routes.normal?.success) mapManager.renderNormalRoute(routes.normal);
                    mapManager.renderDijkstraRoute(newDijkstra);
                } else {
                    mapManager.renderDijkstraRoute(newDijkstra);
                }

                ui.updateComparisonAndExplainability(routes.comparison);
                ui.updateTelemetry(newDijkstra);
                ui.updateDebugHud(graph, newDijkstra, vehicle);

                if (pathChanged) {
                    ui.showBanner(`⚡ Traffic signal changed — Dijkstra recalculated route! New ETA: <b>${newDijkstra.estimatedTimeMin} min</b>`, 'info');
                    ui.addTimelineEvent(`Signal change triggered dynamic reroute (ETA: ${newDijkstra.estimatedTimeMin}m)`);

                    // Section 12 & 40: Seamlessly update moving vehicle from current position
                    if (vehicle.isPlaying) {
                        vehicle.updateRouteCoordinates(newDijkstra);
                    }
                }
            }
        }
    }

    // 8. Search Input & Autocomplete
    let searchDebounce = null;
    ui.elements.searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        const val = e.target.value;

        if (val.length > 0) {
            ui.elements.btnClearSearch?.classList.remove('hidden');
        } else {
            ui.elements.btnClearSearch?.classList.add('hidden');
            ui.elements.searchDropdown?.classList.add('hidden');
            return;
        }

        searchDebounce = setTimeout(() => {
            const results = poiManager.search(val);
            renderSearchResults(results);
        }, 150);
    });

    ui.elements.btnClearSearch?.addEventListener('click', () => {
        if (ui.elements.searchInput) ui.elements.searchInput.value = '';
        ui.elements.btnClearSearch?.classList.add('hidden');
        ui.elements.searchDropdown?.classList.add('hidden');
    });

    function renderSearchResults(results) {
        const dropdown = ui.elements.searchDropdown;
        if (!dropdown) return;

        if (!results || results.length === 0) {
            dropdown.innerHTML = `<div class="search-dropdown-item"><span class="search-item-desc">No places found matching query</span></div>`;
            dropdown.classList.remove('hidden');
            return;
        }

        dropdown.innerHTML = '';
        results.slice(0, 6).forEach(poi => {
            const item = document.createElement('div');
            item.className = 'search-dropdown-item';
            item.innerHTML = `
                <span class="search-item-icon">${poi.icon}</span>
                <div class="search-item-content">
                    <div class="search-item-title">${poi.name}</div>
                    <div class="search-item-desc">${poi.description}</div>
                </div>
                <span class="search-item-badge">${poi.category}</span>
            `;
            item.onclick = () => {
                dropdown.classList.add('hidden');
                poiManager.focusPOI(poi.id);
            };
            dropdown.appendChild(item);
        });

        dropdown.classList.remove('hidden');
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            ui.elements.searchDropdown?.classList.add('hidden');
        }
    });

    // 9. Vehicle Controls & Drive Simulation (Sections 8, 9, 10, 11, 41)
    ui.elements.btnVehiclePlay?.addEventListener('click', () => {
        const targetRoute = ui.currentMode === 'normal'
            ? navigationState.state.normalRoute
            : navigationState.state.dijkstraRoute;

        if (!targetRoute || !targetRoute.success) {
            ui.showBanner('⚠️ Calculate a valid route before starting vehicle drive.', 'warning');
            return;
        }

        if (vehicle.isPaused) {
            vehicle.resume();
            ui.showBanner('🚗 Resumed vehicle simulation.', 'info');
            return;
        }

        ui.showBanner('🚗 Vehicle driving smoothly along exact road coordinates...', 'info');
        vehicle.start(
            targetRoute,
            (result) => {
                // Section 41: Destination arrival message
                ui.showBanner(`🏁 <b>Arrived at ${result.destinationName}!</b> (Distance: ${result.distanceMeters.toFixed(1)}m)`, 'success');
            },
            (percent) => {
                ui.updateProgressBar(percent);
            }
        );

        ui.updateDebugHud(graph, targetRoute, vehicle);
    });

    ui.elements.btnVehiclePause?.addEventListener('click', () => {
        vehicle.pause();
        ui.showBanner('⏸️ Simulation paused.', 'info');
    });

    ui.elements.btnVehicleReset?.addEventListener('click', () => {
        vehicle.reset();
        ui.updateProgressBar(0);
        ui.showBanner('⏹️ Vehicle reset to origin.', 'info');
        ui.updateDebugHud(graph, navigationState.state.activeRoute, vehicle);
    });

    ui.elements.btnVehicleReplay?.addEventListener('click', () => {
        vehicle.replay();
        ui.showBanner('🔄 Replaying route simulation.', 'info');
    });

    ui.elements.speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            vehicle.setSpeed(btn.dataset.speed);
        });
    });

    ui.elements.checkFollowVehicle?.addEventListener('change', (e) => {
        vehicle.setFollowVehicle(e.target.checked);
    });

    vehicle.onTimelineEvent = (msg) => {
        ui.addTimelineEvent(msg);
    };

    // 10. Routing Mode Selector
    ui.elements.btnModeNormal?.addEventListener('click', () => {
        if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
            calculateAndRenderRoutes();
        }
    });
    ui.elements.btnModeDijkstra?.addEventListener('click', () => {
        if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
            calculateAndRenderRoutes();
        }
    });
    ui.elements.btnModeCompare?.addEventListener('click', () => {
        if (navigationState.state.start.nodeId && navigationState.state.destination.nodeId) {
            calculateAndRenderRoutes();
        }
    });

    // 11. Toolbar Action Buttons
    ui.elements.btnCalculateRoute?.addEventListener('click', () => {
        calculateAndRenderRoutes();
    });

    ui.elements.btnSwapLocations?.addEventListener('click', () => {
        if (navigationState.swapLocations()) {
            mapManager.updateStartMarker();
            mapManager.updateDestinationMarker();
            ui.addTimelineEvent('Swapped start and destination points');
            calculateAndRenderRoutes();
        }
    });

    ui.elements.btnFitRoute?.addEventListener('click', () => {
        const activeRoute = navigationState.state.activeRoute || navigationState.state.dijkstraRoute || navigationState.state.normalRoute;
        if (activeRoute && activeRoute.coordinates) {
            mapManager.fitRoute(activeRoute.coordinates);
        } else {
            mapManager.map.setView([17.4225, 78.4720], 14);
        }
    });

    ui.elements.btnClearRoute?.addEventListener('click', () => {
        navigationState.clearRoutes();
        vehicle.reset();
        ui.updateComparisonAndExplainability(null);
        ui.updateProgressBar(0);
        ui.setStatusBadge('READY', 'badge-idle');
        ui.showBanner('🧹 Cleared active routes.', 'info');
        ui.updateDebugHud(graph, null, vehicle);
    });

    ui.elements.btnResetAll?.addEventListener('click', () => {
        navigationState.reset();
        graph.resetState();
        vehicle.reset();
        mapManager.renderRoadNetwork();
        ui.updateTripLabels(null, null);
        ui.updateComparisonAndExplainability(null);
        ui.updateProgressBar(0);
        ui.resetTimeline();
        ui.setStatusBadge('READY', 'badge-idle');
        ui.showBanner('🔄 Reset all network modifications, shortcuts, and routes to initial state.', 'info');
        ui.updateDebugHud(graph, null, vehicle);
    });

    // 12. Settings & Debug Toggles (Section 32 & 33)
    ui.elements.toggleShowGraph?.addEventListener('change', (e) => {
        mapManager.setGraphOverlayVisibility(e.target.checked);
        ui.showBanner(e.target.checked ? '👁️ Graph nodes overlay ON' : '🗺️ Graph overlay hidden. Showing clean navigation map.', 'info');
    });

    ui.elements.toggleAutoTraffic?.addEventListener('change', (e) => {
        if (e.target.checked) {
            trafficController.start();
            ui.showBanner('🚦 Automated 3-second traffic light cycling active.', 'info');
        } else {
            trafficController.stop();
            ui.showBanner('🚦 Automated traffic cycling paused.', 'info');
        }
    });

    ui.elements.toggleShowPOIs?.addEventListener('change', (e) => {
        poiManager.setVisibility(e.target.checked);
    });

    ui.elements.toggleDebugMode?.addEventListener('change', (e) => {
        if (ui.elements.debugHudPanel) {
            ui.elements.debugHudPanel.classList.toggle('hidden', !e.target.checked);
        }
        ui.updateDebugHud(graph, navigationState.state.activeRoute, vehicle);
        ui.showBanner(e.target.checked ? '🛠️ Developer Debug HUD enabled' : '🛠️ Debug HUD hidden', 'info');
    });

    ui.elements.toggleRouteAnchors?.addEventListener('change', (e) => {
        mapManager.setRouteAnchorsVisibility(e.target.checked);
        ui.showBanner(e.target.checked ? '📍 Route Anchors overlay ON (START, DESTINATION, ROUTE START, ROUTE END)' : 'Route Anchors hidden', 'info');
    });

    ui.elements.categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            ui.elements.categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            poiManager.setCategoryFilter(chip.dataset.category);
        });
    });

    // 13. Run Automated Tests Button (Section 52)
    ui.elements.btnRunTests?.addEventListener('click', async () => {
        ui.showBanner('🧪 Executing automated test suite (14 tests)... Check Developer Console for live test telemetry.', 'info');
        ui.setStatusBadge('TESTING', 'badge-calculating');
        const res = await testSuite.runAllTests();
        if (res.allPassed) {
            ui.setStatusBadge('TESTS PASS', 'badge-ready');
            ui.showBanner(`🎉 <b>All ${res.total} Automated Tests PASSED!</b> Check browser console for full invariant log.`, 'success');
        } else {
            ui.setStatusBadge('TESTS FAILED', 'badge-error');
            ui.showBanner(`⚠️ Automated tests finished: ${res.passed}/${res.total} passed. Check console.`, 'error');
        }
    });

    // 14. Demo Presentation Presets
    ui.elements.demoScenarioSelect?.addEventListener('change', (e) => {
        const scenario = e.target.value;
        loadDemoScenario(scenario);
    });

    function loadDemoScenario(scenarioKey) {
        graph.resetState();
        navigationState.reset();
        vehicle.reset();
        ui.resetTimeline();

        if (scenarioKey === 'lakdikapul_paradise') {
            const start = graph.roadNetwork.nodes['lakdikapul'];
            const end = graph.roadNetwork.nodes['paradise'];
            navigationState.setStart(start);
            navigationState.setDestination(end);

            // Condition: Tank Bund South is RED (+30s delay)
            const tbSig = graph.roadNetwork.signals['sig_tankbund_south'];
            if (tbSig) tbSig.state = 'RED';

            // Lower Tank Bund Express Bypass is active shortcut (65 km/h)
            const shortcutEdge = graph.roadNetwork.edges['lower_tankbund--kavadiguda'];
            if (shortcutEdge) {
                shortcutEdge.shortcut = true;
                shortcutEdge.speedKmh = 65;
            }

            mapManager.renderRoadNetwork();
            ui.setActiveMode('compare');
            const routes = calculateAndRenderRoutes();

            if (routes?.dijkstra?.success) {
                mapManager.fitRoute(routes.dijkstra.coordinates);
                ui.showBanner('🌟 <b>Demo Loaded:</b> Lakdikapul → Paradise Circle! Dijkstra takes the Lower Tank Bund Bypass to avoid the Red signal at Tank Bund South.', 'success');
                ui.addTimelineEvent('Loaded Lakdikapul → Paradise presentation scenario');

                setTimeout(() => {
                    vehicle.start(routes.dijkstra, null, (p) => ui.updateProgressBar(p));
                }, 600);
            }
        } else if (scenarioKey === 'secretariat_begumpet') {
            const start = graph.roadNetwork.nodes['secretariat'];
            const end = graph.roadNetwork.nodes['begumpet'];
            navigationState.setStart(start);
            navigationState.setDestination(end);
            mapManager.renderRoadNetwork();
            ui.setActiveMode('dijkstra');
            const routes = calculateAndRenderRoutes();
            if (routes?.dijkstra?.success) {
                mapManager.fitRoute(routes.dijkstra.coordinates);
                ui.showBanner('🌟 <b>Demo Loaded:</b> Secretariat → Begumpet Flyover via lakeside corridor.', 'success');
            }
        } else if (scenarioKey === 'nampally_ameerpet') {
            const start = graph.roadNetwork.nodes['nampally'];
            const end = graph.roadNetwork.nodes['ameerpet'];
            navigationState.setStart(start);
            navigationState.setDestination(end);
            mapManager.renderRoadNetwork();
            ui.setActiveMode('dijkstra');
            const routes = calculateAndRenderRoutes();
            if (routes?.dijkstra?.success) {
                mapManager.fitRoute(routes.dijkstra.coordinates);
                ui.showBanner('🌟 <b>Demo Loaded:</b> Nampally Station → Ameerpet Metro.', 'success');
            }
        }
    }

    // 15. Dijkstra Step-by-Step Visualizer
    ui.elements.btnVisualizeDijkstra?.addEventListener('click', async () => {
        if (!navigationState.state.start.nodeId || !navigationState.state.destination.nodeId) {
            ui.showBanner('⚠️ Select Start and Destination before visualizing the algorithm.', 'warning');
            return;
        }

        if (isVisualizing) {
            if (vizAbortController) vizAbortController.abort = true;
            return;
        }

        isVisualizing = true;
        vizAbortController = { abort: false };
        mapManager.clearRoutes();
        vehicle.reset();
        ui.setStatusBadge('EXPLORING', 'badge-calculating');

        const result = DijkstraRouter.findPath(
            graph,
            navigationState.state.start.nodeId,
            navigationState.state.destination.nodeId,
            { mode: 'dijkstra', recordSteps: true }
        );

        if (!result.steps || result.steps.length === 0) {
            isVisualizing = false;
            return;
        }

        ui.showBanner('🧠 Step-by-step Dijkstra node exploration in progress...', 'info');

        const vizLayer = L.layerGroup().addTo(mapManager.map);

        for (let i = 0; i < result.steps.length; i++) {
            if (vizAbortController.abort) break;
            const step = result.steps[i];

            if (step.type === 'visit') {
                const node = graph.roadNetwork.nodes[step.nodeId];
                if (node) {
                    L.circleMarker([node.lat, node.lng], {
                        radius: 7,
                        fillColor: '#f59e0b',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 0.9
                    }).addTo(vizLayer);
                }
            } else if (step.type === 'relax') {
                const toNode = graph.roadNetwork.nodes[step.toId];
                if (toNode) {
                    L.circleMarker([toNode.lat, toNode.lng], {
                        radius: 6,
                        fillColor: '#38bdf8',
                        color: '#ffffff',
                        weight: 2,
                        fillOpacity: 0.8
                    }).addTo(vizLayer);
                }
            }

            ui.showBanner(`Dijkstra Step ${i + 1}/${result.steps.length}: ${step.description}`, 'info');
            await new Promise(r => setTimeout(r, 160));
        }

        setTimeout(() => {
            mapManager.map.removeLayer(vizLayer);
            isVisualizing = false;
            if (result.success) {
                calculateAndRenderRoutes();
                ui.showBanner(`🏁 Dijkstra exploration completed! Optimal travel time: <b>${result.estimatedTimeMin} min</b>`, 'success');
            }
        }, 500);
    });

    // Initialize timeline & HUD
    ui.resetTimeline();
    ui.updateDebugHud(graph, null, vehicle);
});
