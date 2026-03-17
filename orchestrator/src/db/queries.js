'use strict';

const { obtenerDb } = require('./schema');

function registrarEvento(servicio, tipo, mensaje, nivel = 'info') {
  const db = obtenerDb();
  db.prepare(
    'INSERT INTO eventos (servicio, tipo, mensaje, nivel) VALUES (?, ?, ?, ?)'
  ).run(servicio, tipo, mensaje, nivel);
}

function obtenerFallas(servicio) {
  const db = obtenerDb();
  return db.prepare('SELECT * FROM fallas WHERE servicio = ?').get(servicio);
}

function incrementarFallas(servicio) {
  const db = obtenerDb();
  const existente = obtenerFallas(servicio);

  if (existente) {
    db.prepare(
      'UPDATE fallas SET contador = contador + 1, ultima_falla = unixepoch() WHERE servicio = ?'
    ).run(servicio);
  } else {
    db.prepare(
      'INSERT INTO fallas (servicio, contador, ultima_falla) VALUES (?, 1, unixepoch())'
    ).run(servicio);
  }

  return obtenerFallas(servicio);
}

function resetearFallas(servicio) {
  const db = obtenerDb();
  db.prepare(
    'UPDATE fallas SET contador = 0, ultimo_reset = unixepoch(), en_cooldown = 0 WHERE servicio = ?'
  ).run(servicio);
}

function marcarCooldown(servicio, activo) {
  const db = obtenerDb();
  const existente = obtenerFallas(servicio);

  if (existente) {
    db.prepare('UPDATE fallas SET en_cooldown = ? WHERE servicio = ?').run(activo ? 1 : 0, servicio);
  } else {
    db.prepare('INSERT INTO fallas (servicio, contador, en_cooldown) VALUES (?, 0, ?)').run(servicio, activo ? 1 : 0);
  }
}

function crearPropuesta(tipo, descripcion, detalle) {
  const db = obtenerDb();
  const r = db.prepare(
    'INSERT INTO propuestas (tipo, descripcion, detalle) VALUES (?, ?, ?)'
  ).run(tipo, descripcion, detalle || null);
  return r.lastInsertRowid;
}

function responderPropuesta(id, aprobada) {
  const db = obtenerDb();
  db.prepare(
    'UPDATE propuestas SET estado = ?, ts_respuesta = unixepoch() WHERE id = ?'
  ).run(aprobada ? 'aprobada' : 'rechazada', id);
}

function obtenerPropuestasPendientes() {
  const db = obtenerDb();
  return db.prepare("SELECT * FROM propuestas WHERE estado = 'pendiente' ORDER BY ts_creacion ASC").all();
}

function crearSolicitudCfo(origen, mensaje) {
  const db = obtenerDb();
  const r = db.prepare(
    'INSERT INTO solicitudes_cfo (origen, mensaje) VALUES (?, ?)'
  ).run(origen, mensaje);
  return r.lastInsertRowid;
}

function resolverSolicitudCfo(id, respuesta) {
  const db = obtenerDb();
  db.prepare(
    "UPDATE solicitudes_cfo SET respuesta = ?, estado = 'completada', ts_fin = unixepoch() WHERE id = ?"
  ).run(respuesta, id);
}

function registrarAccionAutonoma(tipo, servicio, resultado) {
  const db = obtenerDb();
  db.prepare(
    'INSERT INTO acciones_autonomas (tipo, servicio, resultado) VALUES (?, ?, ?)'
  ).run(tipo, servicio || null, resultado || null);
}

function eventosRecientes(servicio, minutos = 60) {
  const db = obtenerDb();
  const desde = Math.floor(Date.now() / 1000) - minutos * 60;
  return db.prepare(
    'SELECT * FROM eventos WHERE servicio = ? AND ts >= ? ORDER BY ts DESC LIMIT 100'
  ).all(servicio, desde);
}

function resumenDiario() {
  const db = obtenerDb();
  const desde = Math.floor(Date.now() / 1000) - 86400;

  const eventos = db.prepare(
    "SELECT servicio, nivel, COUNT(*) as total FROM eventos WHERE ts >= ? GROUP BY servicio, nivel"
  ).all(desde);

  const acciones = db.prepare(
    'SELECT tipo, COUNT(*) as total FROM acciones_autonomas WHERE ts >= ? GROUP BY tipo'
  ).all(desde);

  const propuestas = db.prepare(
    "SELECT estado, COUNT(*) as total FROM propuestas WHERE ts_creacion >= ? GROUP BY estado"
  ).all(desde);

  return { eventos, acciones, propuestas };
}

module.exports = {
  registrarEvento,
  obtenerFallas,
  incrementarFallas,
  resetearFallas,
  marcarCooldown,
  crearPropuesta,
  responderPropuesta,
  obtenerPropuestasPendientes,
  crearSolicitudCfo,
  resolverSolicitudCfo,
  registrarAccionAutonoma,
  eventosRecientes,
  resumenDiario,
};
