const tabs = document.getElementById('tabs');
const tableBody = document.getElementById('tableBody');
const emptyState = document.getElementById('emptyState');
const table = document.getElementById('table');

const GAME_LABELS = {
    global: 'Pontos totais',
    pacman: 'Score',
    snake: 'Score',
    tictactoe: 'Vitórias',
};

let currentUsername = null;

async function loadSession() {
    try {
        const res = await fetch('/api/session', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json();
            currentUsername = data.username;
        }
    } catch {
        currentUsername = null;
    }
}

function medalFor(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return String(rank);
}

async function loadRanking(game) {
    tableBody.innerHTML = '';
    emptyState.hidden = true;
    table.hidden = false;

    const endpoint = game === 'global' ? '/api/leaderboard/global' : `/api/leaderboard/${game}`;

    try {
        const res = await fetch(endpoint, { credentials: 'same-origin' });
        const rows = await res.json();

        if (!Array.isArray(rows) || rows.length === 0) {
            table.hidden = true;
            emptyState.hidden = false;
            return;
        }

        rows.forEach((row, i) => {
            const rank = i + 1;
            const tr = document.createElement('tr');
            if (row.username === currentUsername) tr.classList.add('is-me');

            const points = game === 'global' ? row.total : row.best;

            tr.innerHTML = `
                <td class="rank-col ${rank <= 3 ? 'medal-' + rank : ''}">${medalFor(rank)}</td>
                <td>${escapeHtml(row.username)}</td>
                <td>${points}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch {
        table.hidden = true;
        emptyState.hidden = false;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.ranking-tab');
    if (!btn) return;
    tabs.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('is-active'));
    btn.classList.add('is-active');
    loadRanking(btn.dataset.game);
});

(async () => {
    await loadSession();
    loadRanking('global');
})();
