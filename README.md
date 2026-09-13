# 🚗 CityNav Simulator — Production-Quality Interactive City Navigation & Dijkstra Visualizer

An interactive, production-grade city navigation simulator and Dijkstra algorithm visualizer built with **Leaflet 1.9.4** and a **manual, pure JavaScript implementation of Dijkstra's Algorithm**.

The application models realistic road-aligned vehicular navigation across the urban corridors of **Central Hyderabad, India** (surrounding Hussain Sagar Lake, Secretariat, Khairatabad, Somajiguda, Punjagutta, and Begumpet). It demonstrates dynamic weighted shortest path routing influenced by real-time cycling traffic signals, express shortcuts, and impassable obstacles with smooth 60fps road-following vehicle animation.

---

## 1. Project Overview

Modern map visualization projects often suffer from a fundamental disconnect: algorithms calculate paths across abstract node grids, and lines are drawn straight across buildings, water bodies, and parks. 

**CityNav Simulator** solves this by establishing a **Single Source of Truth** between:
1. **Geographic Map (Leaflet):** High-DPI CartoDB Dark Matter / OpenStreetMap tiles.
2. **Road Graph (`CityRoadGraph`):** Rich topological network of intersections and multi-point road geometry polylines tracing actual Hyderabad streets.
3. **Dynamic Weight System:** Real-time costs incorporating physical distance, road classification multipliers, and traffic light delays.
4. **Manual Dijkstra Algorithm (`DijkstraRouter`):** Pure JavaScript greedy search using a Binary Min-Heap Priority Queue.
5. **Continuous Route Geometry (`RouteRenderer`):** Neon emerald road-centered polylines with directional chevron indicators.
6. **Vehicle Simulator (`VehicleNavigator`):** Smooth $60\text{fps}$ geographic interpolation with heading bearing rotation and dynamic reroute adaptation.

---

## 2. Problem Statement

Given a road network represented as a directed weighted graph $G = (V, E)$, find the optimal path from an arbitrary start intersection $s \in V$ to a destination intersection $t \in V$ such that:
$$\min \sum_{e \in \text{Path}(s, t)} \text{Cost}(e)$$
where the traversal cost of any edge $e = (u, v)$ is a dynamic function of road distance, classification multiplier, and real-time destination traffic light delays:
$$\text{Cost}(e) = \text{Distance}(e) \times \text{Multiplier}(e) + \text{TrafficDelay}(v)$$

The simulator must visually demonstrate:
- Road-accurate snapping when users click anywhere near the road network.
- Dynamic rerouting when traffic signals cycle every 3 seconds between Yellow and Red states.
- Seamless vehicular progression that follows genuine road curves rather than cutting through geographic obstacles.

---

## 3. Features

- **Realistic Road-Based Geometry:** Every road segment contains intermediate coordinate waypoints capturing authentic road curvature. Routes and vehicles never cut across buildings, lakes, or parks.
- **Intelligent Snap-to-Road System:** Perpendicular projection snaps user clicks on or near roads to the nearest valid graph intersection, accompanied by an animated ripple pulse indicator.
- **Manual Dijkstra Implementation:** Implemented from first principles in JavaScript with zero external routing dependencies (no Google Maps, Mapbox, or OSRM).
- **Dynamic 3-Second Traffic Signals:** Realistic traffic light heads positioned directly at intersections that cycle between **Yellow (+1.5 delay)** and **Red (+4.0 delay)**, triggering instantaneous route re-evaluation.
- **Express High-Speed Corridors:** Toggleable shortcuts that reduce traversal cost to **0.5x**.
- **Road Obstacles / Blockades:** Block any road segment or intersection to set weight to $\infty$, forcing Dijkstra to discover alternative corridors.
- **Smooth 60fps Vehicle Animation:** Custom SVG sports car with chassis shadow, headlights, and cabin windshield that continuously interpolates along coordinates, rotates based on geographic bearing ($\theta = \text{atan2}$), and dynamically adapts if rerouted mid-journey.
- **Follow Vehicle Camera:** Optional smooth map auto-panning that keeps the driving vehicle in view.
- **One-Click Demo Scenario:** Preconfigured college presentation scenario demonstrating competing corridors around Hussain Sagar and dynamic traffic-induced diversion.
- **Interactive Educational Explainer:** Slide-out drawer with LaTeX/Markdown breakdowns of Dijkstra's greedy selection and relaxation mechanics.
- **Comprehensive Route Telemetry:** Real-time HUD displaying physical road distance (km), weighted cost, path nodes, active traffic lights, shortcuts, and millisecond execution benchmarks.

---

## 4. Technologies Used

- **HTML5:** Semantic markup, responsive viewport layout, and accessible dialogs.
- **CSS3:** Dark-themed glassmorphism (`backdrop-filter: blur()`), CSS custom properties, grid/flexbox layouts, and custom keyframe animations.
- **Vanilla JavaScript (ES6+):** Pure object-oriented classes (`CityRoadGraph`, `DijkstraRouter`, `TrafficLightController`, `RouteRenderer`, `VehicleNavigator`, `LeafletMapManager`, `UIManager`). Zero frameworks, zero Node/npm dependencies.
- **Leaflet 1.9.4:** Lightweight open-source mapping library used solely for map rendering, tile loading, SVG layer groups, and user interaction.
- **CartoDB Dark Matter / OpenStreetMap:** High-contrast street tiles with full OpenStreetMap attribution compliance.
- **GeoJSON:** Standards-compliant feature collection representing the road network (`data/city-road-network.geojson`).

---

## 5. Why Leaflet?

Leaflet is utilized strictly as a **presentation and rendering engine**:
- It loads OpenStreetMap raster tiles cleanly across zoom levels 12 to 18.
- It provides high-performance `L.Polyline`, `L.Marker`, `L.CircleMarker`, and `L.DivIcon` abstractions for GPU-accelerated layer rendering.
- It handles pan/zoom events, touch gestures, and geographic bounds calculation (`map.fitBounds()`).

> **Important Architectural Separation:** Leaflet does **NOT** compute routes, calculate shortest paths, or manage graph topology. All mathematical routing, priority queue operations, edge evaluations, and vehicle interpolation are executed independently in pure JavaScript.

---

## 6. Dijkstra's Algorithm Explanation

Dijkstra's Algorithm is a greedy single-source shortest path algorithm designed for graphs with non-negative edge weights.

### Execution Workflow:
1. **Initialization:** Assign tentative cost $\text{dist}[v] = \infty$ for all $v \in V$, and set $\text{dist}[s] = 0$. Insert origin $(s, 0)$ into a **Binary Min-Heap Priority Queue**.
2. **Greedy Node Selection:** Extract node $u$ with minimum tentative cost from the Priority Queue in $O(\log V)$ time. If $u$ is already settled, skip it.
3. **Target Evaluation:** If $u = t$ (destination), terminate search; the optimal path has been found.
4. **Neighbor Relaxation:** For each outgoing edge $e = (u, v)$:
   - Compute dynamic edge cost $c(u, v) = \text{Distance}(e) \times \text{Multiplier}(e) + \text{TrafficDelay}(v)$.
   - If $c(u, v) = \infty$, the edge is impassable.
   - If $\text{dist}[u] + c(u, v) < \text{dist}[v]$:
     - Update $\text{dist}[v] = \text{dist}[u] + c(u, v)$.
     - Record predecessor: $\text{prev}[v] = (u, e)$.
     - Push $(v, \text{dist}[v])$ into the Min-Heap.
5. **Path Reconstruction:** Backtrack from $t$ to $s$ via $\text{prev}$ pointers, assembling the complete sequence of road coordinates.

---

## 7. Graph Architecture

The application graph is defined by two primary abstractions:

```javascript
// Intersection Node
{
    id: "secretariat",
    name: "Telangana Secretariat Circle",
    lat: 17.4128,
    lng: 78.4715,
    type: "intersection",
    blocked: false,
    trafficLight: true,
    trafficState: "yellow" // "yellow" (+1.5) or "red" (+4.0)
}

// Road Edge
{
    id: "khairatabad--secretariat",
    from: "khairatabad",
    to: "secretariat",
    name: "NTR Marg (Lakeside Boulevard)",
    distance: 1.15, // km (calculated via Haversine across polyline)
    baseCost: 1.0,
    roadType: "normal", // "normal", "shortcut", "blocked"
    blocked: false,
    coordinates: [
        [17.4116, 78.4611],
        [17.4122, 78.4650],
        [17.4125, 78.4685],
        [17.4128, 78.4715]
    ]
}
```

---

## 8. Geographic Coordinate System

Coordinates use the standard **WGS 84 (EPSG:4326)** latitude/longitude format.

Distance between two geographic coordinates $(lat_1, lon_1)$ and $(lat_2, lon_2)$ is computed using the **Haversine formula**:
$$a = \sin^2\left(\frac{\Delta lat}{2}\right) + \cos(lat_1) \cdot \cos(lat_2) \cdot \sin^2\left(\frac{\Delta lon}{2}\right)$$
$$d = 2 R \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right)$$
where $R = 6371\text{ km}$ is Earth's mean radius.

Total edge length is determined by summing Haversine distances across each consecutive vertex pair in the edge's `coordinates` array.

---

## 9. Road Network Model

The default model covers an iconic, diverse urban section of **Hyderabad, India**:
- **West / North-West Corridors:** Raj Bhavan Road, Somajiguda Circle, Punjagutta Circle, Ameerpet, Begumpet Flyover.
- **Lake Corridors:** PVNR Marg / Necklace Road (scenic lakeside curves passing People's Plaza, Jalavihar Water Park, and Sanjeevaiah Park).
- **South Shore / Government Precinct:** Lakdikapul Junction, Khairatabad Flyover, IMAX Link, NTR Marg, BR Ambedkar Secretariat.
- **East Corridors:** Tank Bund South (Lumbini Park), Tank Bund Promenade (Buddha Viewpoint), Ranigunj Depot, Lower Tank Bund / Telugu Thalli Flyover (Express Shortcut), Kavadiguda, Minister Road, Paradise Circle.

---

## 10. Weight System

| Road / Condition | Weight Multiplier / Cost | Visual Representation | Practical Effect |
| :--- | :--- | :--- | :--- |
| **Normal Road** | `1.0x` distance | Dark Slate line | Standard traversal cost proportional to length. |
| **Express Shortcut** | `0.5x` distance | Luminous Emerald Green | Halves cost, encouraging selection for high-speed transit. |
| **Yellow Traffic Signal** | `+1.5` delay penalty | Glowing Yellow Signal Head | Slight delay penalty (~1.5 km equivalent wait). |
| **Red Traffic Signal** | `+4.0` delay penalty | Glowing Red Signal Head | Heavy delay penalty (~4.0 km equivalent wait), causing Dijkstra to favor alternative boulevards. |
| **Blocked Road / Obstacle** | `Infinity` | Red Dashed Hazard Line | Impassable. Dijkstra completely prunes the edge. |

---

## 11. Traffic-Light Behavior

- Traffic lights cycle automatically every **3 seconds** via `TrafficLightController`.
- Cycle transitions:
  $$\text{YELLOW} \xrightarrow{3s} \text{RED} \xrightarrow{3s} \text{YELLOW} \xrightarrow{3s} \text{RED}$$
- Real-time updates occur without page reload:
  1. CSS visual lamps update with glowing box-shadows.
  2. Edge traversal weights in `CityRoadGraph` update immediately.
  3. Dijkstra recalculates tentative costs.
  4. If the optimal path switches, the Leaflet polyline smoothly transitions to the new route.

---

## 12. Dynamic Route Recalculation

When a traffic signal turns **RED** on an active corridor (e.g. Tank Bund Promenade), the delay penalty increases by $+2.5$ cost units. 

If an alternative corridor (such as PVNR Marg / Necklace Road or Lower Tank Bund Shortcut) has a lower aggregate cost, Dijkstra immediately selects it:
- The optimal route line updates.
- Telemetry HUD updates distance, cost, and node count.
- If the vehicle is driving, it safely switches to the new route from its closest forward road waypoint without jumping or teleporting.

---

## 13. Vehicle Animation Engine

Implemented in `js/vehicle.js` via `requestAnimationFrame`:
- **Continuous 60fps Interpolation:** Calculates exact intermediate coordinates along each curved road segment based on elapsed time:
  $$P(t) = P_1 + (P_2 - P_1) \times \frac{\Delta t}{\text{Duration}}$$
- **Distance-Proportional Velocity:** Segment traversal duration is strictly proportional to physical Haversine distance:
  $$\text{Duration} = \frac{\text{Distance (km)}}{\text{Velocity (km/h)}} \times 3600 \times 1000\text{ ms}$$
  This prevents unrealistic constant-duration jumps between road segments of unequal length.
- **Geographic Heading / Bearing:** Calculates travel heading:
  $$\theta = \text{atan2}\left(\sin(\Delta lon) \cdot \cos(lat_2), \cos(lat_1) \cdot \sin(lat_2) - \sin(lat_1) \cdot \cos(lat_2) \cdot \cos(\Delta lon)\right)$$
  The custom SVG car rotates smoothly as roads bend and turn.
- **Reroute Handling:** If Dijkstra triggers dynamic rerouting mid-drive, the simulator determines the vehicle's current position, identifies the nearest forward waypoint on the new route, and splices the remainder of the journey seamlessly.

---

## 14. Project Structure

```text
interactive-city-navigation/
│
├── index.html                    # Application HTML5 structure & HUD panels
├── styles.css                    # Glassmorphic dark styling & animations
│
├── js/
│   ├── graph.js                  # CityRoadGraph, road geometries & snap-to-road engine
│   ├── dijkstra.js               # MinHeapPriorityQueue & manual DijkstraRouter
│   ├── traffic.js                # TrafficLightController (3s automated cycle)
│   ├── route.js                  # RouteRenderer (layered glow & chevrons)
│   ├── vehicle.js                # VehicleNavigator (60fps interpolation & bearing)
│   ├── map.js                    # LeafletMapManager (layers, snapping & markers)
│   ├── ui.js                     # UIManager (toolbar, telemetry & modals)
│   └── app.js                    # Application orchestrator & demo scenario
│
├── data/
│   └── city-road-network.geojson # Geographic road network dataset
│
└── README.md                     # Comprehensive documentation
```

---

## 15. How to Run

1. **Direct Browser Execution (No server required):**
   - Double-click `index.html` or open it directly in any modern web browser (Chrome, Edge, Firefox, Safari).
   - The embedded road network ensures instant loading without CORS restrictions.

2. **Using a Local Development Server:**
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js (npx serve)
   npx serve .
   ```
   Open `http://localhost:8000` in your browser.

---

## 16. Future Improvements

- **A\* Heuristic Search:** Introduce Haversine-based Euclidean distance heuristics $h(n)$ for guided $A^*$ exploration.
- **Turn Penalties:** Add intersection turning angle penalties (e.g. right turns vs sharp U-turns).
- **Multi-Vehicle Swarm Simulation:** Simulate multiple autonomous vehicles navigating concurrently with collision detection and congestion penalties.
- **Automated OpenStreetMap Overpass API Ingestion:** Add an interactive bounding box selector to fetch and convert any city's road network dynamically.

---

## 17. Limitations

- **Simplified Directionality:** While road edges support one-way restrictions, the default demo dataset configures major avenues as bidirectional corridors to maximize routing versatility.
- **Elevation / Grade:** Elevation profiles (z-axis) and multilevel flyovers are projected on a 2D spherical plane.
- **Simulation Time Scaling:** Vehicle speeds are scaled for smooth visual demonstration rather than 1:1 real-time minutes.
