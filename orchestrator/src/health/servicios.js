'use strict';

const SERVICIOS = [
  {
    nombre: 'TacosAragon',
    tipo: 'http',
    url: process.env.WA_URL || 'http://bot-tacos:3003',
    endpoint: '/health',
    proceso: 'TacosAragon',
    descripcion: 'Bot de WhatsApp',
    critico: true,
  },
  {
    nombre: 'tacos-api',
    tipo: 'http',
    url: process.env.API_URL || 'http://tacos-api:3001',
    endpoint: '/health',
    proceso: 'tacos-api',
    descripcion: 'API central Express',
    critico: true,
  },
  {
    nombre: 'cfo-agent',
    tipo: 'http',
    url: process.env.CFO_URL || 'http://cfo-agent:3002',
    endpoint: '/docs',
    proceso: 'cfo-agent',
    descripcion: 'Agente CFO FastAPI',
    critico: false,
  },
  {
    nombre: 'portfolio-aragon',
    tipo: 'http',
    url: process.env.PORTFOLIO_URL || 'http://portfolio-aragon:5051',
    endpoint: '/',
    proceso: 'portfolio-aragon',
    descripcion: 'Portfolio web Flask',
    critico: false,
  },
  {
    nombre: 'pmo-agent',
    tipo: 'docker',
    proceso: 'pmo-agent',
    descripcion: 'Agente PMO — Claude Code para gestión de código',
    critico: false,
  },
  {
    nombre: 'telegram-dispatcher',
    tipo: 'docker',
    proceso: 'telegram-dispatcher',
    descripcion: 'Dispatcher Telegram',
    critico: false,
  },
];

module.exports = { SERVICIOS };
