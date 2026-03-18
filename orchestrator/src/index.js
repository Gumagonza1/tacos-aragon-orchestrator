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
const { procesarPendientesCfo } = require('./queue/cfo');
const { procesarRespuestasAdmin } = require('./approval/cola');

const HEALTH_PUERTO = parseInt(process.env.HEALTH_PORT, 10) || 3000;
const estadoAnterior = new Map();
let sistemaListo  = false;
let gracePeriod   = true;
const GRACE_MS    = 60_000; // 60s tras arranque — no recovery hasta que todos los servicios hayan tenido tiempo de subir

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
      if (gracePeriod) {
        console.log(`[orquestador] Grace period activo — falla de ${nombre} ignorada hasta que expire`);
        continue;
      }
      try {
        await manejarFalla(nombre);
      } catch (err) {
        console.error(`[orquestador] Error en recovery de ${nombre}:`, err.message);
        registrarEvento(nombre, 'recovery_error', err.message, 'error');
      }
    } else if (ok && anterior === false) {
      try {
        await manejarRecuperacion(nombre);
      } catch (err) {
        console.error(`[orquestador] Error reportando recuperacion de ${nombre}:`, err.message);
      }
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

  setTimeout(() => {
    gracePeriod = false;
    console.log('[orquestador] Grace period terminado — recovery activo');
  }, GRACE_MS);

  setInterval(cicloHealth, INTERVALO_HEALTH_MS);

  // Procesar solicitudes CFO pendientes cada 10s
  setInterval(procesarPendientesCfo, 10_000);

  // Procesar respuestas del admin al orquestador (!o aprobar/rechazar) cada 5s
  setInterval(procesarRespuestasAdmin, 5_000);

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

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[orquestador] Promise rechazada sin capturar:', msg);
  registrarEvento('orquestador', 'error_critico', msg, 'critical');
});

arrancar();
