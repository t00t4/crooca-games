require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

if (!process.env.SESSION_SECRET) {
    console.error('SESSION_SECRET não definido. Configure a variável de ambiente antes de iniciar.');
    process.exit(1);
}

require('fs').mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'crooca.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        game TEXT NOT NULL,
        score INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores(game, score DESC);
`);

const VALID_GAMES = new Set(['pacman', 'snake', 'tictactoe', 'pong', 'asteroids', 'breakout', 'spaceinvaders']);

// Hash "isca": comparado quando o usuário não existe, para o tempo de resposta
// do login ser o mesmo com ou sem usuário (evita enumeração por timing).
const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation', 10);

// Necessário para o Express confiar no cabeçalho X-Forwarded-* do Nginx (proxy reverso com TLS)
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'script-src': ["'self'"],
            'style-src': ["'self'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'img-src': ["'self'", 'data:'],
            'connect-src': ["'self'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'frame-ancestors': ["'none'"],
        },
    },
}));

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

app.use(session({
    name: 'croca.sid',
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

// --- Rate limiting ---
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Muitas tentativas. Tente novamente em alguns minutos.',
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too many requests' },
});

// --- Validação ---
function isValidUsername(username) {
    return typeof username === 'string' && /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 6 && password.length <= 200;
}

// --- Autenticação ---
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        // Páginas autenticadas nunca devem ser cacheadas por proxies compartilhados.
        res.set('Cache-Control', 'no-store');
        return next();
    }
    return res.redirect('/login.html');
}

function requireApiAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    return res.status(401).json({ error: 'not authenticated' });
}

// --- Gate de acesso (default-deny) ---
// Só passam adiante rotas explicitamente permitidas. Qualquer outra coisa
// (código-fonte, banco de dados, Dockerfile, dotfiles, /server/*) recebe 404,
// nunca chegando ao express.static que serve a raiz do projeto.
const PUBLIC_FILES = new Set(['/login.html', '/signup.html']);
const ASSET_PREFIXES = ['/css/', '/js/', '/images/'];
const AUTH_ENDPOINTS = new Set(['/login', '/signup', '/logout', '/health']);

app.use((req, res, next) => {
    const p = req.path;

    // Endpoints de API (cada um cuida da própria autenticação)
    if (p.startsWith('/api/')) return next();

    // Endpoints de autenticação e healthcheck
    if (AUTH_ENDPOINTS.has(p)) return next();

    // Páginas públicas de login/cadastro
    if (PUBLIC_FILES.has(p)) return next();

    // Assets estáticos públicos (css/js/images). O express.static bloqueia
    // travessia de diretório ("..") por conta própria.
    if (ASSET_PREFIXES.some((prefix) => p.startsWith(prefix))) return next();

    // Home e qualquer página .html exigem autenticação
    if (p === '/' || p === '' || p.endsWith('.html')) return requireAuth(req, res, next);

    // Tudo o mais é negado.
    return res.status(404).send('Not found');
});

app.use(express.static(path.join(__dirname, '..')));

// --- Rotas ---
app.get('/health', (req, res) => res.status(200).send('ok'));

app.post('/signup', authLimiter, (req, res) => {
    const { username, password } = req.body;

    if (!isValidUsername(username)) {
        return res.status(400).send('Usuário inválido: use 3-30 caracteres (letras, números, _).');
    }
    if (!isValidPassword(password)) {
        return res.status(400).send('Senha inválida: use ao menos 6 caracteres.');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
        db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
        return res.status(201).send('User registered successfully!');
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).send('Usuário já existe.');
        }
        console.error('Erro ao registrar usuário:', err);
        return res.status(500).send('Error on the server.');
    }
});

app.post('/login', authLimiter, (req, res) => {
    const { username, password } = req.body;

    if (!isValidUsername(username) || !isValidPassword(password)) {
        return res.status(400).send('Credenciais inválidas.');
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    // Sempre executa um compare (contra o hash do usuário ou o hash isca) para
    // que o tempo de resposta não revele se o usuário existe.
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const passwordIsValid = bcrypt.compareSync(password, hashToCompare);

    if (!user || !passwordIsValid) {
        return res.status(401).send('Usuário ou senha incorretos.');
    }

    req.session.regenerate((err) => {
        if (err) {
            console.error('Erro ao criar sessão:', err);
            return res.status(500).send('Error on the server.');
        }
        req.session.userId = user.id;
        req.session.username = user.username;
        res.status(200).send('Login successful!');
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Erro ao encerrar sessão:', err);
        res.clearCookie('croca.sid');
        res.status(200).send('Logged out.');
    });
});

app.get('/api/session', (req, res) => {
    if (!req.session || !req.session.userId) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, username: req.session.username });
});

app.post('/api/scores', apiLimiter, requireApiAuth, (req, res) => {
    const { game, score } = req.body;
    if (!VALID_GAMES.has(game)) return res.status(400).json({ error: 'invalid game' });
    if (!Number.isFinite(score) || score < 0 || score > 10_000_000) {
        return res.status(400).json({ error: 'invalid score' });
    }

    db.prepare('INSERT INTO scores (user_id, game, score) VALUES (?, ?, ?)')
        .run(req.session.userId, game, Math.round(score));

    res.status(201).json({ ok: true });
});

app.get('/api/leaderboard/global', requireApiAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT u.username AS username, SUM(best) AS total
        FROM (
            SELECT user_id, game, MAX(score) AS best
            FROM scores
            GROUP BY user_id, game
        ) bests
        JOIN users u ON u.id = bests.user_id
        GROUP BY bests.user_id
        ORDER BY total DESC
        LIMIT 20
    `).all();

    res.json(rows);
});

app.get('/api/leaderboard/:game', requireApiAuth, (req, res) => {
    const { game } = req.params;
    if (!VALID_GAMES.has(game)) return res.status(400).json({ error: 'invalid game' });

    const rows = db.prepare(`
        SELECT u.username AS username, MAX(s.score) AS best
        FROM scores s
        JOIN users u ON u.id = s.user_id
        WHERE s.game = ?
        GROUP BY s.user_id
        ORDER BY best DESC
        LIMIT 20
    `).all(game);

    res.json(rows);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
