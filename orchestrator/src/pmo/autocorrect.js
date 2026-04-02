'use strict';

/**
 * autocorrect.js — Orquestador → PMO Agent
 *
 * Cuando el orquestador detecta fallas repetidas que los reinicios automáticos
 * no pueden resolver, notifica al pmo-agent para que intente diagnosticar y
 * corregir el código subyacente.
 *
 * Escribe en mensajes_queue (mensajes.db compartida) con origen='autocorrect'.
 * El pmo-agent lee estas filas en su ciclo de poll y lanza claude -p para
 * aplicar el fix correspondiente.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const crypto   = require('crypto');

const MENSAJES_DB = process.env.MENSAJES_DB ||
  '/data/bot-datos/mensajes.db';

const ID_MAX      = 120;
const MENSAJE_MAX = 2000;

let _db = null;

function obtenerDb() {
  if (_db) return _db;
  _db = new Database(MENSAJES_DB);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  return _db;
}

/**
 * Notifica al pmo-agent que un servicio ha fallado y necesita diagnóstico.
 *
 * @param {string} nombreServicio  Nombre del proceso PM2 (ej: 'TacosAragon', 'cfo-agent')
 * @param {string} descripcionError  Descripción breve del error observado
 * @param {number} contadorFallas  Número de fallas acumuladas (para priorizar severidad)
 */
function notificarPmoAutocorrect(nombreServicio, descripcionError, contadorFallas = 0) {
  try {
    const db = obtenerDb();

    // Truncar para evitar inyecciones largas (capa de seguridad)
    const servicio  = String(nombreServicio).slice(0, 50).replace(/[|]/g, '-');
    const errorInfo = String(descripcionError).slice(0, 800).replace(/\n/g, ' ');

    const id      = `autocorrect-${servicio}-${Date.now()}`.slice(0, ID_MAX);
    const mensaje = `AUTOCORRECT|${servicio}|${errorInfo}`.slice(0, MENSAJE_MAX);

    db.prepare(`
      INSERT OR IGNORE INTO mensajes_queue (id, tipo, mensaje, origen, enviado, ts)
      VALUES (?, 'texto', ?, 'autocorrect', 0, ?)
    `).run(id, mensaje, Date.now());

    console.log(`[autocorrect] PMO notificado: ${servicio} (fallas: ${contadorFallas})`);
  } catch (e) {
    // No lanzar — el orquestador no debe romperse si no puede escribir a la DB
    console.error(`[autocorrect] Error notificando PMO para ${nombreServicio}:`, e.message);
  }
}

module.exports = { notificarPmoAutocorrect };
