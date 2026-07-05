const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

const COLORS = {
    bg: '#000',
    player: '#2de2e6',
    playerBullet: '#ffe600',
    enemyBullet: '#ff2bd6',
    bunker: '#7cf5f8',
    text: '#e7ecf5',
    rowColors: ['#ff2bd6', '#8a7cff', '#8a7cff', '#2de2e6', '#2de2e6'],
};

const ENEMY_ROWS = 5;
const ENEMY_COLS = 11;
const ENEMY_W = 28;
const ENEMY_H = 20;
const ENEMY_SPACING_X = 44;
const ENEMY_SPACING_Y = 34;
const ENEMY_GRID_X0 = (W - (ENEMY_COLS - 1) * ENEMY_SPACING_X) / 2;
const ENEMY_GRID_Y0 = 60;
const ENEMY_ROW_POINTS = [30, 20, 20, 10, 10];

const PLAYER_W = 34;
const PLAYER_H = 18;
const PLAYER_Y = H - 44;
const PLAYER_SPEED = 320;

const PLAYER_BULLET_SPEED = 480;
const ENEMY_BULLET_SPEED = 220;
const FIRE_COOLDOWN = 0.5;

const ENEMY_SHAPES = [
    ['00111100', '01111110', '11011011', '11111111', '00100100', '01011010', '10100101', '00100100'],
    ['00100100', '00111100', '01111110', '11011011', '11111111', '00111100', '01000010', '10000001'],
    ['00011000', '00111100', '01111110', '11011011', '11111111', '00100100', '01011010', '10100101'],
];

const BUNKER_SHAPE = [
    '11111111',
    '11111111',
    '11111111',
    '11000011',
    '11000011',
];

let player = { x: W / 2 - PLAYER_W / 2 };
let enemies = [];
let enemyDir = 1;
let enemySpeed = 30;
let enemyDropTimer = 0;
let playerBullets = [];
let enemyBullets = [];
let bunkers = [];

let leftPressed = false;
let rightPressed = false;
let fireTimer = 0;

let score = 0;
let lives = 3;
let wave = 1;
let gameRunning = true;
let paused = false;
let gameLoopId = null;
let lastTime = 0;

const KEY_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEY_RIGHT = new Set(['ArrowRight', 'KeyD']);

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (gameRunning) paused = !paused;
        return;
    }
    if (paused) return;
    if (KEY_LEFT.has(e.code)) { leftPressed = true; e.preventDefault(); }
    if (KEY_RIGHT.has(e.code)) { rightPressed = true; e.preventDefault(); }
    if (e.code === 'Space') { e.preventDefault(); fireBullet(); }
});
document.addEventListener('keyup', (e) => {
    if (KEY_LEFT.has(e.code)) leftPressed = false;
    if (KEY_RIGHT.has(e.code)) rightPressed = false;
});

// Se a janela perder o foco com uma tecla pressionada, o keyup correspondente
// nunca chega e o movimento fica "preso" ligado para sempre.
window.addEventListener('blur', () => {
    leftPressed = false;
    rightPressed = false;
});

document.getElementById('restartButton').addEventListener('click', startGame);
document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

function submitScore(game, points) {
    fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ game, score: points }),
    }).catch(() => {});
}

function buildEnemies() {
    enemies = [];
    for (let r = 0; r < ENEMY_ROWS; r++) {
        for (let c = 0; c < ENEMY_COLS; c++) {
            enemies.push({
                x: ENEMY_GRID_X0 + c * ENEMY_SPACING_X,
                y: ENEMY_GRID_Y0 + r * ENEMY_SPACING_Y,
                row: r,
                alive: true,
                shape: ENEMY_SHAPES[r === 0 ? 0 : r <= 2 ? 1 : 2],
                color: COLORS.rowColors[r],
            });
        }
    }
    enemyDir = 1;
    enemySpeed = 30 + wave * 6;
}

function buildBunkers() {
    bunkers = [];
    const count = 4;
    const bunkerW = BUNKER_SHAPE[0].length;
    const bunkerH = BUNKER_SHAPE.length;
    const cell = 6;
    const totalW = count * (bunkerW * cell) + (count - 1) * 40;
    const startX = (W - totalW) / 2;

    for (let i = 0; i < count; i++) {
        const blocks = BUNKER_SHAPE.map(row => row.split('').map(ch => ch === '1'));
        bunkers.push({
            x: startX + i * (bunkerW * cell + 40),
            y: PLAYER_Y - 70,
            cell,
            blocks,
        });
    }
}

function fireBullet() {
    if (!gameRunning || fireTimer > 0) return;
    if (playerBullets.length > 0) return;
    fireTimer = FIRE_COOLDOWN;
    playerBullets.push({ x: player.x + PLAYER_W / 2, y: PLAYER_Y });
}

function aliveEnemies() {
    return enemies.filter(e => e.alive);
}

function updatePlayer(dt) {
    if (leftPressed) player.x -= PLAYER_SPEED * dt;
    if (rightPressed) player.x += PLAYER_SPEED * dt;
    player.x = Math.max(0, Math.min(W - PLAYER_W, player.x));
    if (fireTimer > 0) fireTimer -= dt;
}

function updateEnemies(dt) {
    const alive = aliveEnemies();
    if (alive.length === 0) return;

    let hitEdge = false;
    for (const e of alive) {
        const nextX = e.x + enemyDir * enemySpeed * dt;
        if (nextX < 10 || nextX + ENEMY_W > W - 10) hitEdge = true;
    }

    if (hitEdge) {
        enemyDir *= -1;
        enemies.forEach(e => { e.y += ENEMY_SPACING_Y * 0.4; });
    } else {
        enemies.forEach(e => { e.x += enemyDir * enemySpeed * dt; });
    }

    enemySpeed = 30 + wave * 6 + (ENEMY_ROWS * ENEMY_COLS - alive.length) * 2.2;

    for (const e of alive) {
        if (e.y + ENEMY_H >= PLAYER_Y) {
            gameRunning = false;
            submitScore('spaceinvaders', score);
            return;
        }
    }

    enemyDropTimer -= dt;
    if (enemyDropTimer <= 0) {
        enemyDropTimer = Math.max(0.3, 1.4 - wave * 0.1);
        const shooters = {};
        alive.forEach(e => {
            const key = Math.round(e.x);
            if (!shooters[key] || shooters[key].y < e.y) shooters[key] = e;
        });
        const candidates = Object.values(shooters);
        if (candidates.length > 0) {
            const shooter = candidates[Math.floor(Math.random() * candidates.length)];
            enemyBullets.push({ x: shooter.x + ENEMY_W / 2, y: shooter.y + ENEMY_H });
        }
    }
}

function hitsBunker(bunkerList, x, y) {
    for (const bunker of bunkerList) {
        const col = Math.floor((x - bunker.x) / bunker.cell);
        const row = Math.floor((y - bunker.y) / bunker.cell);
        if (row >= 0 && row < bunker.blocks.length && col >= 0 && col < bunker.blocks[0].length) {
            if (bunker.blocks[row][col]) {
                bunker.blocks[row][col] = false;
                if (bunker.blocks[row][col - 1] !== undefined) bunker.blocks[row][col - 1] = false;
                if (bunker.blocks[row][col + 1] !== undefined) bunker.blocks[row][col + 1] = false;
                return true;
            }
        }
    }
    return false;
}

function updateBullets(dt) {
    // updateEnemies() pode encerrar o jogo (invasão) e mesmo assim esta função
    // ainda rodaria no mesmo frame; sem essa guarda, um tiro inimigo poderia
    // tirar mais uma vida e reenviar o score já após o game over.
    if (!gameRunning) return;

    for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b = playerBullets[i];
        b.y -= PLAYER_BULLET_SPEED * dt;

        if (hitsBunker(bunkers, b.x, b.y)) {
            playerBullets.splice(i, 1);
            continue;
        }

        let hit = false;
        for (const e of enemies) {
            if (!e.alive) continue;
            if (b.x > e.x && b.x < e.x + ENEMY_W && b.y > e.y && b.y < e.y + ENEMY_H) {
                e.alive = false;
                score += ENEMY_ROW_POINTS[e.row];
                hit = true;
                break;
            }
        }

        if (hit || b.y < 0) playerBullets.splice(i, 1);
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.y += ENEMY_BULLET_SPEED * dt;

        if (hitsBunker(bunkers, b.x, b.y)) {
            enemyBullets.splice(i, 1);
            continue;
        }

        if (b.x > player.x && b.x < player.x + PLAYER_W && b.y > PLAYER_Y && b.y < PLAYER_Y + PLAYER_H) {
            enemyBullets.splice(i, 1);
            loseLife();
            continue;
        }

        if (b.y > H) enemyBullets.splice(i, 1);
    }
}

function loseLife() {
    lives--;
    if (lives <= 0) {
        gameRunning = false;
        submitScore('spaceinvaders', score);
    }
}

function checkWaveClear() {
    if (gameRunning && aliveEnemies().length === 0) {
        wave++;
        buildEnemies();
        buildBunkers();
        playerBullets = [];
        enemyBullets = [];
    }
}

// --- RENDER ---

function drawSprite(shape, x, y, w, h, color) {
    const rows = shape.length;
    const cols = shape[0].length;
    const cellW = w / cols;
    const cellH = h / rows;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (shape[r][c] === '1') {
                ctx.fillRect(x + c * cellW, y + r * cellH, cellW + 0.5, cellH + 0.5);
            }
        }
    }
    ctx.shadowBlur = 0;
}

function drawEnemies() {
    for (const e of enemies) {
        if (!e.alive) continue;
        drawSprite(e.shape, e.x, e.y, ENEMY_W, ENEMY_H, e.color);
    }
}

function drawPlayer() {
    ctx.fillStyle = COLORS.player;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 8;
    ctx.fillRect(player.x, PLAYER_Y + PLAYER_H * 0.5, PLAYER_W, PLAYER_H * 0.5);
    ctx.fillRect(player.x + PLAYER_W * 0.4, PLAYER_Y, PLAYER_W * 0.2, PLAYER_H * 0.5);
    ctx.shadowBlur = 0;
}

function drawBunkers() {
    ctx.fillStyle = COLORS.bunker;
    bunkers.forEach(bunker => {
        bunker.blocks.forEach((row, r) => {
            row.forEach((alive, c) => {
                if (alive) ctx.fillRect(bunker.x + c * bunker.cell, bunker.y + r * bunker.cell, bunker.cell, bunker.cell);
            });
        });
    });
}

function drawBullets() {
    ctx.fillStyle = COLORS.playerBullet;
    ctx.shadowColor = COLORS.playerBullet;
    ctx.shadowBlur = 6;
    playerBullets.forEach(b => ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10));

    ctx.fillStyle = COLORS.enemyBullet;
    ctx.shadowColor = COLORS.enemyBullet;
    enemyBullets.forEach(b => ctx.fillRect(b.x - 1.5, b.y - 4, 3, 10));
    ctx.shadowBlur = 0;
}

function drawHUD() {
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 10, 24);

    ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${wave}`, W / 2, 24);

    ctx.textAlign = 'right';
    ctx.fillText(`LIVES ${lives}`, W - 10, 24);
}

function drawOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 20px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff5c7a';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 10);
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`Score: ${score} — clique em Restart`, W / 2, H / 2 + 24);
}

function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 20px "Press Start 2P", monospace';
    ctx.fillStyle = COLORS.player;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSADO', W / 2, H / 2);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Pressione P para continuar', W / 2, H / 2 + 28);
}

function render() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    drawBunkers();
    drawEnemies();
    drawBullets();
    drawPlayer();
    drawHUD();

    if (!gameRunning) drawOverlay();
    else if (paused) drawPauseOverlay();
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    dt = Math.min(dt, 1 / 30);

    if (gameRunning && !paused) {
        updatePlayer(dt);
        updateEnemies(dt);
        updateBullets(dt);
        checkWaveClear();
    }

    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

function startGame() {
    player.x = W / 2 - PLAYER_W / 2;
    score = 0;
    lives = 3;
    wave = 1;
    playerBullets = [];
    enemyBullets = [];
    fireTimer = 0;
    enemyDropTimer = 1.4;
    gameRunning = true;
    paused = false;
    lastTime = 0;
    buildEnemies();
    buildBunkers();

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

startGame();
