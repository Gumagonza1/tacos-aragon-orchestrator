'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const crypto   = require('crypto');

const MENSAJES_DB_PATH = process.env.MENSAJES_DB_PATH;
const ADMIN_NUMERO     = process.env.ADMIN_NUMERO;

if (!MENSAJES_DB_PATH) {
  console.error('[notifier] MENSAJES_DB_PATH no definida — proceso detenido');
  process.exit(1);
}

if (!ADMIN_NUMERO) {
  console.error('[notifier] ADMIN_NUMERO no definido — proceso detenido');
  process.exit(1);
}

let _db = null;

function obtenerDb() {
  if (_db) return _db;
  _db = new Database(MENSAJES_DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
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

module.exports = { notificarAdmin };
