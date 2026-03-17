'use strict';

const { test, mock, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

process.env.DB_PATH = path.join(__dirname, 'test_recovery.db');

function limpiarDb() {
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}
  try { fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch {}
  try { fs.unlinkSync(process.env.DB_PATH + '-wal'); } catch {}
}

before(() => limpiarDb());
after(() => limpiarDb());

const queries = require('../src/db/queries');

test('logica de fallas — primer fallo incrementa a 1', () => {
  const fallas = queries.incrementarFallas('wa-test-1');
  assert.equal(fallas.contador, 1);
  assert.equal(fallas.en_cooldown, 0);
});

test('logica de fallas — segundo fallo incrementa a 2', () => {
  queries.incrementarFallas('wa-test-2');
  const fallas = queries.incrementarFallas('wa-test-2');
  assert.equal(fallas.contador, 2);
});

test('logica de fallas — tercer fallo incrementa a 3', () => {
  queries.incrementarFallas('wa-test-3');
  queries.incrementarFallas('wa-test-3');
  const fallas = queries.incrementarFallas('wa-test-3');
  assert.equal(fallas.contador, 3);
});

test('cooldown — se activa y bloquea', () => {
  queries.incrementarFallas('wa-cooldown');
  queries.marcarCooldown('wa-cooldown', true);

  const fallas = queries.obtenerFallas('wa-cooldown');
  assert.equal(fallas.en_cooldown, 1);
});

test('cooldown — se desactiva tras periodo', () => {
  queries.incrementarFallas('wa-cooldown2');
  queries.marcarCooldown('wa-cooldown2', true);
  queries.marcarCooldown('wa-cooldown2', false);

  const fallas = queries.obtenerFallas('wa-cooldown2');
  assert.equal(fallas.en_cooldown, 0);
});

test('reset tras 30 min — contador vuelve a cero', () => {
  queries.incrementarFallas('wa-reset');
  queries.incrementarFallas('wa-reset');
  queries.resetearFallas('wa-reset');

  const fallas = queries.obtenerFallas('wa-reset');
  assert.equal(fallas.contador, 0);
  assert.equal(fallas.en_cooldown, 0);
});

test('fallas en cooldown — no se deben contar como nuevas fallas', () => {
  queries.incrementarFallas('wa-enqueue');
  queries.incrementarFallas('wa-enqueue');
  queries.incrementarFallas('wa-enqueue');
  queries.marcarCooldown('wa-enqueue', true);

  const fallas = queries.obtenerFallas('wa-enqueue');
  assert.equal(fallas.en_cooldown, 1);
  assert.equal(fallas.contador, 3);
});

test('propuesta de recuperacion — se crea con estado pendiente', () => {
  const id = queries.crearPropuesta('recuperacion_whatsapp', 'Reiniciar bot', null);
  const pendientes = queries.obtenerPropuestasPendientes();
  const encontrada = pendientes.find(p => Number(p.id) === Number(id));
  assert.ok(encontrada);
  assert.equal(encontrada.estado, 'pendiente');
});
