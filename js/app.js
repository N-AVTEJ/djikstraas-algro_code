/**
 * ============================================================================
 * APPLICATION MASTER CONTROLLER (js/app.js)
 * ============================================================================
 *
 * Master Orchestrator:
 * - CityRoadGraph (js/graph.js)
 * - LeafletMapManager (js/map.js)
 * - RoutingManager (js/routing.js)
 * - TrafficLightController (js/traffic.js)
 * - VehicleNavigator (js/vehicle.js)
 * - POIManager (js/pois.js)
 * - UIManager (js/ui.js)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Instantiate Core Subsystems
    const graph = new CityRoadGraph();
    const mapManager = new LeafletMapManager('map', graph);
    const routingManager = new RoutingManager(graph);
    const vehicle = new VehicleNavigator(mapManager.map);
    const ui = new UIManager();

    let currentRoutes = null;
    let isVisualizing = false;
    let vizAbortController = null;

    // 2. Instantiate POI & Search Engine
    const poiManager = new POIManager(mapManager.map, (nodeId, type) => {
        const node = graph.nodes.get(nodeId);
        if (!node) return;

        if (type === 'start') {
            mapManager.setStartMarker(node);
            ui.updateTripLabels(node, mapManager.endNodeId ? graph.nodes.get(mapManager.endNodeId) : null);
            ui.showBanner(`🟢 Start set to: <b>${node.name}</b>`, 'success');
            ui.addTimelineEvent(`Selected start location: ${node.name}`);
            if (mapManager.endNodeId) calculateAndRenderRoutes();
        } else if (type === 'end') {
            mapManager.setEndMarker(node);
            ui.updateTripLabels(mapManager.startNodeId ? graph.nodes.get(mapManager.startNodeId) : null, node);
            ui.showBanner(`🔴 Destination set to: <b>${node.name}</b>`, 'success');
            ui.addTimelineEvent(`Selected destination: ${node.name}`);
            if (mapManager.startNodeId) calculateAndRenderRoutes();
        }
    });

    // 3. Traffic Light Manager & Dynamic 3-Second Recalculation
    const trafficController = new TrafficLightController(graph, (event) => {
        // Re-render visual traffic light state icons on map
        mapManager.renderRoadNetwork();

        // If an active route exists, trigger dynamic rerouting evaluation
        if (mapManager.startNodeId && mapManager.endNodeId && !isVisualizing) {
            handleDynamicTrafficRecalculate();
        }
    });

    // Start automated 3-second traffic light cycle
    trafficController.start();

    // 4. Map Click & Snapping Listeners
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
                ui.showBanner('⚠️ Click nearer to a road in the Hyderabad network.', 'warning');
                return;
            }

            // Show animated snap ripple
            mapManager.showSnapIndicator(lat, lng, candidate.snappedLat, candidate.snappedLng);

            if (tool === 'start') {
                mapManager.setStartMarker(candidate.node);
                const endNode = mapManager.endNodeId ? graph.nodes.get(mapManager.endNodeId) : null;
                ui.updateTripLabels(candidate.node, endNode);
                ui.showBanner(`🟢 Start snapped to road at: <b>${candidate.node.name}</b>`, 'success');
                ui.addTimelineEvent(`Snapped start to road: ${candidate.node.name}`);
                if (mapManager.endNodeId) calculateAndRenderRoutes();
            } else if (tool === 'end') {
                mapManager.setEndMarker(candidate.node);
                const startNode = mapManager.startNodeId ? graph.nodes.get(mapManager.startNodeId) : null;
                ui.updateTripLabels(startNode, candidate.node);
                ui.showBanner(`🔴 Destination snapped to road at: <b>${candidate.node.name}</b>`, 'success');
                ui.addTimelineEvent(`Snapped destination to road: ${candidate.node.name}`);
                if (mapManager.startNodeId) calculateAndRenderRoutes();
            }
        } else if (tool === 'traffic-light') {
            const candidate = graph.findNearestRoadAndNode(lat, lng);
            if (candidate && candidate.node) handleNodeClick(candidate.node);
        } else if (tool === 'shortcut' || tool === 'block') {
            const candidate = graph.findNearestRoadAndNode(lat, lng);
            if (candidate && candidate.edge) handleEdgeClick(candidate.edge);
        }
    }

    function handleNodeClick(node) {
        if (isVisualizing) return;
        const tool = ui.currentTool;

        switch (tool) {
            case 'start':
                mapManager.setStartMarker(node);
                ui.updateTripLabels(node, mapManager.endNodeId ? graph.nodes.get(mapManager.endNodeId) : null);
                ui.showBanner(`🟢 Start set to: <b>${node.name}</b>`, 'success');
                ui.addTimelineEvent(`Start: ${node.name}`);
                if (mapManager.endNodeId) calculateAndRenderRoutes();
                break;

            case 'end':
                mapManager.setEndMarker(node);
                ui.updateTripLabels(mapManager.startNodeId ? graph.nodes.get(mapManager.startNodeId) : null, node);
                ui.showBanner(`🔴 Destination set to: <b>${node.name}</b>`, 'success');
                ui.addTimelineEvent(`Destination: ${node.name}`);
                if (mapManager.startNodeId) calculateAndRenderRoutes();
                break;

            case 'traffic-light':
                if (node.trafficLight) {
                    // Cycle: Green -> Yellow -> Red -> Green
                    trafficController.switchLight(node.id);
                    mapManager.renderRoadNetwork();
                    ui.showBanner(`🚦 Switched signal at <b>${node.name}</b> to <b>${node.trafficState.toUpperCase()}</b>`, 'info');
                    ui.addTimelineEvent(`Traffic light at ${node.name} switched to ${node.trafficState.toUpperCase()}`);
                } else {
                    trafficController.toggleTrafficLight(node.id);
                    mapManager.renderRoadNetwork();
                    ui.showBanner(`🚦 Added Traffic Signal at <b>${node.name}</b>`, 'info');
                    ui.addTimelineEvent(`Added traffic signal at ${node.name}`);
                }
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoutes();
                break;

            case 'block':
                node.blocked = !node.blocked;
                mapManager.renderRoadNetwork();
                ui.showBanner(`🚧 ${node.blocked ? 'Blocked' : 'Unblocked'} intersection: <b>${node.name}</b>`, 'warning');
                ui.addTimelineEvent(`${node.blocked ? 'Blocked' : 'Unblocked'} intersection ${node.name}`);
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoutes();
                break;

            case 'inspect':
            default:
                ui.showBanner(`📍 Intersection: <b>${node.name}</b> | Signal: ${node.trafficLight ? node.trafficState.toUpperCase() : 'None'} | Blocked: ${node.blocked}`, 'info');
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

                mapManager.renderRoadNetwork();
                ui.showBanner(`🚧 ${edge.blocked ? 'Blocked road' : 'Unblocked road'}: <b>${edge.name}</b>`, 'warning');
                ui.addTimelineEvent(`Road blockade toggled on ${edge.name}`);
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoutes();
                break;

            case 'shortcut':
                edge.roadType = edge.roadType === 'shortcut' ? 'normal' : 'shortcut';
                edge.speedKmH = edge.roadType === 'shortcut' ? 65 : 45;
                const revShortcut = graph.edges.get(`${edge.to}--${edge.from}`);
                if (revShortcut) {
                    revShortcut.roadType = edge.roadType;
                    revShortcut.speedKmH = edge.speedKmH;
                }

                mapManager.renderRoadNetwork();
                const isShort = edge.roadType === 'shortcut';
                ui.showBanner(`⚡ ${isShort ? 'Enabled Express Shortcut (65 km/h bypass)' : 'Restored Normal Road'}: <b>${edge.name}</b>`, 'success');
                ui.addTimelineEvent(`Shortcut ${isShort ? 'enabled' : 'disabled'} on ${edge.name}`);
                if (mapManager.startNodeId && mapManager.endNodeId) calculateAndRenderRoutes();
                break;

            case 'inspect':
            default:
                ui.showBanner(`🛣️ Road: <b>${edge.name}</b> | Speed: ${edge.speedKmH} km/h | Dist: ${edge.distance} km | Blocked: ${edge.blocked}`, 'info');
                break;
        }
    }

    // 5. Dual Route Calculation & Rendering
    function calculateAndRenderRoutes(recordSteps = false) {
        if (!mapManager.startNodeId || !mapManager.endNodeId) {
            ui.showBanner('⚠️ Please select both a Start and Destination point.', 'warning');
            return null;
        }

        ui.setStatusBadge('CALCULATING', 'badge-calculating');

        const routes = routingManager.computeRoutes(
            mapManager.startNodeId,
            mapManager.endNodeId,
            recordSteps
        );

        currentRoutes = routes;
        mapManager.clearRoutes();

        const mode = ui.currentMode; // 'normal' | 'dijkstra' | 'compare'
        const dijkstraRes = routes.dijkstra;
        const normalRes = routes.normal;

        if (dijkstraRes.success) {
            if (mode === 'normal') {
                if (normalRes.success) {
                    mapManager.renderNormalRoute(normalRes.roadCoordinates);
                    ui.setStatusBadge('NORMAL ROUTE', 'badge-ready');
                    ui.showBanner(`🔵 Displaying Normal Road Route (${normalRes.totalDistanceKm} km, ~${normalRes.estimatedTimeMin} min).`, 'info');
                }
            } else if (mode === 'dijkstra') {
                mapManager.renderDijkstraRoute(dijkstraRes.roadCoordinates);
                ui.setStatusBadge('OPTIMAL ROUTE', 'badge-ready');
                ui.showBanner(`🟢 Dijkstra Fastest Route found! Est. Time: <b>${dijkstraRes.estimatedTimeMin} min</b> | Distance: <b>${dijkstraRes.totalDistanceKm} km</b>.`, 'success');
            } else if (mode === 'compare') {
                if (normalRes.success) mapManager.renderNormalRoute(normalRes.roadCoordinates);
                mapManager.renderDijkstraRoute(dijkstraRes.roadCoordinates);
                ui.setStatusBadge('COMPARING', 'badge-ready');
                ui.showBanner(`⚖️ Comparing Routes: Normal (Blue) vs Dijkstra Fastest (Green). Time Saved: <b>${routes.comparison?.timeSavedMin || 0} min</b>.`, 'success');
            }

            ui.updateComparisonAndExplainability(routes.comparison);
            ui.updateTelemetry(dijkstraRes);
        } else {
            ui.setStatusBadge('NO ROUTE', 'badge-error');
            ui.showBanner(`⚠️ ${dijkstraRes.error}`, 'error');
            ui.updateComparisonAndExplainability(null);
            vehicle.reset();
        }

        return routes;
    }

    // 6. Dynamic Traffic Recalculation
    function handleDynamicTrafficRecalculate() {
        if (!mapManager.startNodeId || !mapManager.endNodeId) return;

        const prevDijkstra = currentRoutes?.dijkstra;
        const prevPathKey = prevDijkstra?.pathNodeIds?.join('->');
        const prevTime = prevDijkstra?.estimatedTimeMin;

        const routes = routingManager.computeRoutes(mapManager.startNodeId, mapManager.endNodeId);
        const newDijkstra = routes.dijkstra;

        if (newDijkstra.success) {
            const newPathKey = newDijkstra.pathNodeIds.join('->');
            const pathChanged = prevPathKey !== newPathKey;
            const timeChanged = prevTime !== newDijkstra.estimatedTimeMin;

            if (pathChanged || timeChanged) {
                currentRoutes = routes;

                // Re-render according to active mode
                mapManager.clearRoutes();
                if (ui.currentMode === 'normal' && routes.normal.success) {
                    mapManager.renderNormalRoute(routes.normal.roadCoordinates);
                } else if (ui.currentMode === 'compare') {
                    if (routes.normal.success) mapManager.renderNormalRoute(routes.normal.roadCoordinates);
                    mapManager.renderDijkstraRoute(newDijkstra.roadCoordinates);
                } else {
                    mapManager.renderDijkstraRoute(newDijkstra.roadCoordinates);
                }

                ui.updateComparisonAndExplainability(routes.comparison);
                ui.updateTelemetry(newDijkstra);

                if (pathChanged) {
                    ui.showBanner(`⚡ Traffic signal changed — Dijkstra recalculated route! New ETA: <b>${newDijkstra.estimatedTimeMin} min</b>`, 'info');
                    ui.addTimelineEvent(`Signal change triggered dynamic reroute (ETA: ${newDijkstra.estimatedTimeMin}m)`);

                    // Seamlessly update moving vehicle
                    if (vehicle.isPlaying) {
                        vehicle.updateRouteCoordinates(newDijkstra.roadCoordinates);
                    }
                }
            }
        }
    }

    // 7. Search Input & Instant Autocomplete
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

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            ui.elements.searchDropdown?.classList.add('hidden');
        }
    });

    // 8. Vehicle Controls & Animation
    ui.elements.btnVehiclePlay?.addEventListener('click', () => {
        const targetRoute = ui.currentMode === 'normal' ? currentRoutes?.normal : currentRoutes?.dijkstra;

        if (!targetRoute || !targetRoute.success) {
            ui.showBanner('⚠️ Calculate a valid route before starting the vehicle.', 'warning');
            return;
        }

        if (vehicle.isPaused) {
            vehicle.resume();
            ui.showBanner('🚗 Resumed vehicle simulation.', 'info');
            return;
        }

        ui.showBanner('🚗 Vehicle driving smoothly along road coordinates...', 'info');
        vehicle.start(
            targetRoute.roadCoordinates,
            () => {
                ui.showBanner('🏁 Vehicle reached Destination successfully!', 'success');
            },
            (percent) => {
                ui.updateProgressBar(percent);
            }
        );
    });

    ui.elements.btnVehiclePause?.addEventListener('click', () => {
        vehicle.pause();
        ui.showBanner('⏸️ Simulation paused.', 'info');
    });

    ui.elements.btnVehicleReset?.addEventListener('click', () => {
        vehicle.reset();
        ui.updateProgressBar(0);
        ui.showBanner('⏹️ Vehicle reset to origin.', 'info');
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

    // 9. Routing Mode Selector Buttons
    ui.elements.btnModeNormal?.addEventListener('click', () => {
        if (currentRoutes) calculateAndRenderRoutes();
    });
    ui.elements.btnModeDijkstra?.addEventListener('click', () => {
        if (currentRoutes) calculateAndRenderRoutes();
    });
    ui.elements.btnModeCompare?.addEventListener('click', () => {
        if (currentRoutes) calculateAndRenderRoutes();
    });

    // 10. Toolbar Action Buttons
    ui.elements.btnCalculateRoute?.addEventListener('click', () => {
        calculateAndRenderRoutes();
    });

    ui.elements.btnSwapLocations?.addEventListener('click', () => {
        if (!mapManager.startNodeId && !mapManager.endNodeId) return;

        const oldStart = mapManager.startNodeId ? graph.nodes.get(mapManager.startNodeId) : null;
        const oldEnd = mapManager.endNodeId ? graph.nodes.get(mapManager.endNodeId) : null;

        mapManager.clearMarkers();
        if (oldEnd) mapManager.setStartMarker(oldEnd);
        if (oldStart) mapManager.setEndMarker(oldStart);

        ui.updateTripLabels(oldEnd, oldStart);
        ui.addTimelineEvent('Swapped start and destination points');
        if (oldEnd && oldStart) calculateAndRenderRoutes();
    });

    ui.elements.btnFitRoute?.addEventListener('click', () => {
        const targetRoute = currentRoutes?.dijkstra || currentRoutes?.normal;
        if (targetRoute && targetRoute.roadCoordinates) {
            mapManager.fitRoute(targetRoute.roadCoordinates);
        } else {
            mapManager.map.setView([17.4225, 78.4720], 14);
        }
    });

    ui.elements.btnClearRoute?.addEventListener('click', () => {
        mapManager.clearRoutes();
        vehicle.reset();
        currentRoutes = null;
        ui.updateComparisonAndExplainability(null);
        ui.updateProgressBar(0);
        ui.setStatusBadge('READY', 'badge-idle');
        ui.showBanner('🧹 Cleared active routes.', 'info');
    });

    ui.elements.btnResetAll?.addEventListener('click', () => {
        mapManager.clearRoutes();
        vehicle.reset();
        mapManager.clearMarkers();
        graph.resetState();
        mapManager.renderRoadNetwork();
        currentRoutes = null;
        ui.updateTripLabels(null, null);
        ui.updateComparisonAndExplainability(null);
        ui.updateProgressBar(0);
        ui.resetTimeline();
        ui.setStatusBadge('READY', 'badge-idle');
        ui.showBanner('🔄 Reset all network modifications, shortcuts, and routes to initial state.', 'info');
    });

    // 11. Toggles (Show Graph, Auto Traffic, Show POIs, POI Category Chips)
    ui.elements.toggleShowGraph?.addEventListener('change', (e) => {
        mapManager.setGraphOverlayVisibility(e.target.checked);
        ui.showBanner(e.target.checked ? '👁️ Graph nodes & road connections overlay ON' : '🗺️ Graph overlay hidden. Showing clean navigation map.', 'info');
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

    ui.elements.categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            ui.elements.categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            poiManager.setCategoryFilter(chip.dataset.category);
        });
    });

    // 12. College Presentation Demo Scenarios
    ui.elements.demoScenarioSelect?.addEventListener('change', (e) => {
        const scenario = e.target.value;
        loadDemoScenario(scenario);
    });

    function loadDemoScenario(scenarioKey) {
        // Reset to clean state first
        graph.resetState();
        mapManager.clearRoutes();
        vehicle.reset();
        ui.resetTimeline();

        if (scenarioKey === 'lakdikapul_paradise') {
            // Origin: Lakdikapul Junction
            const start = graph.nodes.get('lakdikapul');
            mapManager.setStartMarker(start);

            // Destination: Paradise Circle
            const end = graph.nodes.get('paradise');
            mapManager.setEndMarker(end);

            ui.updateTripLabels(start, end);

            // Scenario condition: Tank Bund South is RED (+75s delay)
            const tbSouth = graph.nodes.get('tankbund_south');
            if (tbSouth) {
                tbSouth.trafficLight = true;
                tbSouth.trafficState = 'red';
            }

            // Lower Tank Bund Express Bypass is active shortcut (65 km/h)
            const shortcutEdge = graph.edges.get('lower_tankbund--kavadiguda');
            if (shortcutEdge) {
                shortcutEdge.roadType = 'shortcut';
                shortcutEdge.speedKmH = 65;
            }

            mapManager.renderRoadNetwork();

            // Compute routes in Compare mode to show difference!
            ui.setActiveMode('compare');
            const routes = calculateAndRenderRoutes();

            if (routes?.dijkstra?.success) {
                mapManager.fitRoute(routes.dijkstra.roadCoordinates);
                ui.showBanner('🌟 <b>Demo Loaded:</b> Lakdikapul → Paradise Circle! Notice how Dijkstra takes the Lower Tank Bund Bypass to avoid the Red signal at Tank Bund South.', 'success');
                ui.addTimelineEvent('Loaded Lakdikapul → Paradise presentation scenario');

                // Launch vehicle drive automatically
                setTimeout(() => {
                    vehicle.start(routes.dijkstra.roadCoordinates, null, (p) => ui.updateProgressBar(p));
                }, 500);
            }
        } else if (scenarioKey === 'secretariat_begumpet') {
            const start = graph.nodes.get('secretariat');
            const end = graph.nodes.get('begumpet');
            mapManager.setStartMarker(start);
            mapManager.setEndMarker(end);
            ui.updateTripLabels(start, end);
            mapManager.renderRoadNetwork();
            ui.setActiveMode('dijkstra');
            const routes = calculateAndRenderRoutes();
            if (routes?.dijkstra?.success) {
                mapManager.fitRoute(routes.dijkstra.roadCoordinates);
                ui.showBanner('🌟 <b>Demo Loaded:</b> Secretariat → Begumpet Flyover via lakeside corridor.', 'success');
            }
        } else if (scenarioKey === 'nampally_ameerpet') {
            const start = graph.nodes.get('nampally');
            const end = graph.nodes.get('ameerpet');
            mapManager.setStartMarker(start);
            mapManager.setEndMarker(end);
            ui.updateTripLabels(start, end);
            mapManager.renderRoadNetwork();
            ui.setActiveMode('dijkstra');
            const routes = calculateAndRenderRoutes();
            if (routes?.dijkstra?.success) {
                mapManager.fitRoute(routes.dijkstra.roadCoordinates);
                ui.showBanner('🌟 <b>Demo Loaded:</b> Nampally Station → Ameerpet Metro.', 'success');
            }
        }
    }

    // 13. Step-by-Step Dijkstra Algorithm Visualizer
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
        mapManager.clearRoutes();
        vehicle.reset();
        ui.setStatusBadge('EXPLORING', 'badge-calculating');

        const result = DijkstraRouter.findPath(
            graph,
            mapManager.startNodeId,
            mapManager.endNodeId,
            { mode: 'fastest', recordSteps: true }
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
                const node = graph.nodes.get(step.nodeId);
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
                const toNode = graph.nodes.get(step.toId);
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
            await new Promise(r => setTimeout(r, 180));
        }

        setTimeout(() => {
            mapManager.map.removeLayer(vizLayer);
            isVisualizing = false;
            if (result.success) {
                calculateAndRenderRoutes();
                ui.showBanner(`🏁 Dijkstra exploration completed! Optimal travel time: <b>${result.estimatedTimeMin} min</b>`, 'success');
            }
        }, 600);
    });

    // Initialize timeline
    ui.resetTimeline();
});
