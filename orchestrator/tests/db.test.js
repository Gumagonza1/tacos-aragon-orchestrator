'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

process.env.DB_PATH = path.join(__dirname, 'test_orchestrator.db');

const {
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
} = require('../src/db/queries');

function limpiarDb() {
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch {}
}

before(() => limpiarDb());
after(() => limpiarDb());

test('registrarEvento — inserta correctamente', () => {
  registrarEvento('test-servicio', 'inicio', 'Mensaje de prueba', 'info');
  const eventos = eventosRecientes('test-servicio', 60);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].servicio, 'test-servicio');
  assert.equal(eventos[0].tipo, 'inicio');
  assert.equal(eventos[0].nivel, 'info');
});

test('registrarEvento — nivel por defecto es info', () => {
  registrarEvento('test-servicio2', 'test', 'Sin nivel');
  const eventos = eventosRecientes('test-servicio2', 60);
  assert.equal(eventos[0].nivel, 'info');
});

test('incrementarFallas — crea registro si no existe', () => {
  const fallas = incrementarFallas('servicio-nuevo');
  assert.equal(fallas.contador, 1);
  assert.equal(fallas.servicio, 'servicio-nuevo');
});

test('incrementarFallas — incrementa contador existente', () => {
  incrementarFallas('servicio-contador');
  incrementarFallas('servicio-contador');
  const fallas = incrementarFallas('servicio-contador');
  assert.equal(fallas.contador, 3);
});

test('resetearFallas — pone contador en cero', () => {
  incrementarFallas('servicio-reset');
  incrementarFallas('servicio-reset');
  resetearFallas('servicio-reset');
  const fallas = obtenerFallas('servicio-reset');
  assert.equal(fallas.contador, 0);
});

test('marcarCooldown — activa y desactiva', () => {
  incrementarFallas('servicio-cooldown');
  marcarCooldown('servicio-cooldown', true);
  let fallas = obtenerFallas('servicio-cooldown');
  assert.equal(fallas.en_cooldown, 1);

  marcarCooldown('servicio-cooldown', false);
  fallas = obtenerFallas('servicio-cooldown');
  assert.equal(fallas.en_cooldown, 0);
});

test('crearPropuesta — retorna id valido', () => {
  const id = crearPropuesta('git_pull', 'Actualizar bot', 'diff de prueba');
  assert.ok(typeof id === 'number' || typeof id === 'bigint');
  assert.ok(id > 0);
});

test('obtenerPropuestasPendientes — solo devuelve pendientes', () => {
  const id1 = crearPropuesta('config', 'Propuesta pendiente', null);
  const id2 = crearPropuesta('config', 'Propuesta a rechazar', null);
  responderPropuesta(id2, false);

  const pendientes = obtenerPropuestasPendientes();
  const ids = pendientes.map(p => Number(p.id));
  assert.ok(ids.includes(Number(id1)));
  assert.ok(!ids.includes(Number(id2)));
});

test('responderPropuesta — marca como aprobada', () => {
  const id = crearPropuesta('reinicio', 'Reiniciar API', null);
  responderPropuesta(id, true);
  const pendientes = obtenerPropuestasPendientes();
  assert.ok(!pendientes.find(p => Number(p.id) === Number(id)));
});

test('crearSolicitudCfo — crea y resuelve correctamente', () => {
  const id = crearSolicitudCfo('monitor', 'Dame el resumen fiscal');
  assert.ok(id > 0);
  resolverSolicitudCfo(id, 'Respuesta del CFO');
});

test('registrarAccionAutonoma — inserta sin error', () => {
  assert.doesNotThrow(() => {
    registrarAccionAutonoma('pm2_restart', 'TacosAragon', 'Restart exitoso');
  });
});

test('registrarAccionAutonoma — servicio y resultado pueden ser null', () => {
  assert.doesNotThrow(() => {
    registrarAccionAutonoma('limpieza_logs', null, null);
  });
});

test('resumenDiario — devuelve estructura correcta', () => {
  const resumen = resumenDiario();
  assert.ok(Array.isArray(resumen.eventos));
  assert.ok(Array.isArray(resumen.acciones));
  assert.ok(Array.isArray(resumen.propuestas));
});

test('eventosRecientes — filtra por tiempo correctamente', () => {
  registrarEvento('filtro-test', 'tipo', 'Mensaje reciente', 'warn');
  const recientes = eventosRecientes('filtro-test', 1);
  assert.equal(recientes.length, 1);
  const viejos = eventosRecientes('filtro-no-existe', 1);
  assert.equal(viejos.length, 0);
});
