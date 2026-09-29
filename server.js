const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const MAX_JSON_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 4_000_000;
const SESSION_MS = 12 * 60 * 60 * 1000;
const loginAttempts = new Map();
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!PASSWORD || PASSWORD.length < 12) {
    console.error('Defina ADMIN_PASSWORD com pelo menos 12 caracteres antes de iniciar o servidor.');
    process.exit(1);
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(MENU_FILE)) {
    fs.copyFileSync(path.join(__dirname, 'default-menu.json'), MENU_FILE);
}

const hash = value => crypto.createHash('sha256').update(String(value)).digest();
const safeEqual = (left, right) => crypto.timingSafeEqual(hash(left), hash(right));
const sign = value => crypto.createHmac('sha256', sessionSecret).update(String(value)).digest('hex');

function isAuthenticated(request) {
    const cookie = /(?:^|;\s*)tt=(\d+)\.([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '');
    if (!cookie || Number(cookie[1]) <= Date.now()) return false;
    return safeEqual(cookie[2], sign(cookie[1]));
}

function send(response, status, body, type = 'application/json', headers = {}) {
    response.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers
    });
    response.end(Buffer.isBuffer(body) ? body : typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(request, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;

        request.on('data', chunk => {
            size += chunk.length;
            if (size > limit) {
                tooLarge = true;
                chunks.length = 0;
            } else if (!tooLarge) {
                chunks.push(chunk);
            }
        });
        request.on('end', () => {
            if (tooLarge) reject(new Error('request body too large'));
            else resolve(Buffer.concat(chunks));
        });
        request.on('error', reject);
    });
}

const text = (value, maxLength) => String(value ?? '').slice(0, maxLength);
const validId = value => /^[\w-]{1,30}$/.test(value || '') ? value : crypto.randomBytes(6).toString('hex');

function cleanMenu(menu) {
    return {
        tag: text(menu.tag, 120),
        cats: (Array.isArray(menu.cats) ? menu.cats : []).slice(0, 50).map(category => ({
            id: validId(category.id),
            name: text(category.name, 80),
            items: (Array.isArray(category.items) ? category.items : []).slice(0, 200).map(item => ({
                id: validId(item.id),
                n: text(item.n, 120),
                d: text(item.d, 600),
                p: Math.max(0, Number(item.p) || 0),
                img: /^\/uploads\/[\w-]+\.jpg$/.test(item.img || '') ? item.img : '',
                v: Boolean(item.v),
                off: Boolean(item.off)
            }))
        }))
    };
}

function parseJson(buffer) {
    return JSON.parse(buffer.toString('utf8') || '{}');
}

function loginRateLimited(ip) {
    const attempt = loginAttempts.get(ip);
    if (!attempt) return false;
    if (attempt.blockedUntil > Date.now()) return true;
    if (attempt.blockedUntil) loginAttempts.delete(ip);
    return false;
}

function recordFailedLogin(ip) {
    const attempt = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
    attempt.count += 1;
    if (attempt.count >= 5) {
        attempt.count = 0;
        attempt.blockedUntil = Date.now() + 15 * 60 * 1000;
    }
    loginAttempts.set(ip, attempt);
}

const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/admin', ['index.html', 'text/html; charset=utf-8']],
    ['/admin/', ['index.html', 'text/html; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
    ['/default-menu.json', ['default-menu.json', 'application/json; charset=utf-8']]
]);

const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const secure = request.headers['x-forwarded-proto'] === 'https';

        if (request.method === 'GET' && url.pathname === '/api/menu') {
            return send(response, 200, fs.readFileSync(MENU_FILE));
        }

        if (request.method === 'GET' && url.pathname === '/api/me') {
            return send(response, isAuthenticated(request) ? 200 : 401, { ok: isAuthenticated(request) });
        }

        if (request.method === 'POST' && url.pathname === '/api/login') {
            const ip = (request.headers['x-forwarded-for'] || '').split(',')[0].trim() || request.socket.remoteAddress || 'unknown';
            if (loginRateLimited(ip)) return send(response, 429, { ok: false, error: 'Tente novamente em 15 minutos.' });

            const credentials = parseJson(await readBody(request, 2_000));
            if (!safeEqual(credentials.password || '', PASSWORD)) {
                recordFailedLogin(ip);
                await new Promise(resolve => setTimeout(resolve, 500));
                return send(response, 401, { ok: false });
            }

            loginAttempts.delete(ip);
            const expires = Date.now() + SESSION_MS;
            const cookie = `tt=${expires}.${sign(expires)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
            return send(response, 200, { ok: true }, 'application/json', { 'Set-Cookie': cookie });
        }

        if (request.method === 'POST' && url.pathname === '/api/logout') {
            return send(response, 200, { ok: true }, 'application/json', {
                'Set-Cookie': 'tt=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
            });
        }

        if (request.method === 'PUT' && url.pathname === '/api/menu') {
            if (!isAuthenticated(request)) return send(response, 401, { ok: false });
            const menu = cleanMenu(parseJson(await readBody(request, MAX_JSON_BYTES)));
            const temporaryFile = `${MENU_FILE}.tmp`;
            fs.writeFileSync(temporaryFile, JSON.stringify(menu, null, 2));
            fs.renameSync(temporaryFile, MENU_FILE);
            return send(response, 200, { ok: true });
        }

        if (request.method === 'POST' && url.pathname === '/api/upload') {
            if (!isAuthenticated(request)) return send(response, 401, { ok: false });
            if (!String(request.headers['content-type'] || '').startsWith('image/jpeg')) {
                return send(response, 415, { ok: false, error: 'Envie uma imagem JPEG.' });
            }

            const image = await readBody(request, MAX_IMAGE_BYTES);
            if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image.at(-2) !== 0xff || image.at(-1) !== 0xd9) {
                return send(response, 400, { ok: false, error: 'Imagem JPEG inválida.' });
            }

            const fileName = `${crypto.randomBytes(12).toString('hex')}.jpg`;
            fs.writeFileSync(path.join(UPLOAD_DIR, fileName), image, { flag: 'wx' });
            return send(response, 200, { url: `/uploads/${fileName}` });
        }

        const upload = /^\/uploads\/([\w-]+\.jpg)$/.exec(url.pathname);
        if (request.method === 'GET' && upload) {
            const filePath = path.join(UPLOAD_DIR, upload[1]);
            if (fs.existsSync(filePath)) {
                response.writeHead(200, {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'X-Content-Type-Options': 'nosniff'
                });
                return fs.createReadStream(filePath).pipe(response);
            }
        }

        const file = staticFiles.get(url.pathname);
        if (request.method === 'GET' && file) {
            return send(response, 200, fs.readFileSync(path.join(__dirname, file[0])), file[1]);
        }

        return send(response, 404, { error: 'Não encontrado.' });
    } catch (error) {
        if (!response.headersSent) {
            const status = error.message === 'request body too large' ? 413 : 400;
            send(response, status, { error: status === 413 ? 'Arquivo muito grande.' : 'Requisição inválida.' });
        }
    }
});

server.listen(PORT, () => {
    console.log(`Cardápio Terra Tupi: http://localhost:${PORT}`);
    console.log(`Painel do restaurante: http://localhost:${PORT}/admin`);
});
