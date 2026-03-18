'use strict';

const Database = require('better-sqlite3');
const path     = require('path');

const MENSAJES_DB_PATH = process.env.MENSAJES_DB_PATH;
const CFO_URL          = process.env.CFO_URL || 'http://localhost:3002';
const CFO_TOKEN        = process.env.CFO_TOKEN;
const TIMEOUT_MS       = 30_000;   // 30s por intento (antes 120s total)
const MAX_REINTENTOS   = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const RUTAS_CFO = {
  impuestos:        '/api/impuestos/analizar',
  estado_resultados:'/api/contabilidad/estado-resultados',
  balance:          '/api/contabilidad/balance',
  chat:             '/api/cfo/chat',
};

let _db = null;

function obtenerDb() {
  if (_db) return _db;
  _db = new Database(MENSAJES_DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  return _db;
}

function leerPendientes() {
  return obtenerDb().prepare(`
    SELECT * FROM solicitudes_cfo WHERE estado = 'pendiente' ORDER BY ts_inicio ASC
  `).all();
}

function resolverSolicitud(id, respuesta, estado) {
  obtenerDb().prepare(`
    UPDATE solicitudes_cfo SET respuesta = ?, estado = ?, ts_fin = ? WHERE id = ?
  `).run(respuesta, estado, Date.now(), id);
}

function encolarRespuesta(solicitudId, texto) {
  const msgId = `cfo-resp-${solicitudId.slice(-8)}-${Date.now()}`;
  obtenerDb().prepare(`
    INSERT OR REPLACE INTO mensajes_queue (id, tipo, mensaje, origen, enviado, ts)
    VALUES (?, 'texto', ?, 'cfo', 0, ?)
  `).run(msgId, texto, Date.now());
}

async function llamarCfoConRetry(ruta, payload) {
  const { default: fetch } = await import('node-fetch');
  let ultimoError;

  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    if (intento > 0) {
      const espera = (2 ** (intento - 1)) * 1000; // 1s, 2s
      console.log(`[cfo] Reintento ${intento}/${MAX_REINTENTOS - 1} en ${espera}ms...`);
      await sleep(espera);
    }

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${CFO_URL}${ruta}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-token': CFO_TOKEN },
        body:    JSON.stringify(payload),
        signal:  ctrl.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`CFO respondio ${res.status}: ${err.slice(0, 200)}`);
      }
      return await res.json();

    } catch (err) {
      clearTimeout(timer);
      ultimoError = err;
      // No reintentar si fue rechazo HTTP 4xx (error del cliente, no del servidor)
      if (err.message.includes('CFO respondio 4')) break;
      console.warn(`[cfo] Intento ${intento + 1} fallido: ${err.message}`);
    }
  }
  throw ultimoError;
}

async function procesarSolicitudCfo(solicitud) {
  const payload = JSON.parse(solicitud.payload);
  const ruta    = RUTAS_CFO[solicitud.tipo] || RUTAS_CFO.chat;

  if (solicitud.tipo === 'chat') {
    payload.pregunta = payload.pregunta || payload.mensaje;
  }

  try {
    const data  = await llamarCfoConRetry(ruta, payload);
    const texto = data.analisis_claude || data.analisis || data.respuesta || JSON.stringify(data);

    resolverSolicitud(solicitud.id, texto, 'resuelta');
    encolarRespuesta(solicitud.id, `*CFO [${solicitud.tipo}]:*\n\n${texto.slice(0, 3500)}`);
    console.log(`[cfo] Solicitud ${solicitud.id} resuelta`);

  } catch (err) {
    resolverSolicitud(solicitud.id, err.message, 'error');
    encolarRespuesta(solicitud.id, `Error CFO [${solicitud.tipo}]: ${err.message}`);
    console.error(`[cfo] Error procesando ${solicitud.id} tras ${MAX_REINTENTOS} intentos:`, err.message);
  }
}

async function procesarPendientesCfo() {
  if (!MENSAJES_DB_PATH) return;
  if (!CFO_TOKEN) {
    console.error('[cfo] CFO_TOKEN no definido — omitiendo procesamiento');
    return;
  }

  const pendientes = leerPendientes();
  for (const solicitud of pendientes) {
    await procesarSolicitudCfo(solicitud);
  }
}

module.exports = { procesarPendientesCfo };
