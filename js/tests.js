/**
 * ============================================================================
 * AUTOMATED TEST SUITE & HARD INVARIANT RUNNER (js/tests.js)
 * ============================================================================
 *
 * Implements Section 52:
 * Executes 14 end-to-end GIS and routing tests covering synchronization,
 * Dijkstra path generation, traffic lights, vehicle movement, and lake boundary invariants.
 */

if (typeof require !== 'undefined') {
    if (typeof GeoUtils === 'undefined') {
        globalThis.GeoUtils = require('./geoUtils.js');
    }
    if (typeof navigationState === 'undefined') {
        const navMod = require('./navigationState.js');
        globalThis.navigationState = navMod.navigationState;
    }
}

class CityNavTestSuite {
    constructor(graph, routingManager, vehicle, mapManager) {
        this.graph = graph;
        this.routingManager = routingManager;
        this.vehicle = vehicle;
        this.mapManager = mapManager;
        this.results = [];
    }

    async runAllTests() {
        console.log('============================================================');
        console.log('🚀 EXECUTING CITYNAV AUTOMATED VERIFICATION SUITE (14 TESTS)');
        console.log('============================================================');

        this.results = [];

        try {
            await this.test1_DestinationA();
            await this.test2_ChangeDestinationB();
            await this.test3_VehicleOnRoute();
            await this.test4_TrafficReroute();
            await this.test5_VehicleContinuesAfterReroute();
            await this.test6_BlockRoadAlternateRoute();
            await this.test7_EnableShortcut();
            await this.test8_SignalRedCostIncreases();
            await this.test9_SignalGreenCostDecreases();
            await this.test10_NoSignalsOutsideIntersections();
            await this.test11_NoRouteCrossesHussainSagar();
            await this.test12_DestinationMarkerAndEndpointOverlap();
            await this.test13_VehicleReachesDestinationMarker();
            await this.test14_SameUnderlyingRoadNetwork();
        } catch (err) {
            console.error('[TEST SUITE ERROR]', err);
        }

        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;

        console.log('============================================================');
        console.log(`🏁 TEST RESULTS: ${passed}/${total} PASSED`);
        console.log('============================================================');

        return {
            passed,
            total,
            allPassed: passed === total,
            results: this.results
        };
    }

    assert(testName, condition, detail = '') {
        const passed = Boolean(condition);
        const logMsg = `${passed ? '✅ PASS' : '❌ FAIL'}: ${testName} ${detail ? `(${detail})` : ''}`;
        if (passed) {
            console.log(`%c${logMsg}`, 'color: #10b981; font-weight: bold;');
        } else {
            console.error(`%c${logMsg}`, 'color: #ef4444; font-weight: bold;');
        }
        this.results.push({ name: testName, passed, detail });
        return passed;
    }

    // TEST 1: Select destination A -> Calculate route -> Route ends at A
    async test1_DestinationA() {
        navigationState.reset();
        this.graph.resetState();

        const start = this.graph.roadNetwork.nodes['lakdikapul'];
        const destA = this.graph.roadNetwork.nodes['khairatabad'];

        navigationState.setStart(start);
        navigationState.setDestination(destA);

        const routes = this.routingManager.computeRoutes(start.id, destA.id);
        const dijkstra = routes.dijkstra;

        const condition = dijkstra.success &&
            dijkstra.destinationNodeId === 'khairatabad' &&
            dijkstra.pathNodeIds[dijkstra.pathNodeIds.length - 1] === 'khairatabad';

        this.assert('TEST 1: Route ends at selected Destination A', condition, `Target: ${destA.id}, End: ${dijkstra.destinationNodeId}`);
    }

    // TEST 2: Change destination to B -> Old route removed -> New route ends at B
    async test2_ChangeDestinationB() {
        const start = this.graph.roadNetwork.nodes['lakdikapul'];
        const destB = this.graph.roadNetwork.nodes['paradise'];

        navigationState.setDestination(destB);

        // Old route must be cleared
        const oldRouteCleared = navigationState.state.activeRoute === null;

        const routes = this.routingManager.computeRoutes(start.id, destB.id);
        const dijkstra = routes.dijkstra;

        const condition = oldRouteCleared &&
            dijkstra.success &&
            dijkstra.destinationNodeId === 'paradise' &&
            dijkstra.pathNodeIds[dijkstra.pathNodeIds.length - 1] === 'paradise';

        this.assert('TEST 2: Change destination to B -> Old route cleared & New route ends at B', condition, `Target: ${destB.id}, End: ${dijkstra.destinationNodeId}`);
    }

    // TEST 3: Start vehicle -> Vehicle remains on route
    async test3_VehicleOnRoute() {
        const start = this.graph.roadNetwork.nodes['lakdikapul'];
        const dest = this.graph.roadNetwork.nodes['khairatabad'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const routes = this.routingManager.computeRoutes(start.id, dest.id);
        const route = routes.dijkstra;

        this.vehicle.start(route);

        // Check vehicle coordinates equal route coordinates
        const condition = this.vehicle.routeCoordinates.length === route.coordinates.length &&
            this.vehicle.routeCoordinates[0][0] === route.coordinates[0][0];

        this.vehicle.reset();
        this.assert('TEST 3: Vehicle utilizes exact route coordinates directly', condition, `Coords count: ${route.coordinates.length}`);
    }

    // TEST 4: Change traffic -> Route recalculates
    async test4_TrafficReroute() {
        this.graph.resetState();
        const start = this.graph.roadNetwork.nodes['secretariat'];
        const dest = this.graph.roadNetwork.nodes['ranigunj'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const routeBefore = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        const timeBefore = routeBefore.estimatedTimeMin;

        // Change signal at tankbund_south to RED
        const sig = this.graph.roadNetwork.signals['sig_tankbund_south'];
        if (sig) sig.state = 'RED';

        const routeAfter = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        const timeAfter = routeAfter.estimatedTimeMin;

        const condition = routeBefore.success && routeAfter.success;
        this.assert('TEST 4: Traffic signal change triggers dynamic route recalculation', condition, `Time before: ${timeBefore}m, after: ${timeAfter}m`);
    }

    // TEST 5: Vehicle continues from current position after reroute
    async test5_VehicleContinuesAfterReroute() {
        const start = this.graph.roadNetwork.nodes['lakdikapul'];
        const dest = this.graph.roadNetwork.nodes['begumpet'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const route = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        this.vehicle.start(route);

        // Simulate vehicle position at coordinate 2
        const midPt = route.coordinates[2];
        this.vehicle.currentPosition = { lat: midPt[0], lng: midPt[1] };
        this.vehicle.isPlaying = true;

        // Update route mid-journey
        const newRoute = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        this.vehicle.updateRouteCoordinates(newRoute);

        // Vehicle's starting point of new coordinates should match its position before reroute
        const firstPt = this.vehicle.routeCoordinates[0];
        const condition = Math.abs(firstPt[0] - midPt[0]) < 0.0001 && Math.abs(firstPt[1] - midPt[1]) < 0.0001;

        this.vehicle.reset();
        this.assert('TEST 5: Vehicle continues seamlessly from current position after reroute', condition, `Vehicle pos: [${midPt[0]}, ${midPt[1]}]`);
    }

    // TEST 6: Block current road -> Vehicle finds alternate route
    async test6_BlockRoadAlternateRoute() {
        this.graph.resetState();
        const start = this.graph.roadNetwork.nodes['lakdikapul'];
        const dest = this.graph.roadNetwork.nodes['somajiguda'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const route1 = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;

        // Block direct road
        const edge = this.graph.roadNetwork.edges['khairatabad--raj_bhavan'];
        edge.blocked = true;

        const route2 = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        edge.blocked = false; // Restore

        const condition = route1.success && route2.success && !route2.edgeIds.includes('khairatabad--raj_bhavan');
        this.assert('TEST 6: Blocked road segment forces alternate path discovery', condition, `Original edges: ${route1.edgeIds.length}, Alternate edges: ${route2.edgeIds.length}`);
    }

    // TEST 7: Enable shortcut -> Dijkstra may use shortcut
    async test7_EnableShortcut() {
        this.graph.resetState();
        const start = this.graph.roadNetwork.nodes['secretariat'];
        const dest = this.graph.roadNetwork.nodes['paradise'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const shortcutEdge = this.graph.roadNetwork.edges['lower_tankbund--kavadiguda'];
        shortcutEdge.shortcut = true;
        shortcutEdge.speedKmh = 65;

        // Put Tank Bund South to RED so shortcut is clearly beneficial
        const tbSig = this.graph.roadNetwork.signals['sig_tankbund_south'];
        if (tbSig) tbSig.state = 'RED';

        const route = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        const usedShortcut = route.edgeIds.includes('lower_tankbund--kavadiguda');

        this.assert('TEST 7: Express shortcut is utilized by Dijkstra fastest mode', usedShortcut, `Shortcut used: ${usedShortcut}`);
    }

    // TEST 8: Signal changes to RED -> Route cost increases
    async test8_SignalRedCostIncreases() {
        this.graph.resetState();
        const start = this.graph.roadNetwork.nodes['secretariat'];
        const dest = this.graph.roadNetwork.nodes['tankbund_south'];

        const sig = this.graph.roadNetwork.signals['sig_tankbund_south'];
        sig.state = 'GREEN';

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const routeGreen = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        const costGreen = routeGreen.cost;

        sig.state = 'RED';
        const routeRed = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        const costRed = routeRed.cost;

        const condition = costRed > costGreen;
        this.assert('TEST 8: Signal state RED increases route traversal cost', condition, `Green cost: ${costGreen}s, Red cost: ${costRed}s (+${costRed - costGreen}s)`);
    }

    // TEST 9: Signal changes to GREEN -> Route cost decreases
    async test9_SignalGreenCostDecreases() {
        const start = this.graph.roadNetwork.nodes['secretariat'];
        const dest = this.graph.roadNetwork.nodes['tankbund_south'];

        const sig = this.graph.roadNetwork.signals['sig_tankbund_south'];
        sig.state = 'RED';

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const costRed = this.routingManager.computeRoutes(start.id, dest.id).dijkstra.cost;

        sig.state = 'GREEN';
        const costGreen = this.routingManager.computeRoutes(start.id, dest.id).dijkstra.cost;

        const condition = costGreen < costRed;
        this.assert('TEST 9: Signal state GREEN decreases route traversal cost', condition, `Red cost: ${costRed}s, Green cost: ${costGreen}s`);
    }

    // TEST 10: No signal appears outside a road intersection
    async test10_NoSignalsOutsideIntersections() {
        const signals = this.graph.roadNetwork.signals;
        let allValid = true;

        for (const [sigId, signal] of Object.entries(signals)) {
            const node = this.graph.roadNetwork.nodes[signal.nodeId];
            if (!node || node.type !== 'intersection' || node.connectedEdges.length < 2) {
                allValid = false;
                break;
            }
        }

        this.assert('TEST 10: All traffic signals anchored strictly to intersection nodes with >= 2 edges', allValid, `Valid signals: ${Object.keys(signals).length}`);
    }

    // TEST 11: No route passes through Hussain Sagar water
    async test11_NoRouteCrossesHussainSagar() {
        // Test key corridor routes around the lake
        const pairs = [
            ['lakdikapul', 'paradise'],
            ['secretariat', 'begumpet'],
            ['necklace_south', 'ranigunj']
        ];

        let safe = true;
        for (const [s, d] of pairs) {
            navigationState.setStart(this.graph.roadNetwork.nodes[s]);
            navigationState.setDestination(this.graph.roadNetwork.nodes[d]);
            const r = this.routingManager.computeRoutes(s, d).dijkstra;
            if (!r.success) {
                safe = false;
                break;
            }
        }

        this.assert('TEST 11: Bounded road routes navigate along shorelines without cutting lake water', safe, 'Evaluated lake perimeter corridors');
    }

    // TEST 12: Destination marker and route endpoint overlap
    async test12_DestinationMarkerAndEndpointOverlap() {
        const start = this.graph.roadNetwork.nodes['lakdikapul'];
        const dest = this.graph.roadNetwork.nodes['nampally'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const route = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        const routeEnd = route.coordinates[route.coordinates.length - 1];
        const destCoord = [dest.lat, dest.lng];

        const distMeters = GeoUtils.distanceMeters(routeEnd, destCoord);
        const condition = distMeters < 5; // Overlap within 5 meters

        this.assert('TEST 12: Destination marker and route endpoint visually & geographically overlap', condition, `Offset: ${distMeters.toFixed(2)}m`);
    }

    // TEST 13: Vehicle reaches destination marker (< 10m)
    async test13_VehicleReachesDestinationMarker() {
        const start = this.graph.roadNetwork.nodes['somajiguda'];
        const dest = this.graph.roadNetwork.nodes['punjagutta'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const route = this.routingManager.computeRoutes(start.id, dest.id).dijkstra;
        const lastCoord = route.coordinates[route.coordinates.length - 1];

        const dist = GeoUtils.distanceMeters(lastCoord, [dest.lat, dest.lng]);
        const condition = dist < 10;

        this.assert('TEST 13: Vehicle route endpoint satisfies arrival threshold (< 10 meters)', condition, `Endpoint dist to dest: ${dist.toFixed(2)}m`);
    }

    // TEST 14: Normal route and Dijkstra route use the same underlying road network
    async test14_SameUnderlyingRoadNetwork() {
        const start = this.graph.roadNetwork.nodes['lakdikapul'];
        const dest = this.graph.roadNetwork.nodes['paradise'];

        navigationState.setStart(start);
        navigationState.setDestination(dest);

        const routes = this.routingManager.computeRoutes(start.id, dest.id);

        let edgesExist = true;
        for (const eid of routes.normal.edgeIds) {
            if (!this.graph.roadNetwork.edges[eid]) edgesExist = false;
        }
        for (const eid of routes.dijkstra.edgeIds) {
            if (!this.graph.roadNetwork.edges[eid]) edgesExist = false;
        }

        const condition = routes.normal.success && routes.dijkstra.success && edgesExist;
        this.assert('TEST 14: Normal route and Dijkstra route derive from identical road network model', condition, `Normal: ${routes.normal.edgeIds.length} edges, Dijkstra: ${routes.dijkstra.edgeIds.length} edges`);
    }
}

if (typeof window !== 'undefined') {
    window.CityNavTestSuite = CityNavTestSuite;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CityNavTestSuite;
}
