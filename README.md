# Interactive City Navigation using Leaflet + Dijkstra's Algorithm

A comprehensive, fully functional educational web application that demonstrates **Dijkstra's Shortest-Path Algorithm visually on an interactive geographic map** using **Leaflet 1.9.4** and **OpenStreetMap tiles**.

This application simulates real-time navigation across a realistic road network in **Hyderabad, India** (encompassing HITEC City, Gachibowli, Madhapur, Kondapur, and Jubilee Hills), featuring dynamic weighted traversal costs, live automated traffic light cycles, obstacle placement, express shortcuts, and animated vehicle routing.

---

## 1. Project Overview

The objective of this project is to provide a clean, visually compelling, and academically thorough visualizer for graph pathfinding and Dijkstra's algorithm under real-world dynamic road conditions.

* **Map Center**: Hyderabad, India (HITEC City / Knowledge City / Gachibowli Corridor)
* **Underlying Model**: Pure custom JavaScript weighted Graph (independent of Leaflet).
* **Pathfinding**: Manual Dijkstra's Algorithm implementation with greedy edge relaxation.
* **Dynamic Recalculation**: Automated 3-second traffic light state transitions triggering real-time re-routing.
* **Vehicle Navigation**: Smooth client-side vehicle animation with mid-transit re-routing capabilities.

---

## 2. Technology Stack

* **HTML5**: Semantic UI structure and dashboard layout.
* **CSS3**: Modern dark theme design (`#0f1115` canvas, `#181b21` panels, neon accents, CSS transitions, and custom pulse animations).
* **Vanilla JavaScript (ES6+)**: Custom Graph data structure, Dijkstra solver, traffic state machine, and interpolation-based vehicle animator.
* **Leaflet 1.9.4**: Map rendering, tile management, polyline layers, marker icons, and coordinate click events.
* **OpenStreetMap / CARTO Voyager**: Base map tile layers.

> **Zero Build Tools or Node Dependencies**: The application runs directly by opening `index.html` in any modern web browser without requiring `npm`, `webpack`, `vite`, `react`, or server setup.

---

## 3. Strict Separation of Concerns

An essential educational principle of this project is the **clear boundary between Leaflet and Custom JavaScript**:

```
????????????????????????????????????????????????????????????
?                   Leaflet 1.9.4 Layer                    ?
?  - Geographic Map Tile Rendering (OpenStreetMap)         ?
?  - Interactive Pan & Zoom Controls                       ?
?  - Markers (Start, End, Traffic Lights, Obstacles)       ?
?  - Route Polylines & Glow Layers                         ?
?  - Coordinate Click Detection                            ?
????????????????????????????????????????????????????????????
                             ? Geographic Lat/Lng Events
                             ?
????????????????????????????????????????????????????????????
?                   Custom JavaScript Layer                ?
?  - Weighted Graph Model (Nodes, Edges, Adjacency List)   ?
?  - Manual Dijkstra Shortest-Path Solver                  ?
?  - Cost Matrix & Multipliers Calculation                 ?
?  - Automated Traffic Light Cycle State Machine (3s)      ?
?  - Real-Time Route Recalculator                          ?
?  - Interpolated Vehicle Path Animator                    ?
????????????????????????????????????????????????????????????
```

* **Leaflet is NOT a routing engine**: It is solely responsible for rendering coordinates, markers, and polylines on the visual map.
* **Custom JavaScript**: Manages the graph structure, calculates Haversine distances, assigns weight penalties, executes Dijkstra's algorithm, and reconstructs optimal paths.

---

## 4. Graph Representation & Mathematical Weight Formulation

### 4.1. Graph Structure
The city is modeled as a directed/bidirectional weighted graph $G = (V, E)$:
* **Vertices ($V$)**: 28 landmark junctions in Hyderabad (e.g., Cyber Towers, Mindspace, IKEA Junction, Durgam Cheruvu Cable Bridge, Jubilee Hills Rd 36, etc.).
* **Edges ($E$)**: 45+ interconnected road segments connecting junctions.
* **Adjacency Representation**: An adjacency list mapping each node ID to its neighbors, edge references, physical distances, and active road attributes.

### 4.2. Traversal Cost Formulation
For any road segment from junction $u$ to junction $v$ across edge $e = (u, v)$:

$$	ext{Weight}(u, v) = 	ext{Distance}(u, v) 	imes 	ext{Multiplier}_{	ext{road}}(e) 	imes 	ext{Multiplier}_{	ext{traffic}}(v)$$

### 4.3. Conceptual Cost Multipliers:

| Entity | Symbol / Visual | Cost Multiplier | Description |
| :--- | :---: | :---: | :--- |
| **Normal Road** | ??? (Slate Line) | **`1.0`** | Base road segment cost ($1.0 	imes 	ext{Distance}$). |
| **Shortcut / Express Road** | ?? (Emerald Line) | **`0.5`** | High-speed express road with 50% reduced cost. |
| **Yellow Traffic Light** | ?? (Amber Light) | **`1.5`** | Moderate intersection delay (+50% weighted penalty). |
| **Red Traffic Light** | ?? (Crimson Light) | **`4.0`** | Heavy intersection wait delay (+300% weighted penalty). |
| **Obstacle / Blocked Road** | ?? / ? (Red Dashed) | **`Infinity`** | Impassable road or blocked junction. Skipped by Dijkstra. |

---

## 5. Dijkstra's Algorithm Implementation

The pathfinding algorithm is implemented from scratch in `dijkstra.js` following classical graph theory principles:

1. **Initialization**:
   * Set tentative distance $d(v) = \infty$ for all $v \in V$.
   * Set $d(	ext{start}) = 0$.
   * Maintain an unvisited set $Q = V$.
   * Initialize predecessor pointers $\pi(v) = 	ext{null}$.

2. **Greedy Selection**:
   * Extract node $u \in Q$ with the minimum tentative distance $d(u)$.
   * Mark $u$ as visited ($Q \leftarrow Q \setminus \{u\}$).

3. **Edge Relaxation**:
   * For each unvisited neighbor $v$ of $u$:
     * Compute traversal weight $w(u, v) = 	ext{calculateEdgeWeight}(e, v)$.
     * If $w(u, v) = \infty$ (obstacle), skip the edge.
     * Calculate tentative distance $d_{	ext{tentative}} = d(u) + w(u, v)$.
     * If $d_{	ext{tentative}} < d(v)$:
       * Update distance: $d(v) \leftarrow d_{	ext{tentative}}$.
       * Update predecessor: $\pi(v) \leftarrow u$.

4. **Termination & Path Reconstruction**:
   * When $u = 	ext{destination}$, stop early (greedy optimality guarantee for non-negative weights).
   * Reconstruct the path by traversing predecessor pointers backwards from destination to start: $	ext{dest} \leftarrow \pi(	ext{dest}) \leftarrow \dots \leftarrow 	ext{start}$.

---

## 6. Dynamic Real-Time Recalculation

One of the application's most powerful features is **live dynamic re-routing**:
1. Traffic lights automatically cycle between **Yellow (1.5x)** and **Red (4.0x)** every **3 seconds**.
2. When a light on the active route turns **Red**, its traversal cost increases dramatically.
3. If an alternate bypass avenue (e.g., via Durgam Cheruvu Cable Bridge or Kavuri Hills) becomes cheaper, Dijkstra dynamically detects the lower-cost route.
4. The route polyline on Leaflet immediately transitions to the new path without page reload.
5. The vehicle animator calculates its current coordinates and smoothly redirects along the updated route mid-transit.

---

## 7. Interactive Features & Tools

* **?? Select Tool**: Inspect any junction or road to view exact coordinates, connected neighbors, traffic status, and physical length.
* **?? Start Tool**: Click any junction to set the origin point.
* **?? Destination Tool**: Click any junction to set the destination.
* **?? Wall / Obstacle Tool**: Click any junction to toggle a blocked obstacle ($	ext{Weight} = \infty$).
* **?? Traffic Light Tool**: Click any junction to place or manually toggle traffic lights.
* **?? Shortcut Tool**: Click two junctions sequentially to create or toggle an Express Shortcut ($	ext{Weight} = 0.5	imes$).
* **? Run Dijkstra**: Force calculation of the optimal path.
* **?? Vehicle Animation**: Start, Pause, Resume, and Reset controls with customizable speed slider.
* **?? / ?? Step-by-Step Algorithm Visualizer**: Step forward/backward or play automated exploration showing visited nodes (cyan), evaluated edges (amber), and tentative cost updates.
* **?? Live Statistics Panel**: Real-time display of weighted cost, physical distance (km/m), path nodes, calculation time (ms), traffic lights encountered, shortcuts used, and blocked roads in the city.
* **?? Live Execution Log**: Chronological event feed logging every Dijkstra relaxation step and traffic transition.

---

## 8. Project Structure

```text
interactive-city-navigation/
?
??? index.html      # Main HTML5 entry point with dark dashboard layout & Leaflet CDN
??? styles.css      # Dark theme UI styles, badges, marker pins, pulses, and animations
??? dijkstra.js     # Custom Graph data structure & DijkstraSolver with step tracer
??? traffic.js      # Traffic light 3-second automated cycle manager
??? vehicle.js      # Smooth requestAnimationFrame vehicle animator & dynamic rerouter
??? map.js          # Leaflet map manager, layer groups, custom markers, and polylines
??? script.js       # Application coordinator, Hyderabad road network, and UI wiring
??? README.md       # Comprehensive documentation and technical report
```

---

## 9. How to Run the Application

1. Clone or download this repository.
2. Locate `index.html` in the project root directory.
3. Double-click `index.html` or open it with Google Chrome, Mozilla Firefox, Microsoft Edge, or Safari.
4. No web server, node installation, or build commands are needed.

---

## 10. Future Enhancements

* **Time-of-Day Traffic Profiles**: Predefined rush-hour traffic simulations for morning and evening peaks.
* **A\* Search Comparison**: Side-by-side visualization comparing Dijkstra's Algorithm with A* Search using Haversine heuristic.
* **Multi-Vehicle Fleets**: Simultaneous routing of multiple autonomous vehicles with collision avoidance.
* **Elevation / Gradient Weights**: Modeling slope elevation changes in weighted routing.
