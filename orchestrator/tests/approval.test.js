'use strict';

/**
 * tests/approval.test.js
 * Verifica el ciclo completo de aprobación del orquestador:
 *  1. Se crea una propuesta en orchestrator.db
 *  2. El bot escribe "aprobar N" / "rechazar N" en mensajes_responses (mensajes.db)
 *  3. procesarRespuestasAdmin() la lee, llama procesarRespuesta(), marca como procesada
 *  4. La propuesta queda en estado correcto en orchestrator.db
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

// ── DBs de prueba aisladas ────────────────────────────────────────────────────
const ORCH_DB_PATH     = path.join(__dirname, 'test_orch_approval.db');
const MENSAJES_DB_PATH = path.join(__dirname, 'test_mensajes_approval.db');

process.env.DB_PATH          = ORCH_DB_PATH;
process.env.MENSAJES_DB_PATH = MENSAJES_DB_PATH;
// notificarAdmin no debe fallar aunque no haya admin configurado
process.env.ADMIN_NUMERO = '5216671234567';

function limpiar() {
  [ORCH_DB_PATH, ORCH_DB_PATH + '-shm', ORCH_DB_PATH + '-wal',
   MENSAJES_DB_PATH, MENSAJES_DB_PATH + '-shm', MENSAJES_DB_PATH + '-wal']
    .forEach(f => { try { fs.unlinkSync(f); } catch {} });
}

// Crear mensajes.db con el schema del bot (como lo haría mensajes_db.js)
function crearMensajesDb() {
  const db = new Database(MENSAJES_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS mensajes_queue (
      id TEXT PRIMARY KEY, tipo TEXT NOT NULL DEFAULT 'texto',
      mensaje TEXT, file_path TEXT, caption TEXT,
      origen TEXT NOT NULL DEFAULT 'monitor',
      enviado INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE IF NOT EXISTS mensajes_responses (
      id TEXT NOT NULL, texto TEXT NOT NULL,
      ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      procesado INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_responses_procesado ON mensajes_responses(procesado);
  `);
  return db;
}

let mensajesDb;

// Los módulos del orquestador se cargan DESPUÉS de setear env vars
let crearPropuesta, responderPropuesta, obtenerPropuestasPendientes;
let procesarRespuesta, procesarRespuestasAdmin;

before(() => {
  limpiar();
  mensajesDb = crearMensajesDb();

  // Cargar módulos del orquestador (usan DB_PATH y MENSAJES_DB_PATH de process.env)
  const queries = require('../src/db/queries');
  crearPropuesta            = queries.crearPropuesta;
  responderPropuesta        = queries.responderPropuesta;
  obtenerPropuestasPendientes = queries.obtenerPropuestasPendientes;

  const cola = require('../src/approval/cola');
  procesarRespuesta       = cola.procesarRespuesta;
  procesarRespuestasAdmin = cola.procesarRespuestasAdmin;
});

after(() => {
  try { mensajesDb.close(); } catch {}
  limpiar();
});

// Helper: simula lo que hace el bot con !o aprobar N
function simularRespuestaBot(texto) {
  mensajesDb.prepare(
    `INSERT INTO mensajes_responses (id, texto, ts, procesado) VALUES ('orch', ?, ?, 0)`
  ).run(texto, Date.now());
}

// Helper: obtener estado de una propuesta directamente
function obtenerPropuesta(id) {
  const db = new Database(ORCH_DB_PATH);
  const row = db.prepare('SELECT * FROM propuestas WHERE id = ?').get(id);
  db.close();
  return row;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('procesarRespuesta — reconoce "aprobar N"', async () => {
  const id = crearPropuesta('git_pull', 'Actualizar repositorio', null);
  const resultado = await procesarRespuesta(`aprobar ${id}`);
  assert.ok(resultado, 'debe retornar un objeto no nulo');
  assert.equal(resultado.accion, 'aprobar');
  assert.equal(Number(resultado.id), Number(id));
  const propuesta = obtenerPropuesta(id);
  assert.equal(propuesta.estado, 'aprobada');
});

test('procesarRespuesta — reconoce "rechazar N"', async () => {
  const id = crearPropuesta('config', 'Cambiar configuracion', null);
  const resultado = await procesarRespuesta(`rechazar ${id}`);
  assert.ok(resultado);
  assert.equal(resultado.accion, 'rechazar');
  const propuesta = obtenerPropuesta(id);
  assert.equal(propuesta.estado, 'rechazada');
});

test('procesarRespuesta — devuelve null para texto no reconocido', async () => {
  const resultado = await procesarRespuesta('si');
  assert.equal(resultado, null);
});

test('procesarRespuesta — devuelve null para texto vacío', async () => {
  const resultado = await procesarRespuesta('');
  assert.equal(resultado, null);
});

test('procesarRespuestasAdmin — flujo completo: bot escribe → orquestador lee y procesa', async () => {
  const id = crearPropuesta('reinicio', 'Reiniciar servicio API', null);

  // Verificar que está pendiente
  const pendientes = obtenerPropuestasPendientes();
  assert.ok(pendientes.find(p => Number(p.id) === Number(id)));

  // Simular respuesta del bot
  simularRespuestaBot(`aprobar ${id}`);

  // Ejecutar el poller del orquestador
  await procesarRespuestasAdmin();

  // La propuesta debe estar aprobada
  const propuesta = obtenerPropuesta(id);
  assert.equal(propuesta.estado, 'aprobada');

  // Ya no debe estar en pendientes
  const pendientesDespues = obtenerPropuestasPendientes();
  assert.ok(!pendientesDespues.find(p => Number(p.id) === Number(id)));
});

test('procesarRespuestasAdmin — marca la fila como procesada después de ejecutar', async () => {
  const id = crearPropuesta('config', 'Otra propuesta test', null);
  simularRespuestaBot(`rechazar ${id}`);

  await procesarRespuestasAdmin();

  // La fila en mensajes_responses debe estar procesada
  const filas = mensajesDb.prepare(
    `SELECT procesado FROM mensajes_responses WHERE id = 'orch' AND texto = ?`
  ).all(`rechazar ${id}`);
  assert.ok(filas.length > 0);
  assert.ok(filas.every(f => f.procesado === 1));
});

test('procesarRespuestasAdmin — no procesa dos veces la misma fila', async () => {
  const id = crearPropuesta('git_pull', 'Propuesta doble proceso', null);
  simularRespuestaBot(`aprobar ${id}`);

  await procesarRespuestasAdmin();
  await procesarRespuestasAdmin(); // segunda llamada — no debe fallar ni duplicar

  const propuesta = obtenerPropuesta(id);
  assert.equal(propuesta.estado, 'aprobada'); // sigue aprobada, no hay error
});

test('procesarRespuestasAdmin — no hace nada si no hay respuestas pendientes', async () => {
  // Asegurarse de que no hay filas orch pendientes
  mensajesDb.prepare(`UPDATE mensajes_responses SET procesado = 1 WHERE id = 'orch'`).run();
  // No debe lanzar ningún error
  await assert.doesNotReject(() => procesarRespuestasAdmin());
});

test('procesarRespuesta — no acepta aprobar sin número', async () => {
  const resultado = await procesarRespuesta('aprobar');
  assert.equal(resultado, null);
});

test('procesarRespuesta — no acepta rechazar sin número', async () => {
  const resultado = await procesarRespuesta('rechazar');
  assert.equal(resultado, null);
});
