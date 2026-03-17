'use strict';

require('dotenv').config();

const http = require('http');
const { validarConfig, INTERVALO_HEALTH_MS } = require('./config');
validarConfig();

const { verificarTodos, SERVICIOS } = require('./health/monitor');
const { manejarFallaWhatsApp, reportarRecuperacion } = require('./recovery/whatsapp');
const { manejarFallaProceso, reportarRecuperacionProceso } = require('./recovery/proceso');
const { registrarEvento } = require('./db/queries');
const { iniciarTareas } = require('./scheduler/tareas');
const { pingBridge } = require('./executor/bridge');
const { notificarAdmin } = require('./notifier/whatsapp');

const HEALTH_PUERTO = parseInt(process.env.HEALTH_PORT, 10) || 3000;
const estadoAnterior = new Map();
let sistemaListo = false;

// Servidor HTTP minimo solo para health check del contenedor Docker
const healthServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const estado = sistemaListo ? 200 : 503;
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: sistemaListo, ts: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

async function cicloHealth() {
  const resultados = await verificarTodos();

  for (const resultado of resultados) {
    const { nombre, ok } = resultado;
    const anterior = estadoAnterior.get(nombre);
    estadoAnterior.set(nombre, ok);

    if (!ok && anterior !== false) {
      await manejarFalla(nombre);
    } else if (ok && anterior === false) {
      await manejarRecuperacion(nombre);
    }
  }
}

async function manejarFalla(nombre) {
  if (nombre === 'TacosAragon') {
    await manejarFallaWhatsApp();
    return;
  }

  const servicio = SERVICIOS.find(s => s.nombre === nombre);
  if (!servicio) return;

  if (servicio.tipo === 'pm2') {
    await manejarFallaProceso(servicio);
  } else {
    registrarEvento(nombre, 'falla', 'Servicio no responde — sin accion automatica disponible', 'error');
    if (servicio.critico) {
      await notificarAdmin(
        `*[ORQUESTADOR]* El servicio *${nombre}* (${servicio.descripcion}) no responde. Requiere atencion manual.`
      );
    }
  }
}

async function manejarRecuperacion(nombre) {
  if (nombre === 'TacosAragon') {
    await reportarRecuperacion();
    return;
  }
  await reportarRecuperacionProceso(nombre);
}

async function arrancar() {
  console.log('[orquestador] Iniciando...');

  healthServer.listen(HEALTH_PUERTO, '0.0.0.0', () => {
    console.log(`[orquestador] Health check disponible en :${HEALTH_PUERTO}/health`);
  });

  const bridgeOk = await pingBridge();
  if (!bridgeOk) {
    console.error('[orquestador] No se puede conectar al host-bridge. Verifica que este corriendo en el servidor.');
    process.exit(1);
  }

  console.log('[orquestador] Host-bridge conectado.');

  iniciarTareas();

  setInterval(cicloHealth, INTERVALO_HEALTH_MS);

  await cicloHealth();

  sistemaListo = true;

  await notificarAdmin('*[ORQUESTADOR]* Sistema iniciado. Monitoreando todos los servicios.');

  registrarEvento('orquestador', 'inicio', 'Orquestador iniciado correctamente', 'info');
  console.log('[orquestador] En linea. Intervalo de health check: ' + INTERVALO_HEALTH_MS + 'ms');
}

process.on('SIGTERM', () => {
  console.log('[orquestador] Recibido SIGTERM — cerrando limpiamente');
  healthServer.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[orquestador] Error no capturado:', err);
  registrarEvento('orquestador', 'error_critico', err.message, 'critical');
});

arrancar();
