'use strict';

const crypto = require('crypto');

const token = crypto.randomBytes(32).toString('hex');

console.log('BRIDGE_TOKEN generado (64 caracteres hex):');
console.log('');
console.log(token);
console.log('');
console.log('Copia este valor en:');
console.log('  host-bridge/.env       -> BRIDGE_TOKEN=' + token);
console.log('  orchestrator/.env      -> BRIDGE_TOKEN=' + token);
