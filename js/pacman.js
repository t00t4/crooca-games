const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE = 20;
const COLS = 28;
const ROWS = 31;
const HUD_HEIGHT = 40;

canvas.width = COLS * TILE;
canvas.height = ROWS * TILE + HUD_HEIGHT;

const COLORS = {
    wall: '#1a3a8a',
    wallStroke: '#4488ff',
    dot: '#ffff88',
    powerPellet: '#ffaa00',
    pacman: '#ffe600',
    bg: '#000',
    text: '#e7ecf5',
    ghostVulnerable: '#2222ff',
    ghostFlashing: '#ffffff',
};

const GHOST_COLORS = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];

// Labirinto clássico do Pac-Man (28x31). '#'=parede '.'=ponto '@'=power
// pellet '-'=interior da casa dos fantasmas (só fantasma) ' '=vazio andável.
const RAW_MAZE = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#@#  #.#   #.##.#   #.#  #@#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "     #.##### ## #####.#     ",
    "     #.##          ##.#     ",
    "     #.## ###--### ##.#     ",
    "######.## #------# ##.######",
    "      .   #------#   .      ",
    "######.## #------# ##.######",
    "     #.## ######## ##.#     ",
    "     #.##          ##.#     ",
    "     #.## ######## ##.#     ",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#@..##.......  .......##..@#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################",
].map(row => row.padEnd(COLS, ' '));

const TILE_CODE = { '#': 1, '.': 2, '@': 3, '-': 4, ' ': 0 };

const PACMAN_START = { x: 13, y: 23 };
const GHOST_HOUSE_ROW = 14;
const GHOST_HOUSE_COLS = [12, 13, 14, 15];
const GATE = { x: 13.5, y: 11 };

const DIR = {
    NONE: { x: 0, y: 0 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
};

const SCATTER_TARGETS = [
    { x: COLS - 3, y: -3 },
    { x: 2, y: -3 },
    { x: COLS - 1, y: ROWS + 1 },
    { x: 0, y: ROWS + 1 },
];

const MODE_SCHEDULE = [7, 20, 7, 20, 5, 20, 5, Infinity];

const PACMAN_SPEED = 8.4;      // tiles/seg
const GHOST_SPEED = 7.4;
const GHOST_FRIGHTENED_SPEED = 4.6;
const GHOST_EATEN_SPEED = 15;

let map = [];
let dotsTotal = 0;
let dotsEaten = 0;
let score = 0;
let lives = 3;
let level = 1;
let gameRunning = true;
let gameLoopId = null;
let mouthAngle = 0;
let mouthDir = 1;
let pelletBlinkTimer = 0;

let pacman;
let ghosts = [];

const GHOST_MODES = { SCATTER: 0, CHASE: 1, FRIGHTENED: 2, EATEN: 3 };
let globalMode = GHOST_MODES.SCATTER;
let modeTimer = 0;
let modeIndex = 0;
let frightenedTimer = 0;
let ghostsEatenCombo = 0;

function buildMap() {
    map = RAW_MAZE.map(row => row.split('').map(ch => TILE_CODE[ch] ?? 0));
    dotsTotal = 0;
    dotsEaten = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (map[r][c] === 2 || map[r][c] === 3) dotsTotal++;
        }
    }
}

function tileAt(x, y) {
    const c = wrapCol(Math.round(x));
    const r = Math.round(y);
    if (r < 0 || r >= ROWS) return 1;
    return map[r][c];
}

function wrapCol(c) {
    if (c < 0) return COLS - 1;
    if (c >= COLS) return 0;
    return c;
}

function isWalkableForPacman(col, row) {
    if (row < 0 || row >= ROWS) return false;
    const tile = map[row][wrapCol(col)];
    return tile !== 1 && tile !== 4;
}

function isWalkableForGhost(col, row) {
    if (row < 0 || row >= ROWS) return false;
    const tile = map[row][wrapCol(col)];
    return tile !== 1;
}

function createPacman() {
    return {
        x: PACMAN_START.x,
        y: PACMAN_START.y,
        dir: DIR.NONE,
        nextDir: DIR.NONE,
    };
}

function createGhost(index) {
    return {
        x: GHOST_HOUSE_COLS[index],
        y: GHOST_HOUSE_ROW,
        dir: DIR.UP,
        color: GHOST_COLORS[index],
        index,
        state: 'house',           // house -> exiting -> active | frightened | eaten
        mode: GHOST_MODES.SCATTER,
        exitTimer: index * 60,     // frames antes de sair (staggered)
        bounceDir: 1,
        frightenedTimer: 0,
    };
}

function initGhosts() {
    ghosts = [0, 1, 2, 3].map(createGhost);
}

function alignedToGrid(pos) {
    return Math.abs(pos - Math.round(pos)) < 0.04;
}

// --- MOVIMENTO DO PAC-MAN (contínuo, com buffer de direção) ---

function updatePacman(dt) {
    const atCol = alignedToGrid(pacman.x);
    const atRow = alignedToGrid(pacman.y);

    if (atCol && atRow) {
        const col = Math.round(pacman.x);
        const row = Math.round(pacman.y);
        pacman.x = col;
        pacman.y = row;

        if (pacman.nextDir !== DIR.NONE) {
            const nc = wrapCol(col + pacman.nextDir.x);
            const nr = row + pacman.nextDir.y;
            if (isWalkableForPacman(nc, nr)) {
                pacman.dir = pacman.nextDir;
            }
        }

        const fc = wrapCol(col + pacman.dir.x);
        const fr = row + pacman.dir.y;
        if (!isWalkableForPacman(fc, fr)) {
            pacman.dir = DIR.NONE;
        }

        eatAt(col, row);
    }

    if (pacman.dir !== DIR.NONE) {
        pacman.x += pacman.dir.x * PACMAN_SPEED * dt;
        pacman.y += pacman.dir.y * PACMAN_SPEED * dt;
        if (pacman.x < -0.5) pacman.x = COLS - 0.5;
        if (pacman.x > COLS - 0.5) pacman.x = -0.5;
    }
}

function eatAt(col, row) {
    const tile = map[row][col];
    if (tile === 2) {
        map[row][col] = 0;
        score += 10;
        dotsEaten++;
    } else if (tile === 3) {
        map[row][col] = 0;
        score += 50;
        dotsEaten++;
        activateFrightened();
    }
    if (dotsEaten >= dotsTotal) winLevel();
}

function activateFrightened() {
    frightenedTimer = 7 * 60;
    ghostsEatenCombo = 0;
    ghosts.forEach(g => {
        if (g.state === 'active') {
            g.state = 'frightened';
            g.dir = { x: -g.dir.x, y: -g.dir.y };
        }
    });
}

// --- IA DOS FANTASMAS ---

function getGhostTarget(ghost) {
    if (ghost.state === 'frightened') {
        return { x: Math.random() * COLS, y: Math.random() * ROWS };
    }
    if (ghost.state === 'eaten') {
        return GATE;
    }
    if (ghost.mode === GHOST_MODES.SCATTER) {
        return SCATTER_TARGETS[ghost.index];
    }
    switch (ghost.index) {
        case 0: // Blinky: mira direto no Pac-Man
            return { x: pacman.x, y: pacman.y };
        case 1: { // Pinky: mira 4 tiles à frente do Pac-Man
            let tx = pacman.x + pacman.dir.x * 4;
            let ty = pacman.y + pacman.dir.y * 4;
            if (pacman.dir === DIR.UP) tx -= 4; // bug clássico do jogo original
            return { x: tx, y: ty };
        }
        case 2: { // Inky: vetor duplicado a partir do Blinky
            const blinky = ghosts[0];
            const ax = pacman.x + pacman.dir.x * 2;
            const ay = pacman.y + pacman.dir.y * 2;
            return { x: ax + (ax - blinky.x), y: ay + (ay - blinky.y) };
        }
        case 3: { // Clyde: persegue se longe, foge para o canto se perto
            const dist = Math.hypot(ghost.x - pacman.x, ghost.y - pacman.y);
            return dist > 8 ? { x: pacman.x, y: pacman.y } : SCATTER_TARGETS[3];
        }
        default:
            return { x: pacman.x, y: pacman.y };
    }
}

function ghostSpeed(ghost) {
    if (ghost.state === 'eaten') return GHOST_EATEN_SPEED;
    if (ghost.state === 'frightened') return GHOST_FRIGHTENED_SPEED;
    return GHOST_SPEED;
}

function updateGhostHouse(ghost, dt) {
    ghost.y += ghost.bounceDir * 1.2 * dt;
    if (ghost.y > GHOST_HOUSE_ROW + 0.4) ghost.bounceDir = -1;
    if (ghost.y < GHOST_HOUSE_ROW - 0.4) ghost.bounceDir = 1;

    ghost.exitTimer -= 1;
    if (ghost.exitTimer <= 0) {
        ghost.state = 'exiting';
    }
}

function updateGhostExiting(ghost, dt) {
    const speed = ghostSpeed(ghost) * dt;
    if (Math.abs(ghost.x - GATE.x) > 0.05) {
        ghost.x += Math.sign(GATE.x - ghost.x) * speed;
        ghost.dir = ghost.x < GATE.x ? DIR.RIGHT : DIR.LEFT;
        return;
    }
    ghost.x = GATE.x;
    if (ghost.y > GATE.y) {
        ghost.y -= speed;
        ghost.dir = DIR.UP;
        return;
    }
    ghost.y = GATE.y;
    ghost.state = ghost.eatenReturning ? 'active' : 'active';
    ghost.eatenReturning = false;
    ghost.mode = globalMode;
    ghost.dir = DIR.LEFT;
}

function updateGhostActive(ghost, dt) {
    const atCol = alignedToGrid(ghost.x);
    const atRow = alignedToGrid(ghost.y);

    if (atCol && atRow) {
        const col = Math.round(ghost.x);
        const row = Math.round(ghost.y);
        ghost.x = col;
        ghost.y = row;

        if (ghost.state === 'eaten' && col === Math.round(GATE.x) && row >= GHOST_HOUSE_ROW - 1) {
            ghost.state = 'house';
            ghost.exitTimer = 1;
            ghost.eatenReturning = true;
            ghost.y = GHOST_HOUSE_ROW;
            return;
        }

        const target = getGhostTarget(ghost);
        const options = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT].filter(d => {
            if (d.x === -ghost.dir.x && d.y === -ghost.dir.y) return false;
            return isWalkableForGhost(wrapCol(col + d.x), row + d.y);
        });

        if (options.length === 0) {
            ghost.dir = { x: -ghost.dir.x, y: -ghost.dir.y };
        } else if (options.length === 1) {
            ghost.dir = options[0];
        } else {
            let best = options[0];
            let bestDist = Infinity;
            for (const d of options) {
                const nx = col + d.x;
                const ny = row + d.y;
                const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
                if (dist < bestDist) { bestDist = dist; best = d; }
            }
            ghost.dir = best;
        }
    }

    const speed = ghostSpeed(ghost);
    ghost.x += ghost.dir.x * speed * dt;
    ghost.y += ghost.dir.y * speed * dt;
    if (ghost.x < -0.5) ghost.x = COLS - 0.5;
    if (ghost.x > COLS - 0.5) ghost.x = -0.5;
}

function updateGhost(ghost, dt) {
    if (ghost.frightenedTimer > 0) ghost.frightenedTimer -= dt * 60;

    if (ghost.state === 'house') updateGhostHouse(ghost, dt);
    else if (ghost.state === 'exiting') updateGhostExiting(ghost, dt);
    else updateGhostActive(ghost, dt);
}

function checkCollisions() {
    for (const ghost of ghosts) {
        const dist = Math.hypot(ghost.x - pacman.x, ghost.y - pacman.y);
        if (dist < 0.6) {
            if (ghost.state === 'frightened') {
                ghost.state = 'eaten';
                ghostsEatenCombo++;
                score += 200 * ghostsEatenCombo;
            } else if (ghost.state === 'active') {
                loseLife();
                return;
            }
        }
    }
}

function loseLife() {
    lives--;
    if (lives <= 0) {
        gameRunning = false;
    } else {
        pacman = createPacman();
        initGhosts();
        modeIndex = 0;
        modeTimer = 0;
        globalMode = GHOST_MODES.SCATTER;
        frightenedTimer = 0;
    }
}

function winLevel() {
    level++;
    buildMap();
    pacman = createPacman();
    initGhosts();
    modeIndex = 0;
    modeTimer = 0;
    globalMode = GHOST_MODES.SCATTER;
    frightenedTimer = 0;
}

// --- RENDER ---

function drawMaze() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const tile = map[r][c];
            const x = c * TILE;
            const y = r * TILE;

            if (tile === 1) {
                ctx.fillStyle = COLORS.wall;
                ctx.fillRect(x, y, TILE, TILE);
                ctx.strokeStyle = COLORS.wallStroke;
                ctx.lineWidth = 1;
                if (r === 0 || map[r - 1][c] !== 1) { ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + TILE, y + 0.5); ctx.stroke(); }
                if (r === ROWS - 1 || map[r + 1][c] !== 1) { ctx.beginPath(); ctx.moveTo(x, y + TILE - 0.5); ctx.lineTo(x + TILE, y + TILE - 0.5); ctx.stroke(); }
                if (c === 0 || map[r][c - 1] !== 1) { ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + TILE); ctx.stroke(); }
                if (c === COLS - 1 || map[r][c + 1] !== 1) { ctx.beginPath(); ctx.moveTo(x + TILE - 0.5, y); ctx.lineTo(x + TILE - 0.5, y + TILE); ctx.stroke(); }
            } else if (tile === 2) {
                ctx.fillStyle = COLORS.dot;
                ctx.beginPath();
                ctx.arc(x + TILE / 2, y + TILE / 2, 2.5, 0, Math.PI * 2);
                ctx.fill();
            } else if (tile === 3) {
                if (pelletBlinkTimer % 20 < 14) {
                    ctx.fillStyle = COLORS.powerPellet;
                    ctx.beginPath();
                    ctx.arc(x + TILE / 2, y + TILE / 2, 6, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
    pelletBlinkTimer++;
}

function drawPacman() {
    const x = pacman.x * TILE + TILE / 2;
    const y = pacman.y * TILE + TILE / 2;
    const radius = TILE / 2 - 1;

    if (pacman.dir !== DIR.NONE) {
        mouthAngle += 0.2 * mouthDir;
        if (mouthAngle > 0.35 || mouthAngle < 0.02) mouthDir = -mouthDir;
    }

    let angle = 0;
    if (pacman.dir === DIR.RIGHT) angle = 0;
    else if (pacman.dir === DIR.DOWN) angle = Math.PI / 2;
    else if (pacman.dir === DIR.LEFT) angle = Math.PI;
    else if (pacman.dir === DIR.UP) angle = -Math.PI / 2;

    ctx.fillStyle = COLORS.pacman;
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius, angle + mouthAngle * Math.PI, angle + (2 - mouthAngle) * Math.PI);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawGhost(ghost) {
    const x = ghost.x * TILE + TILE / 2;
    const y = ghost.y * TILE + TILE / 2;
    const r = TILE / 2 - 1;

    if (ghost.state === 'eaten') {
        drawGhostEyes(x, y, ghost.dir);
        return;
    }

    let color = ghost.color;
    if (ghost.state === 'frightened') {
        color = frightenedTimer < 120 && Math.floor(frightenedTimer / 8) % 2 === 0
            ? COLORS.ghostFlashing : COLORS.ghostVulnerable;
    }

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x, y - 2, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r - 2);
    const wave = 3;
    for (let i = 0; i < 3; i++) {
        const bx = x + r - (i * 2 + 1) * (r / 3);
        ctx.quadraticCurveTo(bx + r / 3, y + r - 2 + wave, bx, y + r - 2);
        ctx.quadraticCurveTo(bx - r / 3, y + r - 2 - wave, bx - (r / 3) * 2, y + r - 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    if (ghost.state !== 'frightened') drawGhostEyes(x, y, ghost.dir);
    else drawFrightenedFace(x, y);
}

function drawGhostEyes(x, y, dir) {
    const eoX = dir.x * 2;
    const eoY = dir.y * 2;

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(x - 4 + eoX, y - 3 + eoY, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 4 + eoX, y - 3 + eoY, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1111aa';
    ctx.beginPath();
    ctx.arc(x - 4 + eoX * 1.5, y - 2 + eoY * 1.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 4 + eoX * 1.5, y - 2 + eoY * 1.5, 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawFrightenedFace(x, y) {
    ctx.strokeStyle = '#ffaa88';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 3);
    ctx.lineTo(x - 2, y - 3);
    ctx.moveTo(x + 2, y - 3);
    ctx.lineTo(x + 5, y - 3);
    ctx.stroke();
}

function drawHUD() {
    const hudY = ROWS * TILE;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, hudY, canvas.width, HUD_HEIGHT);

    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 10, hudY + 24);

    ctx.textAlign = 'center';
    ctx.fillText(`LV ${level}`, canvas.width / 2, hudY + 24);

    ctx.textAlign = 'right';
    for (let i = 0; i < lives; i++) {
        ctx.fillStyle = COLORS.pacman;
        ctx.beginPath();
        ctx.arc(canvas.width - 20 - i * 24, hudY + 20, 8, 0.2 * Math.PI, 1.8 * Math.PI);
        ctx.lineTo(canvas.width - 20 - i * 24, hudY + 20);
        ctx.closePath();
        ctx.fill();
    }
}

function drawOverlay(text, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height - HUD_HEIGHT);
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff5c7a';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, (canvas.height - HUD_HEIGHT) / 2 - 10);
    if (sub) {
        ctx.font = '14px Inter, sans-serif';
        ctx.fillStyle = COLORS.text;
        ctx.fillText(sub, canvas.width / 2, (canvas.height - HUD_HEIGHT) / 2 + 24);
    }
}

// --- INPUT ---

const KEY_TO_DIR = {
    ArrowLeft: DIR.LEFT, KeyA: DIR.LEFT,
    ArrowRight: DIR.RIGHT, KeyD: DIR.RIGHT,
    ArrowUp: DIR.UP, KeyW: DIR.UP,
    ArrowDown: DIR.DOWN, KeyS: DIR.DOWN,
};

document.addEventListener('keydown', (e) => {
    if (KEY_TO_DIR[e.code]) {
        e.preventDefault();
        pacman.nextDir = KEY_TO_DIR[e.code];
    }
});

// --- MODE SWITCHING (scatter/chase) ---

function updateGlobalMode(dt) {
    if (frightenedTimer > 0) {
        frightenedTimer -= dt * 60;
        if (frightenedTimer <= 0) {
            frightenedTimer = 0;
            ghosts.forEach(g => { if (g.state === 'frightened') g.state = 'active'; });
        }
        return;
    }

    modeTimer += dt;
    const threshold = MODE_SCHEDULE[modeIndex];
    if (modeTimer > threshold && modeIndex < MODE_SCHEDULE.length - 1) {
        modeIndex++;
        modeTimer = 0;
        globalMode = modeIndex % 2 === 0 ? GHOST_MODES.SCATTER : GHOST_MODES.CHASE;
        ghosts.forEach(g => {
            if (g.state === 'active') {
                g.mode = globalMode;
                g.dir = { x: -g.dir.x, y: -g.dir.y };
            }
        });
    }
}

// --- LOOP ---

let lastTime = 0;

function update(dt) {
    updateGlobalMode(dt);
    updatePacman(dt);
    ghosts.forEach(g => updateGhost(g, dt));
    checkCollisions();
}

function render() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMaze();
    drawPacman();
    ghosts.forEach(drawGhost);
    drawHUD();

    if (!gameRunning) {
        drawOverlay('GAME OVER', `Score: ${score} — clique em Restart`);
    }
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    dt = Math.min(dt, 1 / 30); // evita saltos grandes se a aba ficar em background

    if (gameRunning) {
        update(dt);
    }
    render();

    gameLoopId = requestAnimationFrame(gameLoop);
}

function startGame() {
    buildMap();
    pacman = createPacman();
    initGhosts();
    score = 0;
    lives = 3;
    level = 1;
    modeIndex = 0;
    modeTimer = 0;
    globalMode = GHOST_MODES.SCATTER;
    frightenedTimer = 0;
    gameRunning = true;
    lastTime = 0;

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

document.getElementById('restartButton').addEventListener('click', startGame);
document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

startGame();
