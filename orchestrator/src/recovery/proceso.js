'use strict';

const { llamarBridge } = require('../executor/bridge');
const { incrementarFallas, resetearFallas, registrarAccionAutonoma, registrarEvento } = require('../db/queries');
const { notificarAdmin } = require('../notifier/notifier');

const LIMITE_AUTO = 2;

async function manejarFallaProceso(servicio) {
  const fallas = incrementarFallas(servicio.nombre);
  const contador = fallas.contador;

  registrarEvento(servicio.nombre, 'falla', `Proceso caido #${contador}`, 'error');

  if (contador <= LIMITE_AUTO) {
    await llamarBridge('pm2_restart', { proceso: servicio.proceso });
    registrarAccionAutonoma('pm2_restart', servicio.nombre, `Restart automatico falla #${contador}`);

    if (contador === LIMITE_AUTO) {
      await notificarAdmin(
        `*[ORQUESTADOR]* ${servicio.descripcion} (${servicio.nombre}) cayo por segunda vez. Reiniciado automaticamente.`
      );
    }
  } else {
    await notificarAdmin(
      `*[ORQUESTADOR]* ${servicio.descripcion} (${servicio.nombre}) ha fallado ${contador} veces. Requiero tu intervencion.`
    );
  }
}

async function reportarRecuperacionProceso(nombre) {
  resetearFallas(nombre);
  registrarEvento(nombre, 'recovery', 'Proceso recuperado — contador reseteado', 'info');
}

module.exports = { manejarFallaProceso, reportarRecuperacionProceso };
