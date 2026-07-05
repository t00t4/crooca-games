const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

const COLORS = {
    bg: '#000',
    paddle: '#2de2e6',
    ball: '#ffe600',
    text: '#e7ecf5',
    rowColors: ['#ff2bd6', '#ff5c7a', '#ffaa00', '#7cf5f8', '#2de2e6', '#8a7cff'],
};

const PADDLE_W = 100;
const PADDLE_H = 14;
const PADDLE_Y = H - 34;
const PADDLE_SPEED = 520;
const BALL_R = 7;
const BALL_BASE_SPEED = 300;
const BALL_MAX_SPEED = 620;

const BRICK_ROWS = 6;
const BRICK_COLS = 10;
const BRICK_PAD = 4;
const BRICK_TOP = 60;
const BRICK_H = 20;
const BRICK_W = (W - BRICK_PAD * (BRICK_COLS + 1)) / BRICK_COLS;

let paddle = { x: W / 2 - PADDLE_W / 2 };
let ball = { x: W / 2, y: PADDLE_Y - BALL_R, vx: 0, vy: 0 };
let bricks = [];
let leftPressed = false;
let rightPressed = false;

let score = 0;
let lives = 3;
let level = 1;
let ballLaunched = false;
let gameRunning = true;
let gameLoopId = null;
let lastTime = 0;

const KEY_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEY_RIGHT = new Set(['ArrowRight', 'KeyD']);

document.addEventListener('keydown', (e) => {
    if (KEY_LEFT.has(e.code)) { leftPressed = true; e.preventDefault(); }
    if (KEY_RIGHT.has(e.code)) { rightPressed = true; e.preventDefault(); }
    if (e.code === 'Space') { e.preventDefault(); launchBall(); }
});
document.addEventListener('keyup', (e) => {
    if (KEY_LEFT.has(e.code)) leftPressed = false;
    if (KEY_RIGHT.has(e.code)) rightPressed = false;
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

function buildBricks() {
    bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
        for (let c = 0; c < BRICK_COLS; c++) {
            bricks.push({
                x: BRICK_PAD + c * (BRICK_W + BRICK_PAD),
                y: BRICK_TOP + r * (BRICK_H + BRICK_PAD),
                w: BRICK_W,
                h: BRICK_H,
                color: COLORS.rowColors[r % COLORS.rowColors.length],
                points: (BRICK_ROWS - r) * 10,
                alive: true,
            });
        }
    }
}

function resetBall() {
    ball.x = paddle.x + PADDLE_W / 2;
    ball.y = PADDLE_Y - BALL_R - 1;
    ball.vx = 0;
    ball.vy = 0;
    ballLaunched = false;
}

function launchBall() {
    if (ballLaunched || !gameRunning) return;
    ballLaunched = true;
    const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
    ball.vx = Math.cos(angle) * BALL_BASE_SPEED;
    ball.vy = Math.sin(angle) * BALL_BASE_SPEED;
}

function updatePaddle(dt) {
    if (leftPressed) paddle.x -= PADDLE_SPEED * dt;
    if (rightPressed) paddle.x += PADDLE_SPEED * dt;
    paddle.x = Math.max(0, Math.min(W - PADDLE_W, paddle.x));

    if (!ballLaunched) {
        ball.x = paddle.x + PADDLE_W / 2;
    }
}

function updateBall(dt) {
    if (!ballLaunched) return;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx *= -1;
    } else if (ball.x + BALL_R > W) {
        ball.x = W - BALL_R;
        ball.vx *= -1;
    }

    if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy *= -1;
    }

    if (ball.y + BALL_R > H) {
        loseLife();
        return;
    }

    if (ball.vy > 0 &&
        ball.y + BALL_R > PADDLE_Y &&
        ball.y + BALL_R < PADDLE_Y + PADDLE_H + 10 &&
        ball.x > paddle.x && ball.x < paddle.x + PADDLE_W) {
        const hitPos = (ball.x - paddle.x) / PADDLE_W - 0.5; // -0.5 a 0.5
        const speed = Math.min(BALL_MAX_SPEED, Math.hypot(ball.vx, ball.vy) + 12);
        const angle = -Math.PI / 2 + hitPos * Math.PI * 0.7;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.y = PADDLE_Y - BALL_R;
    }

    for (const brick of bricks) {
        if (!brick.alive) continue;
        if (ball.x + BALL_R > brick.x && ball.x - BALL_R < brick.x + brick.w &&
            ball.y + BALL_R > brick.y && ball.y - BALL_R < brick.y + brick.h) {
            brick.alive = false;
            score += brick.points;

            const overlapLeft = ball.x + BALL_R - brick.x;
            const overlapRight = brick.x + brick.w - (ball.x - BALL_R);
            const overlapTop = ball.y + BALL_R - brick.y;
            const overlapBottom = brick.y + brick.h - (ball.y - BALL_R);
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

            if (minOverlap === overlapTop || minOverlap === overlapBottom) {
                ball.vy *= -1;
            } else {
                ball.vx *= -1;
            }
            break;
        }
    }

    if (bricks.every(b => !b.alive)) {
        level++;
        buildBricks();
        resetBall();
    }
}

function loseLife() {
    lives--;
    if (lives <= 0) {
        gameRunning = false;
        submitScore('breakout', score);
    } else {
        resetBall();
    }
}

// --- RENDER ---

function drawBricks() {
    bricks.forEach(b => {
        if (!b.alive) return;
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.shadowBlur = 0;
    });
}

function drawPaddle() {
    ctx.fillStyle = COLORS.paddle;
    ctx.shadowColor = COLORS.paddle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(paddle.x, PADDLE_Y, PADDLE_W, PADDLE_H, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawBall() {
    ctx.fillStyle = COLORS.ball;
    ctx.shadowColor = COLORS.ball;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawHUD() {
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 10, 24);

    ctx.textAlign = 'center';
    ctx.fillText(`LV ${level}`, W / 2, 24);

    ctx.textAlign = 'right';
    ctx.fillText(`LIVES ${lives}`, W - 10, 24);

    if (!ballLaunched && gameRunning) {
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.text;
        ctx.fillText('ESPAÇO PARA LANÇAR', W / 2, PADDLE_Y - 30);
    }
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

function render() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    drawBricks();
    drawPaddle();
    drawBall();
    drawHUD();

    if (!gameRunning) drawOverlay();
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    dt = Math.min(dt, 1 / 30);

    if (gameRunning) {
        updatePaddle(dt);
        updateBall(dt);
    }

    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

function startGame() {
    paddle.x = W / 2 - PADDLE_W / 2;
    score = 0;
    lives = 3;
    level = 1;
    gameRunning = true;
    lastTime = 0;
    buildBricks();
    resetBall();

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

startGame();
