const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;
const H = canvas.height;

const COLORS = {
    bg: '#000',
    mid: 'rgba(45, 226, 230, 0.25)',
    player: '#2de2e6',
    ai: '#ff2bd6',
    ball: '#ffe600',
    text: '#e7ecf5',
};

const PADDLE_W = 12;
const PADDLE_H = 90;
const PADDLE_MARGIN = 24;
const BALL_R = 8;

const PLAYER_SPEED = 420; // px/seg
const AI_SPEED = 320;
const BALL_BASE_SPEED = 320;
const BALL_MAX_SPEED = 720;
const WIN_SCORE = 7;

let player = { y: H / 2 - PADDLE_H / 2 };
let ai = { y: H / 2 - PADDLE_H / 2 };
let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: BALL_BASE_SPEED };

let playerScore = 0;
let aiScore = 0;
let upPressed = false;
let downPressed = false;
let gameRunning = true;
let gameLoopId = null;
let lastTime = 0;
let rallyHits = 0;
let winner = null;

const KEY_UP = new Set(['ArrowUp', 'KeyW']);
const KEY_DOWN = new Set(['ArrowDown', 'KeyS']);

document.addEventListener('keydown', (e) => {
    if (KEY_UP.has(e.code)) { upPressed = true; e.preventDefault(); }
    if (KEY_DOWN.has(e.code)) { downPressed = true; e.preventDefault(); }
});
document.addEventListener('keyup', (e) => {
    if (KEY_UP.has(e.code)) upPressed = false;
    if (KEY_DOWN.has(e.code)) downPressed = false;
});

document.getElementById('restartButton').addEventListener('click', startGame);
document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

function serveBall(direction) {
    const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // -0.3π a 0.3π
    ball.speed = BALL_BASE_SPEED;
    ball.x = W / 2;
    ball.y = H / 2;
    ball.vx = Math.cos(angle) * ball.speed * direction;
    ball.vy = Math.sin(angle) * ball.speed;
    rallyHits = 0;
}

function submitScore(game, points) {
    fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ game, score: points }),
    }).catch(() => {});
}

function updatePlayer(dt) {
    if (upPressed) player.y -= PLAYER_SPEED * dt;
    if (downPressed) player.y += PLAYER_SPEED * dt;
    player.y = Math.max(0, Math.min(H - PADDLE_H, player.y));
}

function updateAI(dt) {
    const target = ball.y - PADDLE_H / 2;
    const center = ai.y;
    const diff = target - center;
    const maxStep = AI_SPEED * dt;
    ai.y += Math.max(-maxStep, Math.min(maxStep, diff));
    ai.y = Math.max(0, Math.min(H - PADDLE_H, ai.y));
}

function updateBall(dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy *= -1;
    } else if (ball.y + BALL_R > H) {
        ball.y = H - BALL_R;
        ball.vy *= -1;
    }

    // Colisão com paddle do jogador (esquerda)
    if (ball.vx < 0 &&
        ball.x - BALL_R < PADDLE_MARGIN + PADDLE_W &&
        ball.x - BALL_R > PADDLE_MARGIN - 10 &&
        ball.y > player.y && ball.y < player.y + PADDLE_H) {
        bounceOffPaddle(player.y, 1);
    }

    // Colisão com paddle da IA (direita)
    if (ball.vx > 0 &&
        ball.x + BALL_R > W - PADDLE_MARGIN - PADDLE_W &&
        ball.x + BALL_R < W - PADDLE_MARGIN + 10 &&
        ball.y > ai.y && ball.y < ai.y + PADDLE_H) {
        bounceOffPaddle(ai.y, -1);
    }

    if (ball.x < 0) {
        aiScore++;
        checkWin() || serveBall(1);
    } else if (ball.x > W) {
        playerScore++;
        checkWin() || serveBall(-1);
    }
}

function bounceOffPaddle(paddleY, direction) {
    const hitPos = (ball.y - paddleY) / PADDLE_H - 0.5; // -0.5 a 0.5
    rallyHits++;
    ball.speed = Math.min(BALL_MAX_SPEED, BALL_BASE_SPEED + rallyHits * 18);
    const angle = hitPos * Math.PI * 0.7;
    ball.vx = Math.cos(angle) * ball.speed * direction;
    ball.vy = Math.sin(angle) * ball.speed;
    ball.x = direction === 1 ? PADDLE_MARGIN + PADDLE_W + BALL_R : W - PADDLE_MARGIN - PADDLE_W - BALL_R;
}

function checkWin() {
    if (playerScore >= WIN_SCORE || aiScore >= WIN_SCORE) {
        gameRunning = false;
        winner = playerScore > aiScore ? 'player' : 'ai';
        submitScore('pong', playerScore);
        return true;
    }
    return false;
}

// --- RENDER ---

function drawMidLine() {
    ctx.strokeStyle = COLORS.mid;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawPaddle(x, y, color) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(x, y, PADDLE_W, PADDLE_H, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawBall() {
    ctx.fillStyle = COLORS.ball;
    ctx.shadowColor = COLORS.ball;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawScore() {
    ctx.font = '32px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.player;
    ctx.fillText(String(playerScore), W / 2 - 60, 50);
    ctx.fillStyle = COLORS.ai;
    ctx.fillText(String(aiScore), W / 2 + 60, 50);
}

function drawOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.fillStyle = winner === 'player' ? COLORS.player : COLORS.ai;
    ctx.textAlign = 'center';
    ctx.fillText(winner === 'player' ? 'VOCÊ VENCEU!' : 'A IA VENCEU', W / 2, H / 2 - 10);
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${playerScore} x ${aiScore} — clique em Restart`, W / 2, H / 2 + 24);
}

function render() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    drawMidLine();
    drawScore();
    drawPaddle(PADDLE_MARGIN, player.y, COLORS.player);
    drawPaddle(W - PADDLE_MARGIN - PADDLE_W, ai.y, COLORS.ai);
    drawBall();

    if (!gameRunning) drawOverlay();
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    dt = Math.min(dt, 1 / 30);

    if (gameRunning) {
        updatePlayer(dt);
        updateAI(dt);
        updateBall(dt);
    }

    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

function startGame() {
    playerScore = 0;
    aiScore = 0;
    winner = null;
    player.y = H / 2 - PADDLE_H / 2;
    ai.y = H / 2 - PADDLE_H / 2;
    gameRunning = true;
    lastTime = 0;
    serveBall(Math.random() < 0.5 ? 1 : -1);

    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

startGame();
