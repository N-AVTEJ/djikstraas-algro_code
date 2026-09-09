/**
 * ============================================================================
 * USER INTERFACE & TELEMETRY CONTROLLER (js/ui.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Manages toolbar interaction modes & active tool indicators.
 * 2. Updates Route Telemetry & Statistics HUD dynamically.
 * 3. Controls vehicle animation playback, speeds, and camera follow modes.
 * 4. Renders "How Dijkstra Works" educational panel and About modal.
 * 5. Displays contextual feedback notifications and status badges.
 */

class UIManager {
    constructor() {
        this.elements = {
            // Tools
            toolBtns: document.querySelectorAll('.tool-btn'),
            btnStart: document.getElementById('toolStart'),
            btnEnd: document.getElementById('toolEnd'),
            btnTrafficLight: document.getElementById('toolTrafficLight'),
            btnShortcut: document.getElementById('toolShortcut'),
            btnBlock: document.getElementById('toolBlock'),
            btnSelect: document.getElementById('toolSelect'),

            // Actions
            btnRunDijkstra: document.getElementById('btnRunDijkstra'),
            btnVisualizeDijkstra: document.getElementById('btnVisualizeDijkstra'),
            btnFitRoute: document.getElementById('btnFitRoute'),
            btnDemoMode: document.getElementById('btnDemoMode'),
            btnReset: document.getElementById('btnReset'),
            btnClearRoute: document.getElementById('btnClearRoute'),

            // Vehicle Controls
            btnVehiclePlay: document.getElementById('btnVehiclePlay'),
            btnVehiclePause: document.getElementById('btnVehiclePause'),
            btnVehicleReset: document.getElementById('btnVehicleReset'),
            vehicleSpeedSelect: document.getElementById('vehicleSpeedSelect'),
            checkFollowVehicle: document.getElementById('checkFollowVehicle'),

            // Toggles
            toggleGraph: document.getElementById('toggleGraphOverlay'),
            toggleAutoTraffic: document.getElementById('toggleAutoTraffic'),

            // Info & Badges
            infoBanner: document.getElementById('infoBanner'),
            routeStatusBadge: document.getElementById('routeStatusBadge'),

            // Telemetry Counters
            statStartLoc: document.getElementById('statStartLoc'),
            statEndLoc: document.getElementById('statEndLoc'),
            statDistance: document.getElementById('statDistance'),
            statCost: document.getElementById('statCost'),
            statGraphNodes: document.getElementById('statGraphNodes'),
            statPathNodes: document.getElementById('statPathNodes'),
            statTrafficLights: document.getElementById('statTrafficLights'),
            statShortcuts: document.getElementById('statShortcuts'),
            statBlockedRoads: document.getElementById('statBlockedRoads'),
            statCalcTime: document.getElementById('statCalcTime'),

            // Modals & Drawers
            btnToggleExplainer: document.getElementById('btnToggleExplainer'),
            explainerDrawer: document.getElementById('explainerDrawer'),
            btnCloseExplainer: document.getElementById('btnCloseExplainer'),
            btnAbout: document.getElementById('btnAbout'),
            aboutModal: document.getElementById('aboutModal'),
            btnCloseAbout: document.getElementById('btnCloseAbout')
        };

        this.currentTool = 'start';
        this.initEventListeners();
    }

    initEventListeners() {
        // Tool button selection
        this.elements.toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setActiveTool(btn.dataset.tool);
            });
        });

        // Educational Drawer toggle
        if (this.elements.btnToggleExplainer && this.elements.explainerDrawer) {
            this.elements.btnToggleExplainer.addEventListener('click', () => {
                this.elements.explainerDrawer.classList.toggle('open');
            });
        }
        if (this.elements.btnCloseExplainer && this.elements.explainerDrawer) {
            this.elements.btnCloseExplainer.addEventListener('click', () => {
                this.elements.explainerDrawer.classList.remove('open');
            });
        }

        // About Modal
        if (this.elements.btnAbout && this.elements.aboutModal) {
            this.elements.btnAbout.addEventListener('click', () => {
                this.elements.aboutModal.classList.remove('hidden');
            });
        }
        if (this.elements.btnCloseAbout && this.elements.aboutModal) {
            this.elements.btnCloseAbout.addEventListener('click', () => {
                this.elements.aboutModal.classList.add('hidden');
            });
        }
    }

    setActiveTool(toolName) {
        this.currentTool = toolName;
        this.elements.toolBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        const descriptions = {
            'start': '🔵 Set Start: Click on or near any road to snap origin point.',
            'end': '🟣 Set Destination: Click on or near any road to snap destination.',
            'traffic-light': '🚦 Traffic Light: Click an intersection to add/remove a traffic signal.',
            'shortcut': '🟢 Express Shortcut: Click any road segment to toggle 0.5x high-speed corridor.',
            'block': '🧱 Block Road: Click any road to toggle blockade (Weight: ∞).',
            'select': '🔍 Inspect: Click roads or intersections to view properties.'
        };

        this.showBanner(descriptions[toolName] || 'Select an interaction tool.');
    }

    showBanner(message, type = 'info') {
        if (!this.elements.infoBanner) return;
        this.elements.infoBanner.className = `info-banner banner-${type}`;
        this.elements.infoBanner.innerHTML = message;
    }

    setStatusBadge(text, stateClass) {
        if (!this.elements.routeStatusBadge) return;
        this.elements.routeStatusBadge.className = `status-badge ${stateClass}`;
        this.elements.routeStatusBadge.textContent = text;
    }

    updateTelemetry(routeResult, graph, startNode, endNode) {
        // Update Start & Destination
        if (this.elements.statStartLoc) {
            this.elements.statStartLoc.textContent = startNode 
                ? `${startNode.name} (${startNode.lat.toFixed(4)}, ${startNode.lng.toFixed(4)})` 
                : 'None Selected';
        }
        if (this.elements.statEndLoc) {
            this.elements.statEndLoc.textContent = endNode 
                ? `${endNode.name} (${endNode.lat.toFixed(4)}, ${endNode.lng.toFixed(4)})` 
                : 'None Selected';
        }

        // Total Graph Nodes
        if (this.elements.statGraphNodes) {
            this.elements.statGraphNodes.textContent = graph ? graph.nodes.size : '--';
        }

        // Count active blocked roads
        let blockedCount = 0;
        if (graph) {
            const counted = new Set();
            for (const [, e] of graph.edges) {
                const key = [e.from, e.to].sort().join('--');
                if (!counted.has(key) && (e.blocked || e.roadType === 'blocked')) {
                    blockedCount++;
                    counted.add(key);
                }
            }
        }
        if (this.elements.statBlockedRoads) {
            this.elements.statBlockedRoads.textContent = blockedCount;
        }

        if (routeResult && routeResult.success) {
            if (this.elements.statDistance) this.elements.statDistance.textContent = `${routeResult.totalDistanceKm} km`;
            if (this.elements.statCost) this.elements.statCost.textContent = routeResult.totalCost.toFixed(2);
            if (this.elements.statPathNodes) this.elements.statPathNodes.textContent = routeResult.stepCount;
            if (this.elements.statTrafficLights) this.elements.statTrafficLights.textContent = routeResult.trafficLightCount;
            if (this.elements.statShortcuts) this.elements.statShortcuts.textContent = routeResult.shortcutCount;
            if (this.elements.statCalcTime) this.elements.statCalcTime.textContent = `${routeResult.calcTimeMs} ms`;
            this.setStatusBadge('OPTIMAL ROUTE', 'badge-ready');
        } else if (routeResult && !routeResult.success) {
            if (this.elements.statDistance) this.elements.statDistance.textContent = '--';
            if (this.elements.statCost) this.elements.statCost.textContent = '∞';
            if (this.elements.statPathNodes) this.elements.statPathNodes.textContent = '--';
            if (this.elements.statTrafficLights) this.elements.statTrafficLights.textContent = '--';
            if (this.elements.statShortcuts) this.elements.statShortcuts.textContent = '--';
            if (this.elements.statCalcTime) this.elements.statCalcTime.textContent = `${routeResult.calcTimeMs || 0} ms`;
            this.setStatusBadge('NO ROUTE', 'badge-error');
        } else {
            if (this.elements.statDistance) this.elements.statDistance.textContent = '--';
            if (this.elements.statCost) this.elements.statCost.textContent = '--';
            if (this.elements.statPathNodes) this.elements.statPathNodes.textContent = '--';
            if (this.elements.statTrafficLights) this.elements.statTrafficLights.textContent = '--';
            if (this.elements.statShortcuts) this.elements.statShortcuts.textContent = '--';
            if (this.elements.statCalcTime) this.elements.statCalcTime.textContent = '--';
            this.setStatusBadge('IDLE', 'badge-idle');
        }
    }
}
