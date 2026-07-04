const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gridSize = 20;
const tileCount = canvas.width / gridSize;
let score = 0;

let pacman = { x: 1, y: 1 };
let dx = 0;
let dy = 0;
let gameRunning = true;
let initialDirectionChosen = false;

const food = [];
const walls = [];
let ghosts = [];
let gameLoopTimeout = null;

const layout = [
    // 0 = vazio, 1 = parede, 2 = comida, 4 = início do Pac-Man
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 4, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 2, 2, 1],
    [1, 2, 1, 0, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 0, 1, 2, 2, 1],
    [1, 2, 1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 1, 2, 2, 1],
    [1, 2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    // Corredor no col 10 conecta as duas metades do labirinto (antes eram ilhas isoladas)
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 2, 2, 1],
    [1, 2, 1, 0, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 0, 1, 2, 2, 1],
    [1, 2, 1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 1, 2, 2, 1],
    [1, 2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

const ghostSpawns = [
    { x: 8, y: 6, color: 'red' },
    { x: 9, y: 6, color: 'pink' },
    { x: 10, y: 6, color: 'cyan' },
    { x: 11, y: 6, color: 'orange' }
];

function setupGame() {
    for (let row = 0; row < layout.length; row++) {
        for (let col = 0; col < layout[row].length; col++) {
            if (layout[row][col] === 2) {
                food.push({ x: col, y: row });
            } else if (layout[row][col] === 1) {
                walls.push({ x: col, y: row });
            } else if (layout[row][col] === 4) {
                pacman.x = col;
                pacman.y = row;
            }
        }
    }
    ghosts = ghostSpawns.map(spawn => ({ x: spawn.x, y: spawn.y, color: spawn.color }));
}

const arrowKeys = new Set([37, 38, 39, 40]);

document.addEventListener('keydown', changeDirection);
document.getElementById('restartButton').addEventListener('click', () => {
    resetGame();
    gameLoop();
});
document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

function changeDirection(event) {
    const keyPressed = event.keyCode;
    if (arrowKeys.has(keyPressed)) event.preventDefault();

    if (keyPressed === 37 && dx === 0) { // Left arrow
        dx = -1;
        dy = 0;
        initialDirectionChosen = true;
    } else if (keyPressed === 38 && dy === 0) { // Up arrow
        dx = 0;
        dy = -1;
        initialDirectionChosen = true;
    } else if (keyPressed === 39 && dx === 0) { // Right arrow
        dx = 1;
        dy = 0;
        initialDirectionChosen = true;
    } else if (keyPressed === 40 && dy === 0) { // Down arrow
        dx = 0;
        dy = 1;
        initialDirectionChosen = true;
    }
}

function gameLoop() {
    if (!gameRunning) return;

    if (initialDirectionChosen) {
        movePacman();
        moveGhosts();
    }

    if (checkGhostCollision()) {
        gameRunning = false;
        alert("Game Over!");
        return;
    }

    clearCanvas();
    drawFood();
    drawWalls();
    drawGhosts();
    drawPacman();
    updateScore();

    if (food.length === 0) {
        gameRunning = false;
        alert("You Win!");
        return;
    }

    gameLoopTimeout = setTimeout(gameLoop, 100);
}

function movePacman() {
    let newX = pacman.x + dx;
    let newY = pacman.y + dy;

    if (newX < 0) newX = tileCount - 1;
    if (newX >= tileCount) newX = 0;
    if (newY < 0) newY = tileCount - 1;
    if (newY >= tileCount) newY = 0;

    if (checkWallCollision(newX, newY)) return;

    pacman.x = newX;
    pacman.y = newY;

    for (let i = 0; i < food.length; i++) {
        if (pacman.x === food[i].x && pacman.y === food[i].y) {
            food.splice(i, 1);
            score++;
            break;
        }
    }
}

function moveGhosts() {
    ghosts.forEach(ghost => {
        if (Math.random() < 0.5) {
            ghost.dx = Math.sign(pacman.x - ghost.x);
            ghost.dy = 0;
        } else {
            ghost.dy = Math.sign(pacman.y - ghost.y);
            ghost.dx = 0;
        }

        let newX = ghost.x + ghost.dx;
        let newY = ghost.y + ghost.dy;

        if (!checkWallCollision(newX, newY)) {
            ghost.x = newX;
            ghost.y = newY;
        }
    });
}

function checkGhostCollision() {
    return ghosts.some(ghost => ghost.x === pacman.x && ghost.y === pacman.y);
}

function checkWallCollision(x, y) {
    for (let i = 0; i < walls.length; i++) {
        if (x === walls[i].x && y === walls[i].y) {
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
    ctx.fillStyle = 'yellow';
    food.forEach(f => {
        ctx.fillRect(f.x * gridSize, f.y * gridSize, gridSize, gridSize);
    });
}

function drawWalls() {
    ctx.fillStyle = 'blue';
    walls.forEach(wall => {
        ctx.fillRect(wall.x * gridSize, wall.y * gridSize, gridSize, gridSize);
    });
}

function drawGhosts() {
    ghosts.forEach(ghost => {
        ctx.fillStyle = ghost.color;
        ctx.fillRect(ghost.x * gridSize, ghost.y * gridSize, gridSize, gridSize);
    });
}

function drawPacman() {
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(pacman.x * gridSize + gridSize / 2, pacman.y * gridSize + gridSize / 2, gridSize / 2, 0.2 * Math.PI, 1.8 * Math.PI);
    ctx.lineTo(pacman.x * gridSize + gridSize / 2, pacman.y * gridSize + gridSize / 2);
    ctx.closePath();
    ctx.fill();
}

function updateScore() {
    document.getElementById('score').innerText = 'Score: ' + score;
}

function resetGame() {
    clearTimeout(gameLoopTimeout);
    score = 0;
    dx = 0;
    dy = 0;
    pacman = { x: 1, y: 1 };
    initialDirectionChosen = false;
    food.length = 0;
    walls.length = 0;
    setupGame();
    gameRunning = true;
}

setupGame();
gameLoop();
