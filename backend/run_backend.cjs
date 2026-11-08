const { spawn } = require('child_process');
const path = require('path');

const pythonExe = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
// Bind estrito em 127.0.0.1 (Loopback) para impedir exposição direta na rede local
const bindHost = process.env.SYNAPTIX_BIND_HOST || '127.0.0.1';
const bindPort = process.env.SYNAPTIX_BIND_PORT || '8000';
const args = ['-m', 'uvicorn', 'main:app', '--host', bindHost, '--port', bindPort];

console.log(`Starting Synaptix Zero-Trust Backend on ${bindHost}:${bindPort} with Python:`, pythonExe);

const child = spawn(pythonExe, args, {
  cwd: __dirname,
  stdio: 'inherit',
  env: process.env
});

child.on('error', (err) => {
  console.error('Failed to start python backend:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  console.log(`Backend exited with code ${code} and signal ${signal}`);
  process.exit(code || 0);
});
