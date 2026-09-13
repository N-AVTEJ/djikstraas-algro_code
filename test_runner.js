// Node.js test runner for CityNav
const GeoUtils = require('./js/geoUtils.js');
const { navigationState } = require('./js/navigationState.js');
const CityRoadGraph = require('./js/graph.js');
const { DijkstraRouter } = require('./js/dijkstra.js');
const RoutingManager = require('./js/routing.js');
const TrafficLightController = require('./js/traffic.js');
const VehicleNavigator = require('./js/vehicle.js');
const CityNavTestSuite = require('./js/tests.js');

// Mock Leaflet Map and animation frames for node environment
global.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const mockLeafletMap = {
    panTo: () => {},
    setView: () => {},
    fitBounds: () => {},
    removeLayer: () => {}
};

async function run() {
    console.log('[NODE TEST RUNNER] Starting CityNav verification...');
    const graph = new CityRoadGraph();
    const routingManager = new RoutingManager(graph);
    const vehicle = new VehicleNavigator(mockLeafletMap);

    const testSuite = new CityNavTestSuite(graph, routingManager, vehicle, null);
    const results = await testSuite.runAllTests();

    console.log(`\nFinal result: ${results.passed} / ${results.total} passed.`);
    if (!results.allPassed) {
        process.exit(1);
    } else {
        console.log('SUCCESS: All 14 automated tests passed in Node.js runtime!');
    }
}

run().catch(err => {
    console.error('Test runner failure:', err);
    process.exit(1);
});
