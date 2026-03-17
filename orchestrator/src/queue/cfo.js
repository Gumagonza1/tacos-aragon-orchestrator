'use strict';

const Database = require('better-sqlite3');
const path     = require('path');

const MENSAJES_DB_PATH = process.env.MENSAJES_DB_PATH;
const CFO_URL          = process.env.CFO_URL || 'http://localhost:3002';
const CFO_TOKEN        = process.env.CFO_TOKEN;
const TIMEOUT_MS       = 120_000;

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

async function procesarSolicitudCfo(solicitud) {
  const { default: fetch } = await import('node-fetch');
  const payload = JSON.parse(solicitud.payload);
  const ruta    = RUTAS_CFO[solicitud.tipo] || RUTAS_CFO.chat;

  if (solicitud.tipo === 'chat') {
    payload.pregunta = payload.pregunta || payload.mensaje;
  }

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${CFO_URL}${ruta}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token':  CFO_TOKEN,
      },
      body:   JSON.stringify(payload),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`CFO respondio ${res.status}: ${err.slice(0, 200)}`);
    }

    const data  = await res.json();
    const texto = data.analisis_claude || data.analisis || data.respuesta || JSON.stringify(data);

    resolverSolicitud(solicitud.id, texto, 'resuelta');
    encolarRespuesta(solicitud.id, `*CFO [${solicitud.tipo}]:*\n\n${texto.slice(0, 3500)}`);
    console.log(`[cfo] Solicitud ${solicitud.id} resuelta`);

  } catch (err) {
    resolverSolicitud(solicitud.id, err.message, 'error');
    encolarRespuesta(solicitud.id, `Error CFO [${solicitud.tipo}]: ${err.message}`);
    console.error(`[cfo] Error procesando ${solicitud.id}:`, err.message);
  } finally {
    clearTimeout(timer);
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
