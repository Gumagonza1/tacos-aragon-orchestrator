'use strict';

const cron = require('node-cron');
const { verificarDisco, verificarMemoria, limpiarLogsViejos, verificarCommitsNuevos } = require('../executor/acciones');
const { resumenDiario, registrarEvento } = require('../db/queries');
const { generarResumenDiario } = require('../reasoning/claude');
const { notificarAdmin } = require('../notifier/whatsapp');

const REPOS = [
  { nombre: 'tacos-aragon-bot', ruta: process.env.RUTA_BOT },
  { nombre: 'tacos-aragon-api', ruta: process.env.RUTA_API },
  { nombre: 'cfo-aragon-agent', ruta: process.env.RUTA_CFO },
];

function iniciarTareas() {
  // Verificar disco cada hora
  cron.schedule('0 * * * *', async () => {
    await verificarDisco();
  }, { timezone: 'America/Hermosillo' });

  // Verificar memoria cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    await verificarMemoria();
  }, { timezone: 'America/Hermosillo' });

  // Limpieza de logs cada dia a las 4 AM
  cron.schedule('0 4 * * *', async () => {
    await limpiarLogsViejos();
    registrarEvento('orquestador', 'limpieza', 'Limpieza de logs completada', 'info');
  }, { timezone: 'America/Hermosillo' });

  // Resumen diario a las 9 AM
  cron.schedule('0 9 * * *', async () => {
    try {
      const datos = resumenDiario();
      const resumen = await generarResumenDiario(datos);
      await notificarAdmin(`*[ORQUESTADOR]* Resumen del dia:\n\n${resumen}`);
    } catch (err) {
      registrarEvento('orquestador', 'resumen_diario', `Error: ${err.message}`, 'error');
    }
  }, { timezone: 'America/Hermosillo' });

  // Verificar commits nuevos en repos cada 2 horas
  cron.schedule('0 */2 * * *', async () => {
    for (const repo of REPOS) {
      if (!repo.ruta) continue;
      await verificarCommitsNuevos(repo.ruta, repo.nombre);
    }
  }, { timezone: 'America/Hermosillo' });

  registrarEvento('orquestador', 'inicio', 'Tareas programadas iniciadas', 'info');
}

module.exports = { iniciarTareas };
