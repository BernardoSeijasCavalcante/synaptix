module.exports = {
  apps: [
    {
      name: 'synaptix-core',
      script: 'uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=* --no-server-header',
      cwd: '/app/backend',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        SYNAPTIX_BIND_HOST: '0.0.0.0',
        SYNAPTIX_BIND_PORT: '8000',
        SYNAPTIX_ALLOWED_ORIGINS: 'http://localhost:8000,http://127.0.0.1:8000,https://synaptix.amtheinner.com'
      }
    }
  ]
};
