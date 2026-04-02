'use strict';

require('dotenv').config();

const express    = require('express');
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');
const { ejecutar } = require('./ejecutor');

const PUERTO = parseInt(process.env.BRIDGE_PORT, 10) || 9999;
const TOKEN  = process.env.BRIDGE_TOKEN;

if (!TOKEN) {
  console.error('[bridge] BRIDGE_TOKEN no definido — proceso detenido');
  process.exit(1);
}

if (TOKEN.length < 32) {
  console.error('[bridge] BRIDGE_TOKEN demasiado corto — minimo 32 caracteres');
  process.exit(1);
}

const BEARER_ESPERADO = `Bearer ${TOKEN}`;

function verificarToken(auth) {
  if (!auth || auth.length !== BEARER_ESPERADO.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(auth),
      Buffer.from(BEARER_ESPERADO)
    );
  } catch {
    return false;
  }
}

// Comandos de escritura — modifican el sistema: requieren límite estricto
const COMANDOS_ESCRITURA = new Set(['pm2_restart', 'pm2_stop', 'pm2_start', 'taskkill_chrome', 'git_pull']);

const app = express();
app.use(express.json({ limit: '64kb' }));

// Rate limit global — 600 peticiones por 15 minutos (cubre lectura + escritura holgadamente)
const limiterGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones' },
});

// Rate limit estricto solo para comandos de ESCRITURA — 20 por 15 minutos
// Previene que un proceso comprometido reinicie/detenga servicios en bucle.
// Los comandos de lectura (pm2_list, sc_query, disk_status, mem_status, pm2_logs)
// no están limitados aquí porque el orquestador los usa intensivamente en health checks.
const limiterEscritura = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de comandos de escritura alcanzado' },
  skip: (req) => {
    // Solo aplicar a comandos de escritura; dejar pasar los de lectura
    const { comando } = req.body || {};
    return !COMANDOS_ESCRITURA.has(comando);
  },
});

app.use(limiterGlobal);

app.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (!verificarToken(auth)) {
    console.warn(`[bridge] Acceso denegado | IP: ${req.ip} | ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

app.post('/ejecutar', limiterEscritura, async (req, res) => {
  const { comando, params } = req.body;

  if (!comando) {
    return res.status(400).json({ error: 'Campo "comando" requerido' });
  }

  // Log sin params para no exponer rutas o datos sensibles
  console.log(`[bridge] ${new Date().toISOString()} — ejecutando: ${comando}`);

  try {
    const resultado = ejecutar(comando, params || {});
    res.json({ ok: true, resultado });
  } catch (err) {
    console.error(`[bridge] Error en ${comando}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const servidor = app.listen(PUERTO, '127.0.0.1', () => {
  console.log(`[bridge] Escuchando en 127.0.0.1:${PUERTO}`);
});

process.on('SIGTERM', () => {
  servidor.close(() => process.exit(0));
});
