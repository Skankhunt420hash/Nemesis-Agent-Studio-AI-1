const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const APP_URL = process.env.AGENT_STUDIO_URL || 'http://127.0.0.1:3000';
const START_LOCAL_BACKEND = process.env.AGENT_STUDIO_REMOTE === '1' ? false : !process.env.AGENT_STUDIO_URL;
let backend = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackend(retries = 30) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${APP_URL}/health`);
      if (res.ok) return true;
    } catch {}
    await wait(1000);
  }
  return false;
}

function startBackend() {
  if (!START_LOCAL_BACKEND || backend) return;
  backend = spawn(process.execPath, [path.join(__dirname, '..', 'backend.js')], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    detached: false,
    env: { ...process.env, PORT: process.env.PORT || '3000' },
  });
}

async function createWindow() {
  startBackend();
  await waitForBackend();
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#667eea',
    title: 'OpenClaw Agent Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(APP_URL);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (backend && !backend.killed) backend.kill('SIGTERM');
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
