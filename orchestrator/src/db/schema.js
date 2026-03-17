'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/orchestrator.db');

let _db = null;

function obtenerDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS eventos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      servicio    TEXT NOT NULL,
      tipo        TEXT NOT NULL,
      mensaje     TEXT NOT NULL,
      nivel       TEXT NOT NULL DEFAULT 'info',
      ts          INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS fallas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      servicio    TEXT NOT NULL,
      contador    INTEGER NOT NULL DEFAULT 0,
      ultima_falla INTEGER,
      ultimo_reset INTEGER,
      en_cooldown INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS propuestas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo         TEXT NOT NULL,
      descripcion  TEXT NOT NULL,
      detalle      TEXT,
      estado       TEXT NOT NULL DEFAULT 'pendiente',
      ts_creacion  INTEGER NOT NULL DEFAULT (unixepoch()),
      ts_respuesta INTEGER
    );

    CREATE TABLE IF NOT EXISTS solicitudes_cfo (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      origen       TEXT NOT NULL,
      mensaje      TEXT NOT NULL,
      respuesta    TEXT,
      estado       TEXT NOT NULL DEFAULT 'en_proceso',
      ts_inicio    INTEGER NOT NULL DEFAULT (unixepoch()),
      ts_fin       INTEGER
    );

    CREATE TABLE IF NOT EXISTS acciones_autonomas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo         TEXT NOT NULL,
      servicio     TEXT,
      resultado    TEXT,
      ts           INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_eventos_servicio ON eventos(servicio);
    CREATE INDEX IF NOT EXISTS idx_eventos_ts ON eventos(ts);
    CREATE INDEX IF NOT EXISTS idx_propuestas_estado ON propuestas(estado);
    CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_cfo(estado);
  `);

  return _db;
}

module.exports = { obtenerDb };
