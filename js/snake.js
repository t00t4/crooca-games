const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE = 20;
const COLS = 20;
const ROWS = 20;
const HUD_HEIGHT = 40;

canvas.width = COLS * TILE;
canvas.height = ROWS * TILE + HUD_HEIGHT;

const COLORS = {
    bg: '#000',
    grid: 'rgba(45, 226, 230, 0.06)',
    head: '#7cf5f8',
    body: '#2de2e6',
    tail: '#0f6f73',
    food: '#ff2bd6',
    text: '#e7ecf5',
};

const DIR = {
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
};

let snake = [{ x: 10, y: 10 }];
let prevSnake = [{ x: 10, y: 10 }];
let food = spawnFood();
let foodPulse = 0;

let dx = 0;
let dy = 0;
let nextDx = 0;
let nextDy = 0;
let directionQueued = false;

let score = 0;
let gameRunning = true;
let paused = false;
let gameLoopId = null;

const BASE_TICK_MS = 130;
const MIN_TICK_MS = 70;
let tickMs = BASE_TICK_MS;
let accumulator = 0;
let lastTime = 0;

const KEY_TO_DIR = {
    ArrowLeft: DIR.LEFT, KeyA: DIR.LEFT,
    ArrowRight: DIR.RIGHT, KeyD: DIR.RIGHT,
    ArrowUp: DIR.UP, KeyW: DIR.UP,
    ArrowDown: DIR.DOWN, KeyS: DIR.DOWN,
};

document.addEventListener('keydown', changeDirection);
document.getElementById('restartButton').addEventListener('click', startGame);
document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

function changeDirection(event) {
    if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        if (gameRunning) paused = !paused;
        return;
    }
    if (paused) return;

    const dir = KEY_TO_DIR[event.code];
    if (!dir) return;
    event.preventDefault();
    if (directionQueued) return;

    const isReversal = dir.x === -dx && dir.y === -dy;
    const isSameAxis = dir.x === dx && dir.y === dy;
    if (isReversal || isSameAxis) return;

    nextDx = dir.x;
    nextDy = dir.y;
    directionQueued = true;
}

function tick() {
    if (dx === 0 && dy === 0 && nextDx === 0 && nextDy === 0) return;

    dx = nextDx;
    dy = nextDy;
    directionQueued = false;

    prevSnake = snake.map(s => ({ ...s }));

    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    if (checkCollision(head)) {
        gameRunning = false;
        submitScore('snake', score);
        return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score++;
        food = spawnFood();
        tickMs = Math.max(MIN_TICK_MS, BASE_TICK_MS - score * 2);
    } else {
        snake.pop();
        prevSnake.pop();
    }
}

function checkCollision(head) {
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return true;
    // Se não vai comer, a cauda anda junto e libera a própria casa: perseguir o
    // rabo de perto não deveria contar como colisão (só quando a cobra cresce).
    const growing = head.x === food.x && head.y === food.y;
    const body = growing ? snake : snake.slice(0, -1);
    return body.some(part => part.x === head.x && part.y === head.y);
}

function spawnFood() {
    let candidate;
    let attempts = 0;
    do {
        candidate = {
            x: Math.floor(Math.random() * COLS),
            y: Math.floor(Math.random() * ROWS),
        };
        attempts++;
    } while (snake.some(part => part.x === candidate.x && part.y === candidate.y) && attempts < COLS * ROWS);
    return candidate;
}

function submitScore(game, points) {
    fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ game, score: points }),
    }).catch(() => {});
}

// --- RENDER ---

function drawGrid() {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * TILE + 0.5, 0);
        ctx.lineTo(c * TILE + 0.5, ROWS * TILE);
        ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * TILE + 0.5);
        ctx.lineTo(COLS * TILE, r * TILE + 0.5);
        ctx.stroke();
    }
}

function drawFood() {
    foodPulse += 0.12;
    const pulse = Math.sin(foodPulse) * 2;
    const x = food.x * TILE + TILE / 2;
    const y = food.y * TILE + TILE / 2;

    ctx.fillStyle = COLORS.food;
    ctx.shadowColor = COLORS.food;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, TILE / 2 - 3 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function drawSnake(alpha) {
    const len = snake.length;

    for (let i = len - 1; i >= 0; i--) {
        const cur = snake[i];
        const prev = prevSnake[i] || cur;
        const x = lerp(prev.x, cur.x, alpha) * TILE + TILE / 2;
        const y = lerp(prev.y, cur.y, alpha) * TILE + TILE / 2;

        const t = len > 1 ? i / (len - 1) : 0;
        const color = i === 0 ? COLORS.head : mixColor(COLORS.body, COLORS.tail, t);

        ctx.fillStyle = color;
        ctx.shadowColor = COLORS.body;
        ctx.shadowBlur = i === 0 ? 10 : 4;
        const r = i === 0 ? TILE / 2 - 1 : TILE / 2 - 2;
        roundRect(x - r, y - r, r * 2, r * 2, 5);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (i === 0) drawEyes(x, y);
    }
}

function drawEyes(x, y) {
    const offX = dx * 4;
    const offY = dy * 4;
    const perpX = dy !== 0 ? 4 : 0;
    const perpY = dx !== 0 ? 4 : 0;

    ctx.fillStyle = '#04181a';
    ctx.beginPath();
    ctx.arc(x + offX - perpX, y + offY - perpY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + offX + perpX, y + offY + perpY, 2, 0, Math.PI * 2);
    ctx.fill();
}

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function mixColor(c1, c2, t) {
    const p1 = hexToRgb(c1);
    const p2 = hexToRgb(c2);
    const r = Math.round(lerp(p1.r, p2.r, t));
    const g = Math.round(lerp(p1.g, p2.g, t));
    const b = Math.round(lerp(p1.b, p2.b, t));
    return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawHUD() {
    const hudY = ROWS * TILE;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, hudY, canvas.width, HUD_HEIGHT);

    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 10, hudY + 24);

    ctx.textAlign = 'right';
    ctx.fillText(`LEN ${snake.length}`, canvas.width - 10, hudY + 24);
}

function drawOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, ROWS * TILE);
    ctx.font = 'bold 20px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff5c7a';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, ROWS * TILE / 2 - 10);
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`Score: ${score} — clique em Restart`, canvas.width / 2, ROWS * TILE / 2 + 20);
}

function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, ROWS * TILE);
    ctx.font = 'bold 20px "Press Start 2P", monospace';
    ctx.fillStyle = COLORS.head;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSADO', canvas.width / 2, ROWS * TILE / 2 - 10);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Pressione P para continuar', canvas.width / 2, ROWS * TILE / 2 + 20);
}

function render(alpha) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawFood();
    drawSnake(alpha);
    drawHUD();

    if (!gameRunning) drawOverlay();
    else if (paused) drawPauseOverlay();
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = timestamp - lastTime;
    lastTime = timestamp;
    dt = Math.min(dt, 100);

    if (gameRunning && !paused) {
        accumulator += dt;
        while (accumulator >= tickMs) {
            tick();
            accumulator -= tickMs;
            if (!gameRunning) break;
        }
    }

    const alpha = gameRunning ? Math.min(accumulator / tickMs, 1) : 1;
    render(alpha);

    gameLoopId = requestAnimationFrame(gameLoop);
}

function startGame() {
    snake = [{ x: 10, y: 10 }];
    prevSnake = [{ x: 10, y: 10 }];
    dx = 0; dy = 0; nextDx = 0; nextDy = 0;
    directionQueued = false;
    food = spawnFood();
    score = 0;
    tickMs = BASE_TICK_MS;
    accumulator = 0;
    lastTime = 0;
    gameRunning = true;
    paused = false;

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

startGame();
