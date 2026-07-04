const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gridSize = 20;
const tileCount = canvas.width / gridSize;
let score = 0;

let snake = [
    { x: 10, y: 10 }
];

let food = spawnFood();

// dx/dy é a direção efetivamente aplicada no último passo; nextDx/nextDy é a
// direção pedida pelo jogador, só aplicada uma vez por tick em moveSnake().
// Isso evita que duas teclas apertadas no mesmo frame façam a cobra reverter
// e colidir com o próprio pescoço.
let dx = 0;
let dy = 0;
let nextDx = 0;
let nextDy = 0;
let directionQueued = false;
let gameRunning = true;
let gameLoopTimeout = null;
const arrowKeys = new Set([37, 38, 39, 40]);

document.addEventListener('keydown', changeDirection);
document.getElementById('restartButton').addEventListener('click', () => {
    resetGame();
    gameLoop(); // Restart the game loop
});
document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

function changeDirection(event) {
    const keyPressed = event.keyCode;
    if (arrowKeys.has(keyPressed)) event.preventDefault();
    if (directionQueued) return;

    let requestedDx = dx;
    let requestedDy = dy;

    if (keyPressed === 37) { requestedDx = -1; requestedDy = 0; }
    else if (keyPressed === 38) { requestedDx = 0; requestedDy = -1; }
    else if (keyPressed === 39) { requestedDx = 1; requestedDy = 0; }
    else if (keyPressed === 40) { requestedDx = 0; requestedDy = 1; }
    else return;

    const isReversal = requestedDx === -dx && requestedDy === -dy;
    const isSameAxis = requestedDx === dx && requestedDy === dy;
    if (isReversal || isSameAxis) return;

    nextDx = requestedDx;
    nextDy = requestedDy;
    directionQueued = true;
}

function gameLoop() {
    if (!gameRunning) return;

    moveSnake();
    if (checkCollision()) {
        gameRunning = false;
        alert("Game Over!");
        return;
    }

    clearCanvas();
    drawFood();
    drawSnake();
    updateScore();

    gameLoopTimeout = setTimeout(gameLoop, 100);
}

function moveSnake() {
    dx = nextDx;
    dy = nextDy;
    directionQueued = false;

    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score++;
        food = spawnFood();
    } else {
        snake.pop();
    }
}

function spawnFood() {
    let candidate;
    do {
        candidate = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };
    } while (snake.some(part => part.x === candidate.x && part.y === candidate.y));
    return candidate;
}

function checkCollision() {
    const head = snake[0];

    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        return true;
    }

    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }

    return false;
}

function clearCanvas() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFood() {
    ctx.fillStyle = 'red';
    ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize, gridSize);
}

function drawSnake() {
    ctx.fillStyle = 'green';
    snake.forEach(part => {
        ctx.fillRect(part.x * gridSize, part.y * gridSize, gridSize, gridSize);
    });
}

function updateScore() {
    document.getElementById('score').innerText = 'Score: ' + score;
}

function resetGame() {
    clearTimeout(gameLoopTimeout);
    score = 0;
    dx = 0;
    dy = 0;
    nextDx = 0;
    nextDy = 0;
    directionQueued = false;
    snake = [{ x: 10, y: 10 }];
    food = spawnFood();
    gameRunning = true;
}

gameLoop();
