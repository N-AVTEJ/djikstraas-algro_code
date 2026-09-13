/**
 * ============================================================================
 * USER INTERFACE & TELEMETRY CONTROLLER (js/ui.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Manages toolbar interaction modes (Start, Destination, Traffic Light, Shortcut, Block).
 * 2. Manages routing modes (Normal, Dijkstra Fastest, Compare).
 * 3. Updates Side-by-Side Route Comparison & "Why This Route?" Explainability HUD.
 * 4. Controls vehicle playback, speeds, progress bar, and Route Event Timeline.
 * 5. Controls search autocomplete, educational drawer, and status toasts.
 */

class UIManager {
    constructor() {
        this.elements = {
            // Mode buttons
            modeBtns: document.querySelectorAll('.mode-btn'),
            modeNormal: document.getElementById('modeNormal'),
            modeDijkstra: document.getElementById('modeDijkstra'),
            modeCompare: document.getElementById('modeCompare'),
            routeModeIndicator: document.getElementById('routeModeIndicator'),

            // Snapping Tools
            toolBtns: document.querySelectorAll('.tool-btn'),
            toolStart: document.getElementById('toolStart'),
            toolEnd: document.getElementById('toolEnd'),
            toolTrafficLight: document.getElementById('toolTrafficLight'),
            toolShortcut: document.getElementById('toolShortcut'),
            toolBlock: document.getElementById('toolBlock'),
            toolSelect: document.getElementById('toolSelect'),

            // Search Box
            searchInput: document.getElementById('searchInput'),
            btnClearSearch: document.getElementById('btnClearSearch'),
            searchDropdown: document.getElementById('searchDropdown'),

            // Actions
            btnRunDijkstra: document.getElementById('btnRunDijkstra'),
            btnVisualizeDijkstra: document.getElementById('btnVisualizeDijkstra'),
            btnFitRoute: document.getElementById('btnFitRoute'),
            btnClearRoute: document.getElementById('btnClearRoute'),
            btnReset: document.getElementById('btnReset'),
            btnDemoMode: document.getElementById('btnDemoMode'),

            // Toggles
            toggleGraph: document.getElementById('toggleGraphOverlay'),
            toggleAutoTraffic: document.getElementById('toggleAutoTraffic'),
            togglePOIs: document.getElementById('togglePOIs'),

            // Info & Badges
            infoBanner: document.getElementById('infoBanner'),
            routeStatusBadge: document.getElementById('routeStatusBadge'),

            // Comparison & Telemetry Cards
            statStartLoc: document.getElementById('statStartLoc'),
            statEndLoc: document.getElementById('statEndLoc'),
            cmpNormalDist: document.getElementById('cmpNormalDist'),
            cmpNormalTime: document.getElementById('cmpNormalTime'),
            cmpDijkstraDist: document.getElementById('cmpDijkstraDist'),
            cmpDijkstraTime: document.getElementById('cmpDijkstraTime'),
            statTimeSaved: document.getElementById('statTimeSaved'),
            statDistDiff: document.getElementById('statDistDiff'),
            explainList: document.getElementById('explainList'),

            statDistance: document.getElementById('statDistance'),
            statETA: document.getElementById('statETA'),
            statCost: document.getElementById('statCost'),
            statTrafficLights: document.getElementById('statTrafficLights'),
            statShortcuts: document.getElementById('statShortcuts'),
            statCalcTime: document.getElementById('statCalcTime'),

            // Vehicle Simulator
            btnVehiclePlay: document.getElementById('btnVehiclePlay'),
            btnVehiclePause: document.getElementById('btnVehiclePause'),
            btnVehicleReset: document.getElementById('btnVehicleReset'),
            btnVehicleReplay: document.getElementById('btnVehicleReplay'),
            vehicleProgressBar: document.getElementById('vehicleProgressBar'),
            vehicleProgressBadge: document.getElementById('vehicleProgressBadge'),
            speedBtns: document.querySelectorAll('.btn-speed'),
            checkFollowVehicle: document.getElementById('checkFollowVehicle'),

            // Timeline
            timelineList: document.getElementById('timelineList'),
            btnClearTimeline: document.getElementById('btnClearTimeline'),

            // Visualizer Overlay
            vizOverlayPanel: document.getElementById('vizOverlayPanel'),
            vizStepCounter: document.getElementById('vizStepCounter'),
            vizStepDesc: document.getElementById('vizStepDesc'),
            vizNodesCount: document.getElementById('vizNodesCount'),
            vizEdgesCount: document.getElementById('vizEdgesCount'),
            vizCurrentCost: document.getElementById('vizCurrentCost'),
            btnStopViz: document.getElementById('btnStopViz'),

            // Drawers & Modals
            btnToggleExplainer: document.getElementById('btnToggleExplainer'),
            explainerDrawer: document.getElementById('explainerDrawer'),
            btnCloseExplainer: document.getElementById('btnCloseExplainer'),
            btnAbout: document.getElementById('btnAbout'),
            aboutModal: document.getElementById('aboutModal'),
            btnCloseAbout: document.getElementById('btnCloseAbout')
        };

        this.currentTool = 'start';
        this.currentMode = 'dijkstra'; // 'normal' | 'dijkstra' | 'compare'
        this.simStartTime = Date.now();

        this.initEventListeners();
    }

    initEventListeners() {
        // Tool button switches
        this.elements.toolBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setActiveTool(btn.dataset.tool);
            });
        });

        // Mode button switches
        this.elements.modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setActiveMode(btn.dataset.mode);
            });
        });

        // Clear search button
        if (this.elements.btnClearSearch) {
            this.elements.btnClearSearch.addEventListener('click', () => {
                this.elements.searchInput.value = '';
                this.elements.btnClearSearch.classList.add('hidden');
                this.elements.searchDropdown.classList.add('hidden');
                this.elements.searchDropdown.innerHTML = '';
            });
        }

        // Educational Drawer
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

        // Clear timeline
        if (this.elements.btnClearTimeline) {
            this.elements.btnClearTimeline.addEventListener('click', () => {
                this.clearTimeline();
            });
        }
    }

    setActiveTool(toolName) {
        this.currentTool = toolName;
        this.elements.toolBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        const descriptions = {
            'start': '🟢 <b>Set Start Tool:</b> Click on or near any road to snap origin point.',
            'end': '🔴 <b>Set Destination Tool:</b> Click on or near any road to snap destination.',
            'traffic-light': '🚦 <b>Traffic Light Tool:</b> Click an intersection to add, remove, or cycle signal.',
            'shortcut': '⚡ <b>Shortcut Tool:</b> Click any road segment to toggle 65 km/h express corridor.',
            'block': '🧱 <b>Block Road Tool:</b> Click any road segment to toggle blockade (Weight: ∞).',
            'select': '🔍 <b>Inspect Tool:</b> Click any road or intersection to inspect properties.'
        };

        this.showBanner(descriptions[toolName] || 'Select an action.', 'info');
    }

    setActiveMode(modeName) {
        this.currentMode = modeName;
        this.elements.modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === modeName);
        });

        if (modeName === 'normal') {
            this.elements.routeModeIndicator.textContent = 'NORMAL ROUTE (DISTANCE)';
            this.elements.routeModeIndicator.style.color = '#93c5fd';
            this.elements.routeModeIndicator.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        } else if (modeName === 'compare') {
            this.elements.routeModeIndicator.textContent = 'COMPARE BOTH ROUTES';
            this.elements.routeModeIndicator.style.color = '#c4b5fd';
            this.elements.routeModeIndicator.style.borderColor = 'rgba(139, 92, 246, 0.4)';
        } else {
            this.elements.routeModeIndicator.textContent = 'FASTEST SIMULATED (DIJKSTRA)';
            this.elements.routeModeIndicator.style.color = '#00e676';
            this.elements.routeModeIndicator.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        }
    }

    showBanner(htmlContent, type = 'info') {
        if (!this.elements.infoBanner) return;
        this.elements.infoBanner.innerHTML = htmlContent;
        this.elements.infoBanner.className = `info-banner banner-${type}`;
    }

    setStatusBadge(text, className) {
        if (!this.elements.routeStatusBadge) return;
        this.elements.routeStatusBadge.textContent = text;
        this.elements.routeStatusBadge.className = `status-badge ${className}`;
    }

    /**
     * Update Side-by-Side Comparison, Explainability, and Telemetry HUD
     */
    updateTelemetry(routesResult, startNode, endNode) {
        this.elements.statStartLoc.textContent = startNode ? startNode.name : 'None Selected';
        this.elements.statEndLoc.textContent = endNode ? endNode.name : 'None Selected';

        if (!routesResult) {
            this.resetTelemetryValues();
            return;
        }

        const normal = routesResult.normal;
        const dijkstra = routesResult.dijkstra;
        const comparison = routesResult.comparison;
        const explain = routesResult.explain || [];

        // 1. Comparison Card
        if (normal && normal.success) {
            this.elements.cmpNormalDist.textContent = `${normal.totalDistanceKm} km`;
            this.elements.cmpNormalTime.textContent = `~${normal.estimatedTimeMin} min`;
        } else {
            this.elements.cmpNormalDist.textContent = normal?.error ? 'Blocked' : '--';
            this.elements.cmpNormalTime.textContent = '--';
        }

        if (dijkstra && dijkstra.success) {
            this.elements.cmpDijkstraDist.textContent = `${dijkstra.totalDistanceKm} km`;
            this.elements.cmpDijkstraTime.textContent = `~${dijkstra.estimatedTimeMin} min`;
        } else {
            this.elements.cmpDijkstraDist.textContent = dijkstra?.error ? 'Blocked' : '--';
            this.elements.cmpDijkstraTime.textContent = '--';
        }

        // 2. Comparison Result Strip
        if (comparison) {
            if (comparison.timeSavedMin > 0) {
                this.elements.statTimeSaved.textContent = `${comparison.timeSavedMin} min faster`;
                this.elements.statTimeSaved.style.color = 'var(--accent-green)';
            } else if (comparison.dijkstraTimeMin === comparison.normalTimeMin) {
                this.elements.statTimeSaved.textContent = 'Same Time';
                this.elements.statTimeSaved.style.color = '#94a3b8';
            } else {
                this.elements.statTimeSaved.textContent = 'Optimal';
                this.elements.statTimeSaved.style.color = 'var(--accent-green)';
            }

            const distDiff = comparison.distDiffKm;
            if (distDiff > 0) {
                this.elements.statDistDiff.textContent = `+${distDiff} km (detour)`;
            } else if (distDiff < 0) {
                this.elements.statDistDiff.textContent = `${distDiff} km (shorter)`;
            } else {
                this.elements.statDistDiff.textContent = 'Identical Dist';
            }
        } else {
            this.elements.statTimeSaved.textContent = '--';
            this.elements.statDistDiff.textContent = '--';
        }

        // 3. "Why Did Dijkstra Choose This Route?" Explainability
        if (this.elements.explainList) {
            if (explain.length > 0) {
                this.elements.explainList.innerHTML = explain
                    .map(item => `<li>${item}</li>`)
                    .join('');
            } else {
                this.elements.explainList.innerHTML = `<li>Select origin and destination to compute and analyze route choices.</li>`;
            }
        }

        // 4. Primary Telemetry depending on active mode
        const activeRoute = (this.currentMode === 'normal') ? normal : dijkstra;
        if (activeRoute && activeRoute.success) {
            this.elements.statDistance.textContent = `${activeRoute.totalDistanceKm} km`;
            this.elements.statETA.textContent = `~${activeRoute.estimatedTimeMin} min`;
            this.elements.statCost.textContent = `${activeRoute.cost}`;
            this.elements.statTrafficLights.textContent = `${activeRoute.trafficLightCount}`;
            this.elements.statShortcuts.textContent = `${activeRoute.shortcutCount}`;
            this.elements.statCalcTime.textContent = `${activeRoute.calcTimeMs} ms`;
        } else {
            this.elements.statDistance.textContent = '--';
            this.elements.statETA.textContent = '--';
            this.elements.statCost.textContent = '--';
            this.elements.statTrafficLights.textContent = '--';
            this.elements.statShortcuts.textContent = '--';
            this.elements.statCalcTime.textContent = '--';
        }
    }

    resetTelemetryValues() {
        this.elements.cmpNormalDist.textContent = '--';
        this.elements.cmpNormalTime.textContent = '--';
        this.elements.cmpDijkstraDist.textContent = '--';
        this.elements.cmpDijkstraTime.textContent = '--';
        this.elements.statTimeSaved.textContent = '--';
        this.elements.statDistDiff.textContent = '--';
        this.elements.statDistance.textContent = '--';
        this.elements.statETA.textContent = '--';
        this.elements.statCost.textContent = '--';
        this.elements.statTrafficLights.textContent = '--';
        this.elements.statShortcuts.textContent = '--';
        this.elements.statCalcTime.textContent = '--';
        this.elements.explainList.innerHTML = `<li>Select origin and destination to compute and analyze route choices.</li>`;
    }

    updateVehicleProgress(percent) {
        if (this.elements.vehicleProgressBar) {
            this.elements.vehicleProgressBar.style.width = `${percent}%`;
        }
        if (this.elements.vehicleProgressBadge) {
            this.elements.vehicleProgressBadge.textContent = `${percent}%`;
        }
    }

    /**
     * Add entry to Route Event Timeline
     */
    addTimelineEvent(description, type = 'normal') {
        if (!this.elements.timelineList) return;

        const now = Date.now();
        const elapsedSec = Math.floor((now - this.simStartTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        const timestampStr = `${mins}:${secs}`;

        const item = document.createElement('div');
        item.className = `timeline-item ${type}`;
        item.innerHTML = `
            <span class="time-stamp">${timestampStr}</span>
            <span class="time-desc">${description}</span>
        `;

        this.elements.timelineList.insertBefore(item, this.elements.timelineList.firstChild);
    }

    clearTimeline() {
        if (!this.elements.timelineList) return;
        this.elements.timelineList.innerHTML = `
            <div class="timeline-item">
                <span class="time-stamp">00:00</span>
                <span class="time-desc">Timeline reset. Ready for navigation events.</span>
            </div>
        `;
        this.simStartTime = Date.now();
    }
}

if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}
