'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const crypto   = require('crypto');

const MENSAJES_DB_PATH = process.env.MENSAJES_DB_PATH;

if (!MENSAJES_DB_PATH) {
  console.error('[notifier] MENSAJES_DB_PATH no definida — proceso detenido');
  process.exit(1);
}

let _db = null;

function obtenerDb() {
  if (_db) return _db;
  _db = new Database(MENSAJES_DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS mensajes_responses (
      id        TEXT NOT NULL,
      texto     TEXT NOT NULL,
      ts        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      procesado INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_responses_procesado ON mensajes_responses(procesado);
  `);

  return _db;
}

function notificarAdmin(mensaje) {
  try {
    const db = obtenerDb();
    const id  = `orch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT OR REPLACE INTO mensajes_queue (id, tipo, mensaje, origen, enviado, ts)
      VALUES (?, 'texto', ?, 'orquestador', 0, ?)
    `).run(id, mensaje, Date.now());
  } catch (err) {
    console.error(`[notifier] Error escribiendo en mensajes_db: ${err.message}`);
  }
}

function leerRespuestasAdmin() {
  try {
    const db = obtenerDb();
    return db.prepare(`
      SELECT rowid, texto FROM mensajes_responses
      WHERE id = 'orch' AND procesado = 0
      ORDER BY ts ASC
    `).all();
  } catch (err) {
    console.error('[notifier] Error leyendo respuestas admin:', err.message);
    return [];
  }
}

function marcarRespuestaOrchProcesada(rowid) {
  try {
    const db = obtenerDb();
    db.prepare(`UPDATE mensajes_responses SET procesado = 1 WHERE rowid = ?`).run(rowid);
  } catch (err) {
    console.error('[notifier] Error marcando respuesta procesada:', err.message);
  }
}

module.exports = { notificarAdmin, leerRespuestasAdmin, marcarRespuestaOrchProcesada };
