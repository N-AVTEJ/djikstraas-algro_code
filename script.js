const GRID_SIZE = 20;
const CELL_SIZE = 40;
const map = document.getElementById('map');
const infoBar = document.getElementById('infoBar');

let grid = [];
let start = null;
let end = null;
let activeCar = null;
let carAnimationTimeout = null;
let currentPath = [];

// Initialize the grid
function initGrid() {
    map.innerHTML = '';
    grid = [];
    for (let i = 0; i < GRID_SIZE; i++) {
        grid[i] = [];
        for (let j = 0; j < GRID_SIZE; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell road';
            cell.style.left = j * CELL_SIZE + 'px';
            cell.style.top = i * CELL_SIZE + 'px';
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.addEventListener('click', handleCellClick);
            map.appendChild(cell);
            grid[i][j] = { type: 'road', element: cell, lightState: 'yellow' };
        }
    }
}

// Handle cell click events
function handleCellClick(event) {
    const cell = event.currentTarget;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const activeBtn = document.querySelector('.controls button.active');
    const action = activeBtn ? activeBtn.id : 'placeWall';

    // Prevent changing start/end into wall directly unless changing start/end
    const isStartCell = start && start.row === row && start.col === col;
    const isEndCell = end && end.row === row && end.col === col;

    switch (action) {
        case 'placeWall':
            if (isStartCell || isEndCell) return;
            if (grid[row][col].type === 'wall') {
                grid[row][col].type = 'road';
                cell.className = 'cell road';
            } else {
                grid[row][col].type = 'wall';
                cell.className = 'cell wall';
            }
            break;

        case 'toggleTrafficLight':
            if (isStartCell || isEndCell) return;
            if (grid[row][col].type === 'traffic-light') {
                grid[row][col].type = 'road';
                cell.className = 'cell road';
            } else {
                grid[row][col].type = 'traffic-light';
                grid[row][col].lightState = 'yellow';
                cell.className = 'cell traffic-light yellow';
            }
            break;

        case 'setStart':
            if (isEndCell) return;
            if (start) {
                grid[start.row][start.col].element.className = 'cell ' + grid[start.row][start.col].type;
            }
            start = { row, col };
            grid[row][col].type = 'road';
            cell.className = 'cell start';
            infoBar.textContent = 'Start point placed. Set an End point to find the route.';
            break;

        case 'setEnd':
            if (isStartCell) return;
            if (end) {
                grid[end.row][end.col].element.className = 'cell ' + grid[end.row][end.col].type;
            }
            end = { row, col };
            grid[row][col].type = 'road';
            cell.className = 'cell end';
            infoBar.textContent = 'End point placed. Calculating optimal path...';
            break;

        case 'addShortcut':
            if (isStartCell || isEndCell) return;
            if (grid[row][col].type === 'shortcut') {
                grid[row][col].type = 'road';
                cell.className = 'cell road';
            } else {
                grid[row][col].type = 'shortcut';
                cell.className = 'cell shortcut';
            }
            break;
    }

    if (start && end) {
        findPath();
    }
}

// Clear path highlighting
function clearPathHighlight() {
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            const cellData = grid[i][j];
            const isStart = start && start.row === i && start.col === j;
            const isEnd = end && end.row === i && end.col === j;

            if (isStart) {
                cellData.element.className = 'cell start';
            } else if (isEnd) {
                cellData.element.className = 'cell end';
            } else if (cellData.type === 'traffic-light') {
                cellData.element.className = `cell traffic-light ${cellData.lightState}`;
            } else {
                cellData.element.className = `cell ${cellData.type}`;
            }
        }
    }
}

// Enhanced pathfinding with traffic light cost and shortcuts
function findPath() {
    if (!start || !end) return;

    clearPathHighlight();

    const distances = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(Infinity));
    const previous = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    const unvisited = new Set();

    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            unvisited.add(`${i},${j}`);
        }
    }

    distances[start.row][start.col] = 0;

    while (unvisited.size > 0) {
        let minDist = Infinity;
        let current = null;

        for (const pos of unvisited) {
            const [r, c] = pos.split(',').map(Number);
            if (distances[r][c] < minDist) {
                minDist = distances[r][c];
                current = { row: r, col: c };
            }
        }

        if (!current || minDist === Infinity) break;

        unvisited.delete(`${current.row},${current.col}`);

        if (current.row === end.row && current.col === end.col) break;

        const neighbors = [
            { row: current.row - 1, col: current.col },
            { row: current.row + 1, col: current.col },
            { row: current.row, col: current.col - 1 },
            { row: current.row, col: current.col + 1 }
        ];

        for (const neighbor of neighbors) {
            if (neighbor.row < 0 || neighbor.row >= GRID_SIZE || neighbor.col < 0 || neighbor.col >= GRID_SIZE) continue;
            if (grid[neighbor.row][neighbor.col].type === 'wall') continue;

            let cost = 1;
            const neighborCell = grid[neighbor.row][neighbor.col];
            if (neighborCell.type === 'shortcut') {
                cost = 0.5;
            } else if (neighborCell.type === 'traffic-light') {
                cost = neighborCell.lightState === 'red' ? 4 : 1.5;
            }

            const newDist = distances[current.row][current.col] + cost;

            if (newDist < distances[neighbor.row][neighbor.col]) {
                distances[neighbor.row][neighbor.col] = newDist;
                previous[neighbor.row][neighbor.col] = current;
            }
        }
    }

    if (distances[end.row][end.col] === Infinity) {
        infoBar.textContent = '⚠️ No path possible between Start and End (blocked by walls).';
        if (activeCar) {
            activeCar.remove();
            activeCar = null;
        }
        return;
    }

    currentPath = [];
    let curr = end;
    while (curr) {
        currentPath.unshift(curr);
        if (curr.row === start.row && curr.col === start.col) break;
        curr = previous[curr.row][curr.col];
    }

    // Highlight path
    for (let i = 1; i < currentPath.length - 1; i++) {
        const pt = currentPath[i];
        grid[pt.row][pt.col].element.classList.add('path');
    }

    infoBar.textContent = `✅ Path found! Steps: ${currentPath.length - 1}, Total Cost: ${distances[end.row][end.col].toFixed(1)}`;
    animateCarOnPath(currentPath);
}

// Animate car on found path
function animateCarOnPath(path) {
    if (carAnimationTimeout) {
        clearTimeout(carAnimationTimeout);
    }

    if (!activeCar) {
        activeCar = document.createElement('div');
        activeCar.className = 'car';
        map.appendChild(activeCar);
    }

    let stepIndex = 0;

    function moveStep() {
        if (!activeCar || !path || stepIndex >= path.length) return;
        const pt = path[stepIndex];
        activeCar.style.left = (pt.col * CELL_SIZE) + 'px';
        activeCar.style.top = (pt.row * CELL_SIZE) + 'px';
        stepIndex++;

        if (stepIndex < path.length) {
            carAnimationTimeout = setTimeout(moveStep, 250);
        } else {
            // Loop car animation after reaching end
            carAnimationTimeout = setTimeout(() => {
                stepIndex = 0;
                moveStep();
            }, 1200);
        }
    }

    moveStep();
}

// Traffic light blinking
function blinkTrafficLights() {
    let hasTrafficLights = false;
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            const cell = grid[i][j];
            if (cell.type === 'traffic-light') {
                hasTrafficLights = true;
                cell.lightState = cell.lightState === 'yellow' ? 'red' : 'yellow';
                cell.element.className = `cell traffic-light ${cell.lightState}`;
            }
        }
    }

    // If lights changed and start/end are present, recalculate route cost
    if (hasTrafficLights && start && end) {
        findPath();
    }

    setTimeout(blinkTrafficLights, 3000);
}

// Add hurdles to the grid
function addHurdles() {
    let count = 0;
    while (count < 8) {
        const row = Math.floor(Math.random() * GRID_SIZE);
        const col = Math.floor(Math.random() * GRID_SIZE);
        if (grid[row][col].type === 'road') {
            grid[row][col].type = 'wall';
            grid[row][col].element.className = 'cell wall';
            count++;
        }
    }
}

// Reset the grid and remove all elements
function resetGrid() {
    if (carAnimationTimeout) clearTimeout(carAnimationTimeout);
    if (activeCar) {
        activeCar.remove();
        activeCar = null;
    }

    grid.forEach(row => row.forEach(cell => {
        cell.type = 'road';
        cell.lightState = 'yellow';
        cell.element.className = 'cell road';
    }));

    start = null;
    end = null;
    currentPath = [];
    infoBar.textContent = 'Map reset. Select tools above to draw and configure your city map.';
}

// Zoom and pan functionality
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

function updateMapTransform() {
    map.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

map.parentElement.addEventListener('mousedown', (e) => {
    // Only pan when middle click or alt + left click
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isDragging = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
        e.preventDefault();
    }
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        updateMapTransform();
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

map.parentElement.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
            scale = Math.min(scale * 1.1, 2.5);
        } else {
            scale = Math.max(scale / 1.1, 0.5);
        }
        updateMapTransform();
    }
}, { passive: false });

// Control button click handling
document.querySelectorAll('.controls button').forEach(button => {
    button.addEventListener('click', () => {
        if (button.id === 'resetMap') return;
        document.querySelectorAll('.controls button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');

        const toolNames = {
            placeWall: 'Wall Tool (Click cells to toggle walls)',
            toggleTrafficLight: 'Traffic Light Tool (Click cells to add/remove traffic lights)',
            setStart: 'Start Point Tool (Click a cell to set origin)',
            setEnd: 'Destination Tool (Click a cell to set destination)',
            addShortcut: 'Shortcut Tool (Click cells to add high-speed green paths)'
        };
        if (toolNames[button.id]) {
            infoBar.textContent = `Selected: ${toolNames[button.id]}`;
        }
    });
});

document.getElementById('resetMap').addEventListener('click', resetGrid);

// Initialize everything on load
initGrid();
addHurdles();
blinkTrafficLights();