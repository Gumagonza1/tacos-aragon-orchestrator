# tacos-aragon-orchestrator

Central orchestrator for the Aragón ecosystem. Monitors all services, executes autonomous low-risk actions, and requests admin approval for critical changes via WhatsApp.

## Architecture

```
[Docker: orchestrator]  <-->  [Windows: host-bridge (PM2)]
        |
        |-- health/       Service polling every 30s
        |-- recovery/     Restart and recovery logic
        |-- reasoning/    Problem analysis
        |-- approval/     Pending proposals queue
        |-- notifier/     WhatsApp messages to admin
        |-- queue/        CFO agent requests
        |-- scheduler/    Scheduled automatic tasks
        |-- db/           SQLite (single source of truth)
```

## Monitored services

| Service | Type | Port |
|---|---|---|
| TacosAragon | PM2 | no HTTP |
| MonitorBot | PM2 | no HTTP |
| tacos-aragon-api | PM2 + HTTP | 3001 |
| cfo-aragon-agent | PM2 + HTTP | 3002 |
| tacos-aragon-web | NSSM + HTTP | 80/443 |

## Autonomous actions (no approval required)

- PM2 process restart on failure (up to 2 times)
- Full WhatsApp recovery (pm2 stop + taskkill chrome + pm2 start + 5 min cooldown) on third failure
- Low disk alert (< 5 GB free)
- Low memory alert (< 512 MB free)
- Log cleanup at 4 AM
- Daily summary at 9 AM via WhatsApp
- New commit detection in repos every 2 hours

## Actions requiring approval

- git pull in any repo
- Configuration changes
- Any code changes
- Non-urgent restarts

## Admin response

From WhatsApp:
- `aprobar 3` — approve proposal number 3
- `rechazar 3` — reject proposal number 3

---

## Installation

### 1. Host-bridge (Windows, run once)

```bash
cd host-bridge
npm install
cp .env.example .env
# Edit .env with a secure BRIDGE_TOKEN
pm2 start ecosystem.config.js
pm2 save
```

### 2. Orchestrator (Docker)

```bash
cd orchestrator
cp .env.example .env
# Edit .env with all variables
cd ..
docker-compose up -d --build
```

### Verify

```bash
docker-compose logs -f
```

---

## Environment variables

See [orchestrator/.env.example](orchestrator/.env.example) for the full list with descriptions.

---

---

# tacos-aragon-orchestrator (ES)

Orquestador central del ecosistema Aragón. Monitorea todos los servicios, ejecuta acciones autónomas de bajo riesgo, y solicita aprobación del administrador para cambios críticos vía WhatsApp.

## Arquitectura

```
[Docker: orchestrator]  <-->  [Windows: host-bridge (PM2)]
        |
        |-- health/       Polling de servicios cada 30s
        |-- recovery/     Lógica de reinicio y recuperación
        |-- reasoning/    Análisis de problemas
        |-- approval/     Cola de propuestas pendientes
        |-- notifier/     Mensajes WhatsApp al admin
        |-- queue/        Solicitudes al agente CFO
        |-- scheduler/    Tareas automáticas programadas
        |-- db/           SQLite (única fuente de verdad)
```

## Servicios monitoreados

| Servicio | Tipo | Puerto |
|---|---|---|
| TacosAragon | PM2 | sin HTTP |
| MonitorBot | PM2 | sin HTTP |
| tacos-aragon-api | PM2 + HTTP | 3001 |
| cfo-aragon-agent | PM2 + HTTP | 3002 |
| tacos-aragon-web | NSSM + HTTP | 80/443 |

## Acciones autónomas (sin pedir permiso)

- Restart de proceso PM2 caído (hasta 2 veces)
- Recuperación completa de WhatsApp (pm2 stop + taskkill chrome + pm2 start + cooldown 5 min) al tercer fallo
- Alerta de disco bajo (< 5 GB libres)
- Alerta de memoria baja (< 512 MB libres)
- Limpieza de logs a las 4 AM
- Resumen diario a las 9 AM por WhatsApp
- Detección de commits nuevos en repos cada 2 horas

## Acciones que requieren aprobación

- git pull en cualquier repo
- Cambios de configuración
- Cualquier cambio de código
- Reinicios no urgentes

## Respuesta del administrador

Desde WhatsApp responder:
- `aprobar 3` — aprueba la propuesta número 3
- `rechazar 3` — rechaza la propuesta número 3

---

## Instalación

### 1. Host-bridge (Windows, ejecutar una sola vez)

```bash
cd host-bridge
npm install
cp .env.example .env
# Editar .env con BRIDGE_TOKEN seguro
pm2 start ecosystem.config.js
pm2 save
```

### 2. Orchestrator (Docker)

```bash
cd orchestrator
cp .env.example .env
# Editar .env con todas las variables
cd ..
docker-compose up -d --build
```

### Verificar

```bash
docker-compose logs -f
```

---

## Variables de entorno

Ver [orchestrator/.env.example](orchestrator/.env.example) para la lista completa con descripciones.
