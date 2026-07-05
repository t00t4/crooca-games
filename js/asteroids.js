const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

const COLORS = {
    bg: '#000',
    ship: '#2de2e6',
    bullet: '#ffe600',
    asteroid: '#9aa5bd',
    text: '#e7ecf5',
    thrust: '#ff8c2d',
};

const SHIP_RADIUS = 12;
const ROTATE_SPEED = 3.6; // rad/seg
const THRUST_ACCEL = 220; // px/seg^2
const MAX_SPEED = 340;
const DRAG = 0.6; // fração de velocidade perdida por segundo
const BULLET_SPEED = 480;
const BULLET_LIFETIME = 1.1;
const FIRE_COOLDOWN = 0.22;
const RESPAWN_INVULN = 2.5;

const ASTEROID_SIZES = { large: 45, medium: 25, small: 13 };
const ASTEROID_SCORE = { large: 20, medium: 50, small: 100 };

let ship, bullets, asteroids, particles;
let keys = {};
let score = 0;
let lives = 3;
let wave = 1;
let gameRunning = true;
let paused = false;
let gameLoopId = null;
let lastTime = 0;
let fireTimer = 0;

const KEY_MAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'thrust', KeyW: 'thrust',
    Space: 'fire',
};

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (gameRunning) paused = !paused;
        return;
    }
    if (paused) return;
    const action = KEY_MAP[e.code];
    if (action) { keys[action] = true; e.preventDefault(); }
});
document.addEventListener('keyup', (e) => {
    const action = KEY_MAP[e.code];
    if (action) keys[action] = false;
});

// Se a janela perder o foco com uma tecla pressionada, o keyup correspondente
// nunca chega e a nave ficaria acelerando/girando para sempre.
window.addEventListener('blur', () => {
    keys = {};
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

function wrap(v, max) {
    if (v < 0) return v + max;
    if (v > max) return v - max;
    return v;
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// Distância considerando o wraparound da tela: sem isso, uma nave/tiro perto
// da borda esquerda e um asteroide perto da borda direita pareciam longe um
// do outro na conta, quando na verdade estão adjacentes (só "deram a volta").
function wrappedDelta(d, max) {
    if (d > max / 2) return d - max;
    if (d < -max / 2) return d + max;
    return d;
}

function distWrapped(a, b) {
    const dx = wrappedDelta(a.x - b.x, W);
    const dy = wrappedDelta(a.y - b.y, H);
    return Math.hypot(dx, dy);
}

function createShip() {
    return {
        x: W / 2, y: H / 2,
        vx: 0, vy: 0,
        angle: -Math.PI / 2,
        invuln: RESPAWN_INVULN,
    };
}

function makeAsteroidShape() {
    const points = 10 + Math.floor(Math.random() * 4);
    const shape = [];
    for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const r = 0.75 + Math.random() * 0.35;
        shape.push({ a, r });
    }
    return shape;
}

function createAsteroid(size, x, y) {
    const speed = size === 'large' ? 40 : size === 'medium' ? 65 : 95;
    const angle = Math.random() * Math.PI * 2;
    return {
        x, y,
        vx: Math.cos(angle) * speed * (0.5 + Math.random()),
        vy: Math.sin(angle) * speed * (0.5 + Math.random()),
        size,
        radius: ASTEROID_SIZES[size],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 1.5,
        shape: makeAsteroidShape(),
    };
}

function spawnWave(n) {
    for (let i = 0; i < n; i++) {
        let x, y;
        do {
            x = Math.random() * W;
            y = Math.random() * H;
        } while (distWrapped({ x, y }, ship) < 120);
        asteroids.push(createAsteroid('large', x, y));
    }
}

function splitAsteroid(a) {
    const points = ASTEROID_SCORE[a.size];
    score += points;

    if (a.size === 'large') {
        asteroids.push(createAsteroid('medium', a.x, a.y));
        asteroids.push(createAsteroid('medium', a.x, a.y));
    } else if (a.size === 'medium') {
        asteroids.push(createAsteroid('small', a.x, a.y));
        asteroids.push(createAsteroid('small', a.x, a.y));
    }

    spawnExplosion(a.x, a.y, a.size === 'large' ? 18 : a.size === 'medium' ? 12 : 8);
}

function spawnExplosion(x, y, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 120;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.4 + Math.random() * 0.4,
            maxLife: 0.8,
        });
    }
}

// --- UPDATE ---

function updateShip(dt) {
    if (keys.left) ship.angle -= ROTATE_SPEED * dt;
    if (keys.right) ship.angle += ROTATE_SPEED * dt;

    if (keys.thrust) {
        ship.vx += Math.cos(ship.angle) * THRUST_ACCEL * dt;
        ship.vy += Math.sin(ship.angle) * THRUST_ACCEL * dt;
    }

    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > MAX_SPEED) {
        ship.vx = (ship.vx / speed) * MAX_SPEED;
        ship.vy = (ship.vy / speed) * MAX_SPEED;
    }

    ship.vx *= 1 - DRAG * dt;
    ship.vy *= 1 - DRAG * dt;

    ship.x = wrap(ship.x + ship.vx * dt, W);
    ship.y = wrap(ship.y + ship.vy * dt, H);

    if (ship.invuln > 0) ship.invuln -= dt;

    fireTimer -= dt;
    if (keys.fire && fireTimer <= 0) {
        fireTimer = FIRE_COOLDOWN;
        bullets.push({
            x: ship.x + Math.cos(ship.angle) * SHIP_RADIUS,
            y: ship.y + Math.sin(ship.angle) * SHIP_RADIUS,
            vx: Math.cos(ship.angle) * BULLET_SPEED,
            vy: Math.sin(ship.angle) * BULLET_SPEED,
            life: BULLET_LIFETIME,
        });
    }
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x = wrap(b.x + b.vx * dt, W);
        b.y = wrap(b.y + b.vy * dt, H);
        b.life -= dt;
        if (b.life <= 0) bullets.splice(i, 1);
    }
}

function updateAsteroids(dt) {
    asteroids.forEach(a => {
        a.x = wrap(a.x + a.vx * dt, W);
        a.y = wrap(a.y + a.vy * dt, H);
        a.rotation += a.rotSpeed * dt;
    });
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function checkCollisions() {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi];
        for (let ai = asteroids.length - 1; ai >= 0; ai--) {
            const a = asteroids[ai];
            if (distWrapped(b, a) < a.radius) {
                bullets.splice(bi, 1);
                asteroids.splice(ai, 1);
                splitAsteroid(a);
                break;
            }
        }
    }

    if (ship.invuln > 0) return;

    for (const a of asteroids) {
        if (distWrapped(ship, a) < a.radius + SHIP_RADIUS * 0.7) {
            loseLife();
            return;
        }
    }
}

function loseLife() {
    lives--;
    spawnExplosion(ship.x, ship.y, 20);
    if (lives <= 0) {
        gameRunning = false;
        submitScore('asteroids', score);
    } else {
        ship = createShip();
    }
}

function checkWaveClear() {
    if (gameRunning && asteroids.length === 0) {
        wave++;
        spawnWave(Math.min(2 + wave, 8));
    }
}

// --- RENDER ---

function drawShip() {
    const flashing = ship.invuln > 0 && Math.floor(ship.invuln * 8) % 2 === 0;
    if (flashing) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.strokeStyle = COLORS.ship;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.ship;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(SHIP_RADIUS, 0);
    ctx.lineTo(-SHIP_RADIUS * 0.8, SHIP_RADIUS * 0.7);
    ctx.lineTo(-SHIP_RADIUS * 0.4, 0);
    ctx.lineTo(-SHIP_RADIUS * 0.8, -SHIP_RADIUS * 0.7);
    ctx.closePath();
    ctx.stroke();

    if (keys.thrust) {
        ctx.strokeStyle = COLORS.thrust;
        ctx.shadowColor = COLORS.thrust;
        ctx.beginPath();
        ctx.moveTo(-SHIP_RADIUS * 0.4, 0);
        ctx.lineTo(-SHIP_RADIUS * 1.3, 0);
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawBullets() {
    ctx.fillStyle = COLORS.bullet;
    ctx.shadowColor = COLORS.bullet;
    ctx.shadowBlur = 6;
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;
}

function drawAsteroids() {
    ctx.strokeStyle = COLORS.asteroid;
    ctx.lineWidth = 2;
    asteroids.forEach(a => {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rotation);
        ctx.beginPath();
        a.shape.forEach((pt, i) => {
            const x = Math.cos(pt.a) * a.radius * pt.r;
            const y = Math.sin(pt.a) * a.radius * pt.r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    });
}

function drawParticles() {
    particles.forEach(p => {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = `rgba(255, 200, 100, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawHUD() {
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 12, 24);

    ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${wave}`, W / 2, 24);

    ctx.textAlign = 'right';
    for (let i = 0; i < lives; i++) {
        ctx.save();
        ctx.translate(W - 20 - i * 22, 18);
        ctx.rotate(-Math.PI / 2);
        ctx.strokeStyle = COLORS.ship;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-6, 5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, -5);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }
}

function drawOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 22px "Press Start 2P", monospace';
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
    ctx.fillStyle = COLORS.ship;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSADO', W / 2, H / 2);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Pressione P para continuar', W / 2, H / 2 + 28);
}

function render() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    drawParticles();
    drawAsteroids();
    drawBullets();
    drawShip();
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
        updateShip(dt);
        updateBullets(dt);
        updateAsteroids(dt);
        updateParticles(dt);
        checkCollisions();
        checkWaveClear();
    }

    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

function startGame() {
    ship = createShip();
    bullets = [];
    asteroids = [];
    particles = [];
    keys = {};
    score = 0;
    lives = 3;
    wave = 1;
    fireTimer = 0;
    gameRunning = true;
    paused = false;
    lastTime = 0;
    spawnWave(3);

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

startGame();
