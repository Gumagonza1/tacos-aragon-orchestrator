'use strict';

const { llamarBridge } = require('../executor/bridge');
const { incrementarFallas, resetearFallas, marcarCooldown, obtenerFallas, registrarAccionAutonoma } = require('../db/queries');
const { registrarEvento } = require('../db/queries');
const { notificarAdmin } = require('../notifier/whatsapp');

const NOMBRE_PROCESO = 'TacosAragon';
const LIMITE_FALLAS_AUTONOMAS = 2;
const LIMITE_RECUPERACION_COMPLETA = 3;
const COOLDOWN_MS = 5 * 60 * 1000;
const VENTANA_RESET_MS = 30 * 60 * 1000;

const timers = new Map();

async function manejarFallaWhatsApp() {
  const fallas = incrementarFallas(NOMBRE_PROCESO);
  const contador = fallas.contador;

  registrarEvento(NOMBRE_PROCESO, 'falla', `Falla detectada #${contador}`, 'error');

  if (fallas.en_cooldown) {
    registrarEvento(NOMBRE_PROCESO, 'recovery', 'En cooldown — falla ignorada', 'warn');
    return;
  }

  if (contador <= LIMITE_FALLAS_AUTONOMAS) {
    await _restartSimple(contador);
    return;
  }

  if (contador === LIMITE_RECUPERACION_COMPLETA) {
    await _recuperacionCompleta();
    return;
  }

  if (contador > LIMITE_RECUPERACION_COMPLETA) {
    await notificarAdmin(
      `*[ORQUESTADOR]* El bot de WhatsApp ha fallado ${contador} veces. No realizare mas intentos automaticos. Requiero tu intervencion manual.`
    );
    registrarEvento(NOMBRE_PROCESO, 'recovery', 'Se excedio el limite de recuperacion automatica', 'critical');
  }
}

async function reportarRecuperacion() {
  const fallas = obtenerFallas(NOMBRE_PROCESO);
  if (!fallas || fallas.contador === 0) return;

  const ahora = Date.now();
  const ultimaFalla = (fallas.ultima_falla || 0) * 1000;

  if (ahora - ultimaFalla >= VENTANA_RESET_MS) {
    resetearFallas(NOMBRE_PROCESO);
    registrarEvento(NOMBRE_PROCESO, 'recovery', 'Contador de fallas reseteado — 30 min sin problemas', 'info');
  }
}

async function _restartSimple(contador) {
  registrarEvento(NOMBRE_PROCESO, 'recovery', `Restart automatico #${contador}`, 'warn');

  await llamarBridge('pm2_restart', { proceso: NOMBRE_PROCESO });
  registrarAccionAutonoma('pm2_restart', NOMBRE_PROCESO, `Restart automatico falla #${contador}`);

  if (contador === LIMITE_FALLAS_AUTONOMAS) {
    await notificarAdmin(
      `*[ORQUESTADOR]* El bot de WhatsApp cayo por segunda vez. Lo reinicie automaticamente. Si vuelve a caer hare una recuperacion completa.`
    );
  }
}

async function _recuperacionCompleta() {
  registrarEvento(NOMBRE_PROCESO, 'recovery', 'Iniciando recuperacion completa (stop + taskkill + start)', 'warn');

  await notificarAdmin(
    `*[ORQUESTADOR]* El bot de WhatsApp cayo por tercera vez. Iniciando recuperacion completa: detener proceso, limpiar Chrome, reiniciar. Espera 5 minutos.`
  );

  await llamarBridge('pm2_stop', { proceso: NOMBRE_PROCESO });
  registrarAccionAutonoma('pm2_stop', NOMBRE_PROCESO, 'Recuperacion completa - paso 1');

  await _esperar(3000);

  await llamarBridge('taskkill_chrome', {});
  registrarAccionAutonoma('taskkill_chrome', NOMBRE_PROCESO, 'Recuperacion completa - paso 2');

  await _esperar(2000);

  await llamarBridge('pm2_start', { proceso: NOMBRE_PROCESO });
  registrarAccionAutonoma('pm2_start', NOMBRE_PROCESO, 'Recuperacion completa - paso 3');

  marcarCooldown(NOMBRE_PROCESO, true);
  registrarEvento(NOMBRE_PROCESO, 'recovery', 'Cooldown de 5 minutos iniciado', 'info');

  if (timers.has('cooldown')) {
    clearTimeout(timers.get('cooldown'));
  }

  timers.set('cooldown', setTimeout(async () => {
    marcarCooldown(NOMBRE_PROCESO, false);
    registrarEvento(NOMBRE_PROCESO, 'recovery', 'Cooldown terminado — monitoreando normalmente', 'info');
    await notificarAdmin(
      `*[ORQUESTADOR]* Cooldown terminado. El bot de WhatsApp esta siendo monitoreado normalmente.`
    );
  }, COOLDOWN_MS));
}

function _esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { manejarFallaWhatsApp, reportarRecuperacion };
