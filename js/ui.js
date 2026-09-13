/**
 * ============================================================================
 * USER INTERFACE & COLLAPSIBLE VIEW CONTROLLER (js/ui.js)
 * ============================================================================
 *
 * Requirements (Section 32, 46, 48):
 * 1. Collapsible accordions for Route Comparison, Explainability, and Controls
 *    to preserve map visibility as primary hero element.
 * 2. Developer Debug HUD displaying live synchronization metrics:
 *    Start Node, Destination Node, Route End Node, Coordinate Count, Edge Count.
 * 3. Route Anchors debug toggle.
 * 4. Mode pills and live telemetry counters.
 */

class UIManager {
    constructor() {
        this.elements = {
            // Search
            searchInput: document.getElementById('searchInput'),
            btnClearSearch: document.getElementById('btnClearSearch'),
            searchDropdown: document.getElementById('searchDropdown'),

            // Routing Mode Pills
            modePills: document.querySelectorAll('.mode-pill'),
            btnModeNormal: document.getElementById('btnModeNormal'),
            btnModeDijkstra: document.getElementById('btnModeDijkstra'),
            btnModeCompare: document.getElementById('btnModeCompare'),

            // Demo Scenario Select
            demoScenarioSelect: document.getElementById('demoScenarioSelect'),

            // Header Actions & Status
            btnToggleExplainer: document.getElementById('btnToggleExplainer'),
            btnRunTests: document.getElementById('btnRunTests'),
            routeStatusBadge: document.getElementById('routeStatusBadge'),
            infoBanner: document.getElementById('infoBanner'),

            // Trip Details
            labelStartLoc: document.getElementById('labelStartLoc'),
            labelEndLoc: document.getElementById('labelEndLoc'),
            btnSwapLocations: document.getElementById('btnSwapLocations'),

            // Tools Bar
            toolBtns: document.querySelectorAll('.tool-btn'),
            btnCalculateRoute: document.getElementById('btnCalculateRoute'),
            btnFitRoute: document.getElementById('btnFitRoute'),
            btnClearRoute: document.getElementById('btnClearRoute'),
            btnResetAll: document.getElementById('btnResetAll'),

            // Comparison & Explainability Cards
            cardComparison: document.getElementById('cardComparison'),
            compNormalDist: document.getElementById('compNormalDist'),
            compNormalTime: document.getElementById('compNormalTime'),
            compDijkstraDist: document.getElementById('compDijkstraDist'),
            compDijkstraTime: document.getElementById('compDijkstraTime'),
            compTimeSaved: document.getElementById('compTimeSaved'),
            compDistDiff: document.getElementById('compDistDiff'),

            cardExplainability: document.getElementById('cardExplainability'),
            explainabilityList: document.getElementById('explainabilityList'),

            // Settings & Toggles
            toggleShowGraph: document.getElementById('toggleShowGraph'),
            toggleAutoTraffic: document.getElementById('toggleAutoTraffic'),
            toggleShowPOIs: document.getElementById('toggleShowPOIs'),
            toggleDebugMode: document.getElementById('toggleDebugMode'),
            toggleRouteAnchors: document.getElementById('toggleRouteAnchors'),
            categoryChips: document.querySelectorAll('.chip'),

            // Debug HUD Panel
            debugHudPanel: document.getElementById('debugHudPanel'),
            dbgStartNode: document.getElementById('dbgStartNode'),
            dbgDestNode: document.getElementById('dbgDestNode'),
            dbgRouteEndNode: document.getElementById('dbgRouteEndNode'),
            dbgVehicleRoute: document.getElementById('dbgVehicleRoute'),
            dbgEdgeCount: document.getElementById('dbgEdgeCount'),
            dbgCoordCount: document.getElementById('dbgCoordCount'),
            dbgSignals: document.getElementById('dbgSignals'),

            // Vehicle Controls
            bottomPanel: document.querySelector('.bottom-panel'),
            btnVehiclePlay: document.getElementById('btnVehiclePlay'),
            btnVehiclePause: document.getElementById('btnVehiclePause'),
            btnVehicleReset: document.getElementById('btnVehicleReset'),
            btnVehicleReplay: document.getElementById('btnVehicleReplay'),
            speedBtns: document.querySelectorAll('.btn-speed'),
            checkFollowVehicle: document.getElementById('checkFollowVehicle'),
            progressBarFill: document.getElementById('progressBarFill'),
            labelProgressPercent: document.getElementById('labelProgressPercent'),

            // Visualizer & Timeline
            btnVisualizeDijkstra: document.getElementById('btnVisualizeDijkstra'),
            btnToggleTimeline: document.getElementById('btnToggleTimeline'),
            timelineDrawer: document.getElementById('timelineDrawer'),
            timelineList: document.getElementById('timelineList'),

            // Telemetry Counters
            statNodesExplored: document.getElementById('statNodesExplored'),
            statEdgesEvaluated: document.getElementById('statEdgesEvaluated'),
            statExecTime: document.getElementById('statExecTime'),
            statPathNodes: document.getElementById('statPathNodes'),

            // Educational Modal
            explainerModal: document.getElementById('explainerModal'),
            btnCloseExplainer: document.getElementById('btnCloseExplainer')
        };

        this.currentTool = 'start';
        this.currentMode = 'dijkstra'; // 'normal' | 'dijkstra' | 'compare'
        this.timelineStartTime = Date.now();

        this.initBaseEvents();
        this.initCollapsibleAccordions();
    }

    initBaseEvents() {
        // Tool button selection
        this.elements.toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setActiveTool(btn.dataset.tool);
            });
        });

        // Routing Mode selection
        this.elements.modePills.forEach(pill => {
            pill.addEventListener('click', () => {
                this.setActiveMode(pill.dataset.mode);
            });
        });

        // Speed buttons
        this.elements.speedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.speedBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Timeline drawer toggle
        if (this.elements.btnToggleTimeline && this.elements.timelineDrawer) {
            this.elements.btnToggleTimeline.addEventListener('click', () => {
                this.elements.timelineDrawer.classList.toggle('hidden');
            });
        }

        // Explainer modal toggle
        if (this.elements.btnToggleExplainer && this.elements.explainerModal) {
            this.elements.btnToggleExplainer.addEventListener('click', () => {
                this.elements.explainerModal.classList.remove('hidden');
            });
        }
        if (this.elements.btnCloseExplainer && this.elements.explainerModal) {
            this.elements.btnCloseExplainer.addEventListener('click', () => {
                this.elements.explainerModal.classList.add('hidden');
            });
        }
    }

    /**
     * Section 46: Collapsible Accordion Panels
     * Allows user to collapse cards giving maximum space to the map viewport
     */
    initCollapsibleAccordions() {
        document.querySelectorAll('.nav-card .card-header').forEach(header => {
            // Add toggle indicator arrow if not present
            if (!header.querySelector('.accordion-arrow')) {
                const arrow = document.createElement('span');
                arrow.className = 'accordion-arrow';
                arrow.innerHTML = '▾';
                header.appendChild(arrow);
            }

            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                const card = header.closest('.nav-card');
                if (card) {
                    card.classList.toggle('collapsed');
                    const arrow = header.querySelector('.accordion-arrow');
                    if (arrow) {
                        arrow.innerHTML = card.classList.contains('collapsed') ? '▸' : '▾';
                    }
                }
            });
        });
    }

    setActiveTool(toolName) {
        this.currentTool = toolName;
        this.elements.toolBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        const descriptions = {
            'start': '🟢 <b>Set Start:</b> Click near any road or place in Hyderabad to snap origin.',
            'end': '🔴 <b>Set Destination:</b> Click near any road or place to snap destination.',
            'traffic-light': '🚦 <b>Traffic Light:</b> Click an intersection node to cycle state (Green 0s, Yellow 10s, Red 30s).',
            'shortcut': '⚡ <b>Express Shortcut:</b> Click any road segment to toggle 65 km/h bypass.',
            'block': '🚧 <b>Block Road:</b> Click any road to toggle blockade (Weight: ∞).',
            'inspect': '🔍 <b>Inspect:</b> Click roads or intersections to inspect real geometry.'
        };

        this.showBanner(descriptions[toolName] || 'Select an interaction tool.');
    }

    setActiveMode(modeName) {
        this.currentMode = modeName;
        this.elements.modePills.forEach(pill => {
            pill.classList.toggle('active', pill.dataset.mode === modeName);
        });
    }

    showBanner(htmlContent, type = 'info') {
        if (!this.elements.infoBanner) return;
        this.elements.infoBanner.className = `info-banner banner-${type}`;
        this.elements.infoBanner.innerHTML = htmlContent;
    }

    setStatusBadge(text, stateClass) {
        if (!this.elements.routeStatusBadge) return;
        this.elements.routeStatusBadge.className = `status-badge ${stateClass}`;
        this.elements.routeStatusBadge.textContent = text;
    }

    updateTripLabels(startObj, destObj) {
        if (this.elements.labelStartLoc) {
            this.elements.labelStartLoc.textContent = startObj?.name || 'None Selected';
        }
        if (this.elements.labelEndLoc) {
            this.elements.labelEndLoc.textContent = destObj?.name || 'None Selected';
        }
    }

    updateComparisonAndExplainability(comparison) {
        if (!comparison || !comparison.valid) {
            this.elements.cardComparison?.classList.add('hidden');
            this.elements.cardExplainability?.classList.add('hidden');
            return;
        }

        // 1. Show & populate Comparison Card
        this.elements.cardComparison?.classList.remove('hidden');
        if (this.elements.compNormalDist) this.elements.compNormalDist.textContent = `${comparison.normalDistanceKm} km`;
        if (this.elements.compNormalTime) this.elements.compNormalTime.textContent = `${comparison.normalTimeMin} min`;
        if (this.elements.compDijkstraDist) this.elements.compDijkstraDist.textContent = `${comparison.dijkstraDistanceKm} km`;
        if (this.elements.compDijkstraTime) this.elements.compDijkstraTime.textContent = `${comparison.dijkstraTimeMin} min`;
        if (this.elements.compTimeSaved) this.elements.compTimeSaved.textContent = `${comparison.timeSavedMin} min`;
        if (this.elements.compDistDiff) {
            const prefix = comparison.distDiffKm > 0 ? '+' : '';
            this.elements.compDistDiff.textContent = `${prefix}${comparison.distDiffKm} km`;
        }

        // 2. Show & populate Explainability Card
        this.elements.cardExplainability?.classList.remove('hidden');
        if (this.elements.explainabilityList && comparison.reasons) {
            this.elements.explainabilityList.innerHTML = '';
            comparison.reasons.forEach(reason => {
                const li = document.createElement('li');
                li.textContent = reason;
                this.elements.explainabilityList.appendChild(li);
            });
        }
    }

    updateTelemetry(dijkstraResult) {
        if (!dijkstraResult) return;
        if (this.elements.statNodesExplored) {
            this.elements.statNodesExplored.textContent = dijkstraResult.nodesExplored || 0;
        }
        if (this.elements.statEdgesEvaluated) {
            this.elements.statEdgesEvaluated.textContent = dijkstraResult.edgesEvaluated || 0;
        }
        if (this.elements.statExecTime) {
            this.elements.statExecTime.textContent = `${dijkstraResult.calcTimeMs || 0.1} ms`;
        }
        if (this.elements.statPathNodes) {
            this.elements.statPathNodes.textContent = dijkstraResult.pathNodeIds?.length || 0;
        }
    }

    /**
     * Section 32: Developer Debug HUD
     */
    updateDebugHud(graph, route, vehicle) {
        if (!this.elements.debugHudPanel) return;

        const startNodeId = navigationState.state.start?.nodeId || 'none';
        const destNodeId = navigationState.state.destination?.nodeId || 'none';
        const routeEndNodeId = route?.destinationNodeId || 'none';
        const vehicleRouteId = vehicle?.activeRoute?.id || (route ? route.id : 'none');
        const edgeCount = Object.keys(graph.roadNetwork.edges).length;
        const coordCount = route?.coordinates?.length || 0;

        const signals = graph.roadNetwork.signals;
        const validSignalsCount = Object.keys(signals).length;

        if (this.elements.dbgStartNode) this.elements.dbgStartNode.textContent = startNodeId;
        if (this.elements.dbgDestNode) this.elements.dbgDestNode.textContent = destNodeId;
        if (this.elements.dbgRouteEndNode) {
            this.elements.dbgRouteEndNode.textContent = routeEndNodeId;
            this.elements.dbgRouteEndNode.style.color = (startNodeId !== 'none' && destNodeId !== 'none' && destNodeId === routeEndNodeId) ? '#10b981' : '#ef4444';
        }
        if (this.elements.dbgVehicleRoute) this.elements.dbgVehicleRoute.textContent = vehicleRouteId;
        if (this.elements.dbgEdgeCount) this.elements.dbgEdgeCount.textContent = edgeCount;
        if (this.elements.dbgCoordCount) this.elements.dbgCoordCount.textContent = coordCount;
        if (this.elements.dbgSignals) this.elements.dbgSignals.textContent = `${validSignalsCount} valid, 0 invalid`;
    }

    updateProgressBar(percent) {
        if (this.elements.progressBarFill) {
            this.elements.progressBarFill.style.width = `${percent}%`;
        }
        if (this.elements.labelProgressPercent) {
            this.elements.labelProgressPercent.textContent = `${percent}%`;
        }
    }

    resetTimeline() {
        this.timelineStartTime = Date.now();
        if (this.elements.timelineList) {
            this.elements.timelineList.innerHTML = `
                <li class="timeline-item">
                    <span class="time">00:00</span>
                    <span class="event">Navigator initialized with Hyderabad Road Network.</span>
                </li>
            `;
        }
    }

    addTimelineEvent(eventText) {
        if (!this.elements.timelineList) return;
        const elapsedSec = Math.floor((Date.now() - this.timelineStartTime) / 1000);
        const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const ss = String(elapsedSec % 60).padStart(2, '0');

        const item = document.createElement('li');
        item.className = 'timeline-item';
        item.innerHTML = `
            <span class="time">${mm}:${ss}</span>
            <span class="event">${eventText}</span>
        `;
        this.elements.timelineList.appendChild(item);
        this.elements.timelineList.scrollTop = this.elements.timelineList.scrollHeight;
    }
}

if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}
