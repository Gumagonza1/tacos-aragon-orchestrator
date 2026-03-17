'use strict';

const VARS_REQUERIDAS = [
  'ANTHROPIC_API_KEY',
  'API_URL',
  'API_TOKEN',
  'ADMIN_NUMERO',
  'BRIDGE_TOKEN',
  'BRIDGE_URL',
];

function validarConfig() {
  const faltantes = VARS_REQUERIDAS.filter(v => !process.env[v]);

  if (faltantes.length > 0) {
    console.error(`[config] Variables de entorno faltantes: ${faltantes.join(', ')}`);
    process.exit(1);
  }

  // Validar formato de numero admin
  if (!/^\d{10,15}@c\.us$/.test(process.env.ADMIN_NUMERO)) {
    console.error('[config] ADMIN_NUMERO formato invalido — debe ser 521XXXXXXXXXX@c.us');
    process.exit(1);
  }
}

const INTERVALO_HEALTH_MS = parseInt(process.env.INTERVALO_HEALTH_MS, 10) || 30000;

module.exports = { validarConfig, INTERVALO_HEALTH_MS };
