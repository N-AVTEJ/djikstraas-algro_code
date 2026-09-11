# 🚗 Dijkstra Dynamic City Navigator — Road-Based Navigation Simulator

An interactive, production-quality city navigation simulator and Dijkstra algorithm visualizer built with **Leaflet 1.9.4**, **OpenStreetMap**, and a **manual, pure JavaScript implementation of Dijkstra's Algorithm**.

The application models realistic road-aligned vehicular navigation across the urban corridors of **Central Hyderabad, India** (surrounding Hussain Sagar Lake, Telangana Secretariat, Khairatabad, Raj Bhavan, Somajiguda, Punjagutta, Begumpet, Necklace Road, Minister Road, and Paradise Circle).

---

## 1. Project Objective

Traditional algorithm visualizers typically display abstract graphs: artificial floating nodes connected by straight lines that cut through buildings, parks, and water bodies.

**Dijkstra Dynamic City Navigator** bridges the gap between academic graph theory and real-world navigation systems. It delivers an authentic, Google Maps-style navigation experience where:
1. The **OpenStreetMap basemap** is the primary visual element (75–80% of viewport), showing clear roads, streets, highways, water bodies, parks, and landmarks without API key watermarks or dark tile inverters.
2. The **Road Network Graph** follows real road geometry coordinates.
3. Raw graph nodes and edges are **hidden by default** for clean navigation, and only displayed when the user toggles "Show Graph" or runs "Visualize Dijkstra".
4. Two distinct routing modes demonstrate that **the shortest geographic road path is not always the fastest route** when speed limits, traffic signals, shortcuts, and roadblocks are taken into account.
5. Dynamic 3-second traffic lights trigger **real-time Dijkstra recalculation** and smooth vehicle rerouting mid-journey.

---

## 2. Technology Stack

- **HTML5:** Semantic layout, accessible dialogs, and responsive viewport structure.
- **CSS3:** Vanilla CSS, modern dark glassmorphism (`backdrop-filter: blur()`), CSS custom variables, and responsive layout for desktop, laptop, and tablet. No TailwindCSS or external CSS frameworks.
- **Vanilla JavaScript (ES6+):** Pure object-oriented modular architecture without third-party frameworks (no React, Vue, Angular, Vite, or Webpack).
- **Leaflet.js 1.9.4:** Used strictly for map rendering, OpenStreetMap tile presentation, marker placement, and polyline visualization.
- **OpenStreetMap:** High-clarity raster tiles from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with standard OpenStreetMap attribution.
- **Pure JavaScript Dijkstra Engine:** Custom Binary Min-Heap Priority Queue running in $O((V + E) \log V)$ time with zero external routing APIs.

---

## 3. Important Architectural Notice

> [!NOTE]
> - **Basemap Data:** Real OpenStreetMap tiles are used to display roads, water bodies (Hussain Sagar), parks, and landmarks.
> - **Road Network Graph:** A curated, high-precision demonstration dataset mapped to authentic Central Hyderabad road coordinates.
> - **Local Dijkstra Engine:** All shortest-path and fastest-route calculations are performed **locally in JavaScript**.
> - **No External Routing APIs:** External services such as Google Maps Directions API, Mapbox Directions API, OpenRouteService, or OSRM are **NOT** used to calculate routes.

---

## 4. Key Features

### Clean City Map First, Algorithm Visualizer Second
- The basemap is bright, clear, and readable.
- Raw graph nodes and edge lines are **hidden by default** (`Show Graph: OFF`), giving the user a real navigation experience.
- Users can toggle "Show Graph" or click "Visualize Dijkstra" at any time to inspect underlying nodes and edge relaxation steps.

### Dual Routing Modes & Side-by-Side Comparison
- **Normal / Casual Route (Blue):** Minimizes physical road distance without speed optimization or live traffic delays. Represents how a casual driver chooses the most direct road path.
- **Dijkstra Fastest Simulated Route (Green):** Minimizes estimated travel time by taking road speeds, 3-state traffic signals, express shortcuts, and roadblocks into account.
- **Compare Routes:** Displays both paths simultaneously on the map, along with a comparison panel showing **Distance Difference (+/- km)**, **Time Saved (min)**, and an explainability summary.

### "Why Did Dijkstra Choose This Route?" (Explainability Panel)
Explains algorithmic decisions in human-readable terms:
- ✓ *Avoided 2 red traffic light delays (+2.5 min penalty)*
- ✓ *Utilized 1 express shortcut bypass (65 km/h corridor)*
- ✓ *Avoided blocked road on Somajiguda to Begumpet*
- ✓ *Saved 3.4 minutes compared to normal route*

### Real Road-Based Graph & Coordinate Continuity
Every road segment stores multi-point geographic coordinates that trace the curvature of Hyderabad streets. When Dijkstra selects a sequence of edges, their coordinate arrays are stitched into a continuous Leaflet polyline. The vehicle drives along these exact coordinates and never cuts corners or jumps between nodes.

### Intelligent Snap-to-Road System
When the user clicks the map to set a Start or Destination, the system calculates the orthogonal projection of the click point onto all road segments and nodes, snapping the marker to the nearest valid road with an animated ripple indicator.

### Points of Interest (POIs) & Navigation Search
- Instant autocomplete search for places in Central Hyderabad across 8 categories:
  - 🏥 Hospitals (KIMS Begumpet, Yashoda Somajiguda)
  - 🎓 Colleges (Nizam College, ASCI)
  - 🏨 Hotels (Hyderabad Marriott, Taj Vivanta)
  - 🍴 Dining (Paradise Biryani, Eat Street)
  - ⛽ Fuel Stations (HP Lakdikapul, IndianOil Tank Bund)
  - 🚇 Metro Stations (Khairatabad, Ameerpet, Paradise)
  - 🛍 Shopping (Hyderabad Central Mall)
  - 📍 Landmarks (Telangana Secretariat, Hussain Sagar Buddha Statue, Lumbini Park)
- Filter POIs by category chips or toggle POIs ON/OFF.
- Click any POI to view details and quickly select "Set as Start" or "Set as Destination".

### 3-State Traffic Light System & Dynamic Rerouting
- Traffic signals are connected to real intersections with 3 states: **Green (0s delay)**, **Yellow (+20s delay)**, and **Red (+75s delay)**.
- In **Auto-Traffic** mode, signals cycle every 3 seconds: $\text{Green} \to \text{Yellow} \to \text{Red} \to \text{Green}$.
- When a signal change makes an alternative corridor faster, Dijkstra automatically recalculates the route, triggers smooth vehicle rerouting, and notifies the user with Previous ETA, New ETA, and Time Saved.

### Express Shortcuts & Roadblock Hazards
- **Add Shortcut:** Toggle high-speed express bypasses (65 km/h) to give Dijkstra a lower-cost option.
- **Block Road:** Click any road to mark it blocked (`Weight = Infinity`). Dijkstra immediately routes around the obstacle.

### 60fps Vehicle Animation & Navigation Timeline
- Custom SVG sports car with headlights and windshield (no basic emojis).
- Uses `requestAnimationFrame` for 60fps geographic interpolation.
- Continuously calculates heading bearing ($\theta = \text{atan2}$) and rotates the car to match road direction.
- Controls: **Start Drive**, **Pause**, **Reset**, and **Replay Route**.
- Speeds: **0.5x**, **1.0x**, **2.0x**, and **4.0x**.
- **Follow Car:** Smoothly auto-pans the camera to keep the vehicle centered.
- **Progress Bar:** Real-time percentage indicator (`0%` to `100%`).
- **Navigation Event Timeline:** Logs timestamps and milestones (e.g. *00:00 Started*, *00:45 Passed Khairatabad*, *01:10 Traffic light turned RED*, *01:12 Dijkstra recalculated route*, *03:40 Destination reached*).

---

## 5. Algorithmic Foundation & Cost Model

### Dijkstra's Algorithm
Dijkstra's Algorithm solves the single-source shortest path problem on a graph $G = (V, E)$ with non-negative edge weights. This simulator uses a **Binary Min-Heap Priority Queue**:

1. **Initialize:** Tentative cost to source $\text{dist}[s] = 0$; all other nodes $\text{dist}[v] = \infty$. Push $(s, 0)$ into the Min-Heap.
2. **Greedy Selection:** Extract node $u$ with the minimum tentative cost from the Min-Heap in $O(\log V)$ time.
3. **Neighbor Relaxation:** For each outgoing road edge $e = (u, v)$:
   $$\text{If } \text{dist}[u] + \text{Cost}(e) < \text{dist}[v] \implies \text{dist}[v] = \text{dist}[u] + \text{Cost}(e), \quad \text{Predecessor}[v] = u$$
4. **Terminate:** Stop when destination $t$ is extracted, then backtrack predecessors to reconstruct the complete road sequence.

**Time Complexity:** $O((V + E) \log V)$  
**Space Complexity:** $O(V + E)$

---

### Realistic Cost Model

#### 1. Dijkstra Fastest Simulated Route Mode
$$\text{Travel Time (min)} = \left(\frac{\text{Distance (km)}}{\text{Speed (km/h)}} \times 60 \times \text{Multiplier}\right) + \text{Traffic Delay (min)}$$

Where:
- **Normal Road:** Speed = 45 km/h, Multiplier = 1.0
- **Primary Boulevard:** Speed = 50 km/h, Multiplier = 1.0
- **Express Shortcut:** Speed = 65 km/h, Multiplier = 0.85
- **Green Signal:** Delay = +0 min (+0 sec)
- **Yellow Signal:** Delay = +0.33 min (+20 sec)
- **Red Signal:** Delay = +1.25 min (+75 sec)
- **Blocked Road:** Cost = $\infty$ (impassable)

#### 2. Normal / Casual Route Mode
$$\text{Cost} = \text{Distance (km)} = \sum \text{edge.distance}$$
Represents the baseline geographic route without speed or signal optimization.

---

## 6. Project Architecture

```
/project
│
├── index.html                   # Master application layout & navigation HUD
├── styles.css                   # Modern dark glassmorphic styling & responsive rules
├── README.md                    # Documentation & college presentation guide
│
├── /js
│   ├── app.js                   # Application master coordinator & event dispatcher
│   ├── map.js                   # Leaflet map manager, OSM tile layers, markers, routes
│   ├── graph.js                 # CityRoadGraph, nodes, multi-point edges, cost models, snapping
│   ├── dijkstra.js              # Pure JavaScript Dijkstra engine with Binary Min-Heap
│   ├── routing.js               # Dual-mode routing coordinator, comparison & explainability
│   ├── traffic.js               # 3-state traffic controller & automated 3-second cycle
│   ├── vehicle.js               # 60fps SVG vehicle interpolation, bearing rotation & rerouting
│   ├── pois.js                  # POI manager, search engine & category filters
│   └── ui.js                    # UI manager, search dropdown, timeline & telemetry HUD
│
└── /data
    ├── city-road-network.geojson # Curated Hyderabad road network dataset
    └── pois.json                # Hyderabad Points of Interest dataset
```

---

## 7. Single Source of Truth Data Flow

$$\begin{matrix}
\text{ROAD NETWORK} \\
\downarrow \\
\text{TOPOLOGICAL GRAPH} \\
\downarrow \\
\text{DYNAMIC EDGE COSTS} \\
\downarrow \\
\text{DIJKSTRA ROUTER} \\
\downarrow \\
\text{SELECTED EDGES} \\
\downarrow \\
\text{CONTINUOUS ROAD COORDINATES} \\
\swarrow \qquad \searrow \\
\text{LEAFLET ROUTE POLYLINE} \qquad \text{VEHICLE 60FPS ANIMATION}
\end{matrix}$$

Both the visual route polyline and the moving vehicle follow the exact same coordinate sequence generated by the Dijkstra result.

---

## 8. How to Run Locally

Because the application uses modern modular JavaScript and local GeoJSON/JSON data files, it is best served via any lightweight local HTTP server:

### Option A: Python Built-in Server (Recommended)
Open PowerShell or Terminal in the project directory:
```bash
# Python 3
python -m http.server 8000
```
Then visit: `http://localhost:8000` in your web browser.

### Option B: Node.js `npx serve`
```bash
npx -y serve .
```
Then visit the URL shown in the terminal (e.g., `http://localhost:3000`).

### Option C: VS Code Live Server Extension
Right-click `index.html` in VS Code and select **"Open with Live Server"**.

---

## 9. College Presentation & Demo Procedure

Follow this 2-minute demonstration flow to present the project to evaluators:

1. **Show the Clean Navigation Experience:**
   - Point out that the application opens to a clean, readable city map of Central Hyderabad with OpenStreetMap tiles.
   - Note that raw graph nodes and edges are hidden by default, presenting a real navigation product.
2. **Select a Demo Scenario:**
   - From the top bar, select **"Lakdikapul → Paradise Circle (Hussain Sagar)"**.
   - Show how the Start (Green pin) and Destination (Red pin) markers snap directly to the road.
3. **Demonstrate Route Comparison:**
   - Click **"Compare"** in the top mode selector.
   - Show the **Normal Route (Blue)** taking the geographically shorter path across Tank Bund.
   - Show the **Dijkstra Fastest Route (Green)** bypassing Tank Bund South via Lower Tank Bund Express to avoid the **Red Traffic Light (+75s delay)**.
   - Point out the **Route Comparison Card**: *Time Saved: 2.1 min* despite a slightly longer distance.
   - Read from the **"Why Dijkstra Chose This Route?"** explainability card.
4. **Demonstrate Dynamic Rerouting:**
   - Click **"Start Drive"** to watch the SVG sports car animate along the road geometry with smooth rotation.
   - While the car is driving, use the **Block Road** tool to click a road ahead.
   - Watch the car dynamically adapt and reroute along the new optimal corridor without restarting.
   - Show the updated entry in the **Navigation Timeline**.
5. **Demonstrate Algorithm Transparency:**
   - Toggle **"Show Graph"** to reveal the underlying graph intersections and connections.
   - Click **"Visualize Dijkstra"** to run the step-by-step node exploration animation.
   - Click **"How Dijkstra Works"** to display the mathematical formula and $O((V+E)\log V)$ complexity breakdown.

---

## 10. Limitations

- **Simulated Traffic Model:** Traffic lights and congestion delays follow a simulated 3-state cycle rather than live real-time municipal traffic feeds.
- **Bounded Geographic Area:** The road network is focused on Central Hyderabad (Hussain Sagar, Begumpet, Secretariat, Khairatabad, Paradise Circle).
- **Turn Restrictions:** The current graph model treats bidirectional roads symmetrically without modeling one-way restrictions or complex multi-lane turns.
