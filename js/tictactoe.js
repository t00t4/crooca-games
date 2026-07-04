const HUMAN = 'X';
const AI = 'O';
const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const winsEl = document.getElementById('winsCount');
const drawsEl = document.getElementById('drawsCount');
const lossesEl = document.getElementById('lossesCount');

let board = Array(9).fill(null);
let gameOver = false;
let wins = 0;
let draws = 0;
let losses = 0;

function renderBoard() {
    boardEl.innerHTML = '';
    board.forEach((value, index) => {
        const cell = document.createElement('button');
        cell.className = 'ttt-cell';
        cell.type = 'button';
        cell.dataset.index = String(index);
        cell.textContent = value ?? '';
        if (value) cell.classList.add(value === HUMAN ? 'ttt-cell--x' : 'ttt-cell--o');
        cell.disabled = Boolean(value) || gameOver;
        cell.addEventListener('click', () => onCellClick(index));
        boardEl.appendChild(cell);
    });
}

function onCellClick(index) {
    if (gameOver || board[index]) return;

    board[index] = HUMAN;
    renderBoard();

    const result = getWinner(board);
    if (result) {
        endGame(result);
        return;
    }

    statusEl.textContent = 'Vez do computador...';
    setTimeout(() => {
        const move = bestMove(board);
        if (move !== -1) board[move] = AI;
        renderBoard();

        const result2 = getWinner(board);
        if (result2) {
            endGame(result2);
        } else {
            statusEl.textContent = 'Sua vez (X)';
        }
    }, 300);
}

function getWinner(b) {
    for (const [a, c, d] of WIN_LINES) {
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    if (b.every(cell => cell)) return 'draw';
    return null;
}

function endGame(result) {
    gameOver = true;
    renderBoard();
    if (result === HUMAN) {
        wins++;
        statusEl.textContent = 'Você venceu!';
    } else if (result === AI) {
        losses++;
        statusEl.textContent = 'O computador venceu!';
    } else {
        draws++;
        statusEl.textContent = 'Empate!';
    }
    updateScoreboard();
}

function updateScoreboard() {
    winsEl.textContent = String(wins);
    drawsEl.textContent = String(draws);
    lossesEl.textContent = String(losses);
}

// Minimax: o computador nunca perde (empata ou vence).
function bestMove(b) {
    let best = { score: -Infinity, index: -1 };
    for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = AI;
        const score = minimax(b, 0, false);
        b[i] = null;
        if (score > best.score) best = { score, index: i };
    }
    return best.index;
}

function minimax(b, depth, isMaximizing) {
    const result = getWinner(b);
    if (result === AI) return 10 - depth;
    if (result === HUMAN) return depth - 10;
    if (result === 'draw') return 0;

    if (isMaximizing) {
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (b[i]) continue;
            b[i] = AI;
            best = Math.max(best, minimax(b, depth + 1, false));
            b[i] = null;
        }
        return best;
    }

    let best = Infinity;
    for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = HUMAN;
        best = Math.min(best, minimax(b, depth + 1, true));
        b[i] = null;
    }
    return best;
}

function resetGame() {
    board = Array(9).fill(null);
    gameOver = false;
    statusEl.textContent = 'Sua vez (X)';
    renderBoard();
}

document.getElementById('restartButton').addEventListener('click', resetGame);
document.getElementById('backButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

renderBoard();
