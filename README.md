# 🏙️ Interactive City Navigation & Dijkstra's Algorithm Visualizer

A web-based geographic routing simulator and educational visualizer for **Dijkstra's Shortest-Path Algorithm** applied over an interactive, real-world city road network (Hyderabad, India) using **Leaflet 1.9.4** and vanilla **JavaScript (ES6+)**.

---

## 📑 Table of Contents

1. [Project Overview](#-project-overview)
2. [Key Features](#-key-features)
3. [Architecture: Leaflet vs Dijkstra Separation](#-architecture-leaflet-vs-dijkstra-separation)
4. [Technology Stack](#-technology-stack)
5. [Graph Representation](#-graph-representation)
6. [Terrain & Road Weight System](#-terrain--road-weight-system)
7. [Dynamic Traffic Light System](#-dynamic-traffic-light-system)
8. [Express Shortcuts & Obstacles](#-express-shortcuts--obstacles)
9. [Vehicle Simulation & Intelligent Rerouting](#-vehicle-simulation--intelligent-rerouting)
10. [Algorithm Visualizer Mode](#-algorithm-visualizer-mode)
11. [Project Structure](#-project-structure)
12. [How to Run](#-how-to-run)
13. [Academic Explanation of Dijkstra's Algorithm](#-academic-explanation-of-dijkstras-algorithm)
14. [Future Improvements](#-future-improvements)

---

## 🌟 Project Overview

This application simulates intelligent city navigation. Unlike naive grid-based pathfinders, this visualizer models a real interconnected metropolitan road network with physical geographic coordinates (`latitude` and `longitude`), realistic edge distances (calculated via the **Haversine formula**), dynamic time-penalty traffic lights, express corridors, and impassable obstacles.

CSE students and educators can visually inspect how Dijkstra's greedy pathfinding explores frontier nodes, relaxes edges, and recalculates optimal paths in real time as traffic lights change.

---

## ✨ Key Features

- 🗺️ **Geographic Leaflet Map**: Interactive map centered on Hyderabad with CartoDB Dark Matter tiles.
- ⚡ **Manual Dijkstra Implementation**: Custom Min-Priority Queue (Binary Min-Heap) executing in $O((V+E)\log V)$.
- 🚦 **3-Second Auto-Cycling Traffic Lights**: Traffic lights cycle between `Yellow` (+1.5 cost) and `Red` (+4.0 cost) every 3 seconds, triggering instant dynamic route recalculation.
- 🟢 **Express Shortcuts**: Assign 0.5x traversal costs to high-speed corridors.
- 🧱 **Obstacles & Roadblocks**: Block edges or intersections ($\text{cost} = \infty$) with graceful "No valid route" handling.
- 🚗 **Smooth Vehicle Simulation**: Animated vehicle marker with automatic bearing rotation, play/pause/reset controls, speed multiplier, and seamless mid-route rerouting.
- 👁️ **Step-by-Step Algorithm Exploration**: Watch Dijkstra evaluate unvisited nodes, relax edges, and build the shortest path tree step-by-step with real-time logs.
- 📊 **Real-time Telemetry Dashboard**: Displays total weighted cost, physical road distance (km), step count, traffic lights encountered, active obstacles, and execution time (ms).

---

## 🏛️ Architecture: Leaflet vs Dijkstra Separation

> [!IMPORTANT]
> **Academic Distinction**: Leaflet is strictly a presentation and interaction library. It does **not** compute routes.

| Layer | Responsibility | Implementation |
|---|---|---|
| **Mapping & GIS** | Map rendering, tiles, zoom/pan, SVG pins, polylines, layer management | Leaflet 1.9.4 CDN (`map.js`) |
| **Graph & Routing** | Graph adjacency list, edge weights, Priority Queue, Dijkstra traversal, path reconstruction | Custom Pure JavaScript ES6+ (`dijkstra.js`) |
| **Traffic System** | 3-second timer interval, state mutation, route update trigger | Custom JavaScript (`traffic.js`) |
| **Vehicle Engine** | `requestAnimationFrame` interpolation, heading bearing calculation, rerouting | Custom JavaScript (`vehicle.js`) |
| **Application UI** | Toolbar, HUD cards, event listeners, legend, algorithm visualizer drawer | Custom JavaScript (`script.js`, `styles.css`) |

---

## 🛠️ Technology Stack

- **HTML5**: Semantic layout, HUD panels, and controls.
- **CSS3**: Modern dark dashboard theme (`#0f1115` / `#181b21`), glassmorphism, responsive flex/grid layouts.
- **Vanilla JavaScript (ES6+)**: Object-oriented modules, classes, and Min-Heap.
- **Leaflet 1.9.4** (via Official CDN): Interactive map view & vector layers.
- **CartoDB Dark Matter Tiles**: High-contrast, clean dark basemap.
- **Zero Build Tools / Zero npm**: Runs straight out of the box in any browser.

---

## 🌐 Graph Representation

The road network is modeled as a weighted, directed/undirected graph $G = (V, E)$:

### 1. Nodes ($V$)
Each vertex represents a major intersection or landmark (e.g., *HITEC City*, *Charminar*, *Jubilee Hills*, *Secunderabad*):
```javascript
{
    id: "hitec_city",
    name: "HITEC City (Cyber Towers)",
    lat: 17.4504,
    lng: 78.3808,
    type: "normal", // 'normal' | 'traffic-light'
    isBlocked: false,
    lightState: "yellow" // 'yellow' (1.5) | 'red' (4.0)
}
```

### 2. Edges ($E$)
Each edge represents a bidirectional road connecting two intersections:
```javascript
{
    id: "hitec_city--madhapur",
    source: "hitec_city",
    target: "madhapur",
    distance: 1.25, // Haversine distance in km
    roadType: "normal", // 'normal' (1.0x) | 'shortcut' (0.5x) | 'blocked' (Infinity)
    isBlocked: false
}
```

---

## ⚖️ Terrain & Road Weight System

The traversal cost for traversing from node $u$ to node $v$ across edge $e = (u, v)$ is calculated as:

$$\text{Weight}(u, v) = \begin{cases} \infty & \text{if } e\text{ is blocked or } v\text{ is blocked} \\ (\text{Distance}(u,v) \times \text{Multiplier}) + \text{TrafficDelay}(v) & \text{otherwise} \end{cases}$$

| Terrain / Condition | Multiplier / Cost | Color / Icon | Visual Presentation |
|---|---|---|---|
| **Normal Road** | $1.0 \times \text{Distance}$ | `#455060` 🛣️ | Slate Gray Solid Polyline |
| **Express Shortcut** | $0.5 \times \text{Distance}$ | `#00e676` 🟢 | Emerald Glowing Polyline |
| **Yellow Traffic Light** | $+1.5\text{ Cost Delay}$ | `#fbc02d` 🟡 | Amber Glowing LED Marker |
| **Red Traffic Light** | $+4.0\text{ Cost Delay}$ | `#e53935` 🔴 | Crimson Glowing LED Marker |
| **Blocked Road / Wall** | $\infty\text{ (Impassable)}$ | `#d32f2f` 🧱 | Crimson Dashed Polyline |

---

## 🚦 Dynamic Traffic Light System

1. Traffic lights alternate states every **3 seconds**: $\text{Yellow} \leftrightarrow \text{Red}$.
2. When a light switches to **Red (+4.0)**, traversing through that intersection becomes significantly more expensive.
3. Dijkstra's Algorithm immediately checks if an alternative arterial route (e.g. bypassing through Banjara Hills or Begumpet) has a lower aggregate cost.
4. If a cheaper path is found, the route dynamically updates on the Leaflet map in real time without refreshing the page!

---

## 🚗 Vehicle Simulation & Intelligent Rerouting

- **Bearing & Rotation**: The vehicle marker dynamically calculates its compass angle $(\theta)$ between waypoints using the forward azimuth formula:
  $$\theta = \operatorname{atan2}(\sin(\Delta \lambda) \cdot \cos(\varphi_2), \cos(\varphi_1) \cdot \sin(\varphi_2) - \sin(\varphi_1) \cdot \cos(\varphi_2) \cdot \cos(\Delta \lambda))$$
- **Controls**: Play, Pause, Resume, Reset, and Speed multiplier (0.5x, 1.0x, 2.0x, 3.0x).
- **Dynamic Rerouting**: If the active route shifts while the vehicle is en route due to traffic changes, the vehicle smoothly locks onto the nearest forward segment on the new route.

---

## 👁️ Algorithm Visualizer Mode

Clicking **"👁️ Visualize Algorithm"** activates step-by-step frontier exploration:
1. **Unvisited Nodes**: Initialized to $\infty$.
2. **Currently Evaluating Node**: Highlighted in pulsing Cyan (`#00e5ff`).
3. **Settled / Visited Nodes**: Highlighted in Amber (`#ff9100`).
4. **Relaxed Edges**: Updated tentative distances logged in real time inside the **Exploration Log Drawer**.
5. **Reconstructed Path**: Traced backwards via predecessor pointers and drawn in glowing Neon Green (`#00ff88`).

---

## 📁 Project Structure

```
interactive-city-navigation/
├── index.html       # Single-entry web interface, Leaflet CDN links, HUD overlays
├── styles.css       # Dark theme styles, glassmorphism cards, glowing markers, layout
├── dijkstra.js      # Pure JS Graph data structure, MinPriorityQueue, and Dijkstra solver
├── traffic.js       # Real-time traffic light manager (3-second auto-cycle)
├── vehicle.js       # Vehicle animation engine with frame interpolation & rerouting
├── map.js           # Leaflet map manager, Hyderabad network layers, SVG icons, tool listeners
├── script.js        # Main application coordinator linking UI, stats, and modules
└── README.md        # Academic project documentation
```

---

## 🚀 How to Run

1. Clone or download this repository.
2. Open `index.html` directly in Google Chrome, Firefox, Microsoft Edge, or Safari.
3. No build step, Node.js, or local server installation is required!

---

## 🧠 Academic Explanation of Dijkstra's Algorithm

Dijkstra's algorithm solves the single-source shortest path problem on a weighted directed/undirected graph with non-negative edge weights:

1. **Initialization**:
   - Set $\text{dist}[s] = 0$ for start node $s$.
   - Set $\text{dist}[v] = \infty$ for all $v \neq s$.
   - Insert $(s, 0)$ into the Min-Priority Queue.
2. **Greedy Selection**:
   - Extract the node $u$ with minimum tentative distance $\text{dist}[u]$.
   - Mark $u$ as visited/settled.
3. **Edge Relaxation**:
   - For every outgoing edge $(u, v)$ with weight $w(u, v) \neq \infty$:
     $$\text{if } \text{dist}[u] + w(u, v) < \text{dist}[v] \implies \text{dist}[v] = \text{dist}[u] + w(u, v), \quad \text{prev}[v] = u$$
4. **Termination**:
   - Stop when the target destination node is settled.
   - Reconstruct the optimal path by backtracking predecessor pointers from target to start: $\text{target} \leftarrow \text{prev}[\text{target}] \leftarrow \dots \leftarrow \text{start}$.

### Complexity Analysis
- **Time Complexity**: $O((|V| + |E|) \log |V|)$ using our Binary Min-Heap Priority Queue.
- **Space Complexity**: $O(|V| + |E|)$ for graph representation and auxiliary arrays.

---

## 🔮 Future Improvements

- 🌦️ Weather condition modifiers (rain / waterlogging slowdowns).
- 🛣️ Multi-lane highway capacity modeling.
- 🔄 A* (A-Star) heuristic search comparison mode.
- 📍 Custom landmark addition via user click on arbitrary coordinates.
