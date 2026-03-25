'use strict';

const cron = require('node-cron');
const { verificarDisco, verificarMemoria, limpiarLogsViejos, verificarCommitsNuevos } = require('../executor/acciones');
const { resumenDiario, registrarEvento } = require('../db/queries');
const { notificarAdmin } = require('../notifier/notifier');

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

  // Resumen diario a las 9 AM — sin IA, texto directo desde DB
  cron.schedule('0 9 * * *', async () => {
    try {
      const datos = resumenDiario();

      // Errores y críticos por servicio
      const errores = datos.eventos.filter(e => e.nivel === 'error' || e.nivel === 'critical');
      const lineasErrores = errores.length > 0
        ? errores.map(e => `  - ${e.servicio}: ${e.total} evento(s)`).join('\n')
        : '  Sin errores';

      // Acciones autónomas
      const lineasAcciones = datos.acciones.length > 0
        ? datos.acciones.map(a => `  - ${a.tipo}: ${a.total}`).join('\n')
        : '  Ninguna';

      // Propuestas
      const pendientes = (datos.propuestas.find(p => p.estado === 'pendiente') || {}).total || 0;
      const aprobadas  = (datos.propuestas.find(p => p.estado === 'aprobada')  || {}).total || 0;
      const rechazadas = (datos.propuestas.find(p => p.estado === 'rechazada') || {}).total || 0;

      const texto =
        `*[ORQUESTADOR]* Resumen de las ultimas 24h\n\n` +
        `*Errores/Criticos:*\n${lineasErrores}\n\n` +
        `*Acciones autonomas:*\n${lineasAcciones}\n\n` +
        `*Propuestas:* pendientes=${pendientes} aprobadas=${aprobadas} rechazadas=${rechazadas}`;

      await notificarAdmin(texto);
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
