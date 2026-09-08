# 🚗 Interactive City Navigation (Dijkstra's Algorithm Visualizer)

An interactive grid-based city navigation and shortest-path visualization web application powered by **Dijkstra's Algorithm**. Build custom city layouts, place dynamic traffic lights and express shortcuts, configure obstacles, and watch routes dynamically adapt and animate in real time.

---

## 🌟 Key Features

- **Dynamic Dijkstra's Pathfinding**: Calculates the shortest path taking into account weighted terrain costs and real-time road conditions.
- **Dynamic Traffic Lights**: Traffic lights automatically cycle between *Yellow* and *Red* every 3 seconds, triggering real-time path recalculations if route costs change.
- **Cost-Weighted Terrain**:
  - 🛣️ **Regular Road**: Standard traversal cost (`1.0`).
  - ⚡ **Shortcut (Express Lane)**: High-speed path with reduced cost (`0.5`).
  - 🟡 **Yellow Traffic Light**: Moderate delay cost (`1.5`).
  - 🔴 **Red Traffic Light**: Heavy delay cost (`4.0`).
  - 🧱 **Wall / Hurdle**: Impassable barrier (`Infinity`).
- **Animated Vehicle Simulation**: A vehicle smoothly navigates the computed optimal path from start to destination.
- **Interactive Grid Editor**: Easily place walls, traffic lights, shortcuts, start, and end points via intuitive toolbars.
- **Map Pan & Zoom**:
  - **Zoom**: `Ctrl + Mouse Wheel`
  - **Pan**: `Alt + Left Click Drag` or `Middle Click Drag`
- **Zero External Dependencies**: Built with pure HTML5, CSS3, and modern Vanilla JavaScript.

---

## 📊 Terrain & Edge Weight Matrix

| Cell Type | Color Indicator | Traversal Cost | Description |
| :--- | :--- | :--- | :--- |
| **Road** | Dark Gray (`#333333`) | `1.0` | Default open city street |
| **Shortcut** | Green (`#2e7d32`) | `0.5` | Express lane / highway route |
| **Traffic Light (Yellow)** | Yellow (`#fbc02d`) | `1.5` | Minor delay / slowing down |
| **Traffic Light (Red)** | Red (`#e53935`) | `4.0` | Heavy traffic congestion / red light stop |
| **Wall / Hurdle** | Crimson (`#d32f2f`) | `∞` (Blocked) | Buildings, roadblocks, or obstacles |
| **Start Point** | Bright Blue (`#00b0ff`) | — | Origin of journey |
| **End Point** | Purple (`#e040fb`) | — | Target destination |
| **Optimal Path** | Neon Green (`#00e676`) | — | Highlighted shortest path |

---

## 🛠️ Project Structure

```text
├── index.html       # HTML structure, toolbar controls, and viewport wrapper
├── styles.css       # Dark-mode styling, grid layout, animations, and color schemes
├── script.js       # Dijkstra algorithm, grid state, animations, and event listeners
└── README.md        # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
No build tools, package managers, or local server setups are required. A modern web browser (Google Chrome, Microsoft Edge, Firefox, Brave, Safari) is all you need.

### Running Locally
1. **Clone the repository**:
   ```bash
   git clone https://github.com/N-AVTEJ/djikstraas-algro_code.git
   ```
2. **Navigate to the directory**:
   ```bash
   cd djikstraas-algro_code
   ```
3. **Open in Browser**:
   - Double-click `index.html`, or
   - Right-click `index.html` and select **Open with Live Server** (if using VS Code), or
   - Open it directly in your browser:
     ```bash
     start index.html   # On Windows
     open index.html    # On macOS
     xdg-open index.html # On Linux
     ```

---

## 🎮 How to Use

1. **Select a Tool** from the top control panel:
   - **Place Wall**: Click any grid cell to create or remove barriers.
   - **Toggle Traffic Light**: Add or remove dynamic traffic lights that change state periodically.
   - **Set Start**: Place the origin point (blue).
   - **Set End**: Place the destination point (purple).
   - **Add Shortcut**: Create green express lanes that reduce routing costs.
   - **Reset Map**: Clear all walls, points, traffic lights, and paths to start fresh.
2. **Observe Pathfinding**:
   - Once both **Start** and **End** points are placed, the optimal path is automatically computed and displayed.
   - The status bar displays total step count and weighted route cost.
   - A vehicle will animate along the path.
3. **Explore Dynamic Routing**:
   - Place a traffic light along the active path. When the light switches from Yellow to Red, watch the algorithm automatically divert traffic around the bottleneck if an alternative route has lower overall cost!

---

## 🧠 Algorithm Implementation Details

The pathfinding is driven by **Dijkstra's Algorithm**:
1. An unvisited set of grid coordinates and a distance matrix initialized to `Infinity` (with `distance[start] = 0`) are maintained.
2. At each iteration, the unvisited cell with the minimum tentative distance is selected.
3. 4-directional adjacent neighbors (Up, Down, Left, Right) are evaluated for bounds and wall obstacles.
4. Step costs are evaluated dynamically based on cell types and traffic light states (`0.5`, `1.0`, `1.5`, or `4.0`).
5. Tentative distances are updated, and predecessor pointers are recorded.
6. Once the destination is reached or unvisited cells are exhausted, the path is reconstructed backwards and animated.

---

## 💻 Technologies Used

- **HTML5**: Semantic UI layout and control containers.
- **CSS3**: Flexbox, custom CSS transitions, responsive grid cells, and glow effects.
- **JavaScript (ES6+)**: Custom Dijkstra graph traversal, DOM manipulation, asynchronous timer cycles (`setTimeout`), and pan/zoom transform math.

---

## 📝 License

Distributed under the MIT License. Feel free to use and modify for learning and personal projects!
