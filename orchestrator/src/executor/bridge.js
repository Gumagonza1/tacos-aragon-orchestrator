'use strict';

/**
 * bridge.js — Docker Engine API bridge (reemplaza host-bridge de Windows)
 *
 * Usa el Docker socket montado en /var/run/docker.sock para:
 * - Reiniciar contenedores (reemplaza pm2_restart/pm2_stop/pm2_start)
 * - Verificar estado (reemplaza pm2_list)
 * - Info de disco/memoria del host
 * - taskkill_chrome (kill chromium dentro del contenedor bot-tacos)
 */

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');

const DOCKER_SOCKET = '/var/run/docker.sock';

// Mapa de nombres PM2 → nombres de contenedores Docker
const PM2_TO_CONTAINER = {
  TacosAragon:           'bot-tacos',
  MonitorBot:            'bot-tacos-monitor',
  'tacos-api':           'tacos-api',
  'cfo-agent':           'cfo-agent',
  'telegram-dispatcher': 'telegram-dispatcher',
  'pmo-agent':           'pmo-agent',
  'portfolio-aragon':    'portfolio-aragon',
};

function dockerRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      socketPath: DOCKER_SOCKET,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, data: data }); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function llamarBridge(comando, params = {}) {
  switch (comando) {
    case 'pm2_restart': {
      const container = PM2_TO_CONTAINER[params.proceso] || params.proceso;
      const res = await dockerRequest('POST', `/containers/${container}/restart?t=10`);
      if (res.status === 204 || res.status === 200) return { ok: true };
      throw new Error(`Docker restart failed: ${res.status} ${JSON.stringify(res.data)}`);
    }

    case 'pm2_stop': {
      const container = PM2_TO_CONTAINER[params.proceso] || params.proceso;
      const res = await dockerRequest('POST', `/containers/${container}/stop?t=10`);
      if (res.status === 204 || res.status === 304) return { ok: true };
      throw new Error(`Docker stop failed: ${res.status}`);
    }

    case 'pm2_start': {
      const container = PM2_TO_CONTAINER[params.proceso] || params.proceso;
      const res = await dockerRequest('POST', `/containers/${container}/start`);
      if (res.status === 204 || res.status === 304) return { ok: true };
      throw new Error(`Docker start failed: ${res.status}`);
    }

    case 'pm2_list': {
      const res = await dockerRequest('GET', '/containers/json?all=true');
      if (res.status !== 200) throw new Error('Docker list failed');
      const containers = res.data;
      return containers.map((c) => ({
        name: (c.Names[0] || '').replace(/^\//, ''),
        status: c.State,
        uptime: c.Status,
      }));
    }

    case 'pm2_logs': {
      const container = PM2_TO_CONTAINER[params.proceso] || params.proceso || 'bot-tacos';
      const lineas = params.lineas || 20;
      const res = await dockerRequest('GET', `/containers/${container}/logs?stdout=true&stderr=true&tail=${lineas}`);
      return { logs: typeof res.data === 'string' ? res.data : JSON.stringify(res.data) };
    }

    case 'taskkill_chrome': {
      // Kill chromium inside bot-tacos container
      try {
        execSync(`docker exec bot-tacos pkill -f chromium || true`, { stdio: 'ignore', timeout: 5000 });
      } catch {}
      return { ok: true };
    }

    case 'disk_status': {
      try {
        const out = execSync("df -h / | tail -1 | awk '{print $2,$3,$4,$5}'", { encoding: 'utf8' });
        const [total, usado, disponible, porcentaje] = out.trim().split(/\s+/);
        return { total, usado, disponible, porcentaje };
      } catch { return { error: 'No se pudo obtener estado del disco' }; }
    }

    case 'mem_status': {
      try {
        const out = execSync("free -m | grep Mem | awk '{print $2,$3,$4}'", { encoding: 'utf8' });
        const [total, usado, disponible] = out.trim().split(/\s+/).map(Number);
        return { totalMB: total, usadoMB: usado, disponibleMB: disponible };
      } catch { return { error: 'No se pudo obtener estado de memoria' }; }
    }

    case 'git_check_updates':
    case 'git_pull': {
      // Git operations not supported in Docker orchestrator yet
      return { ok: false, mensaje: 'Git operations pendientes de implementar en Docker' };
    }

    case 'sc_query': {
      // NSSM/Windows services don't exist in Docker
      return { ok: false, mensaje: 'NSSM no aplica en Docker' };
    }

    default:
      throw new Error(`Comando bridge no soportado: ${comando}`);
  }
}

async function pingBridge() {
  try {
    return fs.existsSync(DOCKER_SOCKET);
  } catch {
    return false;
  }
}

module.exports = { llamarBridge, pingBridge };
