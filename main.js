const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// 1. Boot up the KMS Backend inside the native app
require('./server.js');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0a0e17',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the React app from exactly where Vite builds it
  mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  
  // Normal minimize behavior — window stays in taskbar, NOT hidden
  // Only hide to tray when the user clicks the X (close) button
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Generate a visible 16x16 icon programmatically (bright blue circle on transparent bg)
  // This guarantees the icon is ALWAYS visible regardless of file path issues
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4); // RGBA
  const cx = size / 2, cy = size / 2, r = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        // Bright blue-purple gradient
        canvas[idx] = 59;    // R
        canvas[idx+1] = 130; // G
        canvas[idx+2] = 246; // B
        canvas[idx+3] = 255; // A
      } else {
        canvas[idx+3] = 0; // Transparent
      }
    }
  }
  const icon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Routster Dashboard', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('Routster (Running)');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

