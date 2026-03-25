'use strict';

const SERVICIOS = [
  {
    nombre: 'TacosAragon',
    tipo: 'http',
    url: process.env.WA_URL || 'http://localhost:3003',
    endpoint: '/health',
    proceso: 'TacosAragon',
    descripcion: 'Bot de WhatsApp',
    critico: true,
  },
  {
    nombre: 'MonitorBot',
    tipo: 'pm2',
    proceso: 'MonitorBot',
    descripcion: 'Agente monitor Claude',
    critico: true,
  },
  {
    nombre: 'tacos-api',
    tipo: 'http',
    url: process.env.API_URL || 'http://host.docker.internal:3001',
    endpoint: '/health',
    proceso: 'tacos-api',
    descripcion: 'API central Express',
    critico: true,
  },
  {
    nombre: 'cfo-agent',
    tipo: 'http',
    url: process.env.CFO_URL || 'http://host.docker.internal:3002',
    endpoint: '/health',
    proceso: 'cfo-agent',
    descripcion: 'Agente CFO FastAPI',
    critico: false,
  },
  {
    nombre: 'pmo-agent',
    tipo: 'pm2',
    proceso: 'pmo-agent',
    descripcion: 'Agente PMO — Claude Code para gestión de código',
    critico: false,
  },
  {
    nombre: 'tacos-aragon-web',
    tipo: 'nssm',
    servicio: process.env.FLASK_SERVICIO_NSSM || 'tacos-aragon-web',
    url: process.env.WEB_URL || 'http://host.docker.internal:5000',
    endpoint: '/health',
    descripcion: 'Pagina web Flask (NSSM)',
    critico: false,
  },
];

module.exports = { SERVICIOS };
