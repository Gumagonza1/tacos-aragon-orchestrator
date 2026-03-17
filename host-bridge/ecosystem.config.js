'use strict';

module.exports = {
  apps: [
    {
      name: 'host-bridge',
      script: 'bridge.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        BRIDGE_PORT: 9999,
        BRIDGE_TOKEN: process.env.BRIDGE_TOKEN,
      },
    },
  ],
};
