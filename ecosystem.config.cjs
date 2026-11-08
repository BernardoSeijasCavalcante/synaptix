const path = require('path');

module.exports = {
  apps: [
    {
      name: 'synaptix-backend',
      script: './run_backend.cjs',
      cwd: path.resolve(__dirname, 'backend'),
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        SYNAPTIX_BIND_HOST: '127.0.0.1',
        SYNAPTIX_BIND_PORT: '8000'
      }
    },
    {
      name: 'synaptix-frontend',
      script: './node_modules/vite/bin/vite.js',
      cwd: path.resolve(__dirname, 'frontend'),
      args: '--host 0.0.0.0 --port 6080',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
};
