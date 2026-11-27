'use strict';
const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ------------------------------------------------------------------ single instance
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// Keep timers running at full speed for a transparent, non-focused window.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// ------------------------------------------------------------------ settings
const DEFAULTS = { scale: 3, wander: true, chatty: true, posX: null };
let settings = { ...DEFAULTS };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
  settings.scale = [1, 2, 3, 4, 5].includes(settings.scale) ? settings.scale : 3;
}
function saveSettings() {
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* non-fatal */ }
}

// ------------------------------------------------------------------ window
let win = null, tray = null, topTimer = null, visible = true;
const send = (msg) => { if (win && !win.isDestroyed()) win.webContents.send('pet:action', msg); };
const workAreaAt = (x, y) => screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: 300, height: 300, x: wa.x + wa.width - 320, y: wa.y + wa.height - 320,
    transparent: true, frame: false, hasShadow: false, resizable: false, maximizable: false, minimizable: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
    roundedCorners: false, thickFrame: false, backgroundColor: '#00000000', title: 'manosh',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, spellcheck: false, devTools: !app.isPackaged,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { win = null; });
  // Windows can quietly drop topmost status (e.g. after the taskbar is clicked) - reassert it.
  topTimer = setInterval(() => {
    if (win && !win.isDestroyed() && win.isVisible()) { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); }
  }, 4000);
}

// ------------------------------------------------------------------ menu
function buildMenu(ctx = {}) {
  const cmd = (label, name) => ({ label, click: () => send({ type: 'command', name }) });
  const setSetting = (patch) => { settings = { ...settings, ...patch }; saveSettings(); send({ type: 'settings', settings }); };
  const sizes = [[1, 'Tiny'], [2, 'Small'], [3, 'Normal'], [4, 'Large'], [5, 'Huge']];
  return Menu.buildFromTemplate([
    { label: 'manosh.exe', enabled: false },
    { type: 'separator' },
    cmd('Say hi', 'wave'),
    cmd('Say something', 'talk'),
    cmd('Write code', 'code'),
    cmd('Give coffee', 'coffee'),
    { label: 'Do something\u2026', submenu: [
      cmd('Dance', 'dance'), cmd('Jump', 'jump'), cmd('Walk', 'walk'), cmd('Run', 'run'),
      cmd('Sit down', 'sit'), cmd('Look around', 'look'), cmd('Stretch', 'stretch'),
    ] },
    ctx.asleep ? cmd('Wake up', 'wake') : cmd('Go to sleep', 'sleep'),
    { type: 'separator' },
    { label: 'Wander around', type: 'checkbox', checked: settings.wander, click: (i) => setSetting({ wander: i.checked }) },
    { label: 'Speech bubbles', type: 'checkbox', checked: settings.chatty, click: (i) => setSetting({ chatty: i.checked }) },
    { label: 'Size', submenu: sizes.map(([n, l]) => ({ label: l, type: 'radio', checked: settings.scale === n, click: () => setSetting({ scale: n }) })) },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Bring to center', click: () => { if (!visible) toggleVisible(); send({ type: 'recenter' }); } },
    { label: visible ? 'Hide manosh' : 'Show manosh', click: toggleVisible },
    { label: 'Quit manosh', click: () => app.quit() },
  ]);
}
function toggleVisible() {
  if (!win) return;
  visible = !visible;
  if (visible) win.showInactive(); else win.hide();
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('manosh.exe');
  tray.on('click', () => { if (!visible) toggleVisible(); send({ type: 'recenter' }); });
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu({ asleep: false })));
}

// ------------------------------------------------------------------ IPC
ipcMain.handle('pet:info', () => {
  const wa = screen.getPrimaryDisplay().workArea;
  return { settings, workArea: wa, posX: settings.posX };
});
ipcMain.handle('pet:workarea', (_e, x, y) => workAreaAt(x, y));
ipcMain.on('pet:bounds', (_e, b) => {
  if (!win || win.isDestroyed() || !b) return;
  const n = (v) => (Number.isFinite(v) ? Math.round(v) : 0);
  win.setBounds({ x: n(b.x), y: n(b.y), width: Math.max(60, n(b.width)), height: Math.max(60, n(b.height)) });
});
ipcMain.on('pet:ignore', (_e, ignore) => {
  if (!win || win.isDestroyed()) return;
  if (ignore) win.setIgnoreMouseEvents(true, { forward: true }); else win.setIgnoreMouseEvents(false);
});
ipcMain.on('pet:ready', () => { if (win && visible) { win.showInactive(); win.moveTop(); } });
ipcMain.on('pet:menu', (_e, ctx) => {
  if (!win || win.isDestroyed()) return;
  buildMenu(ctx || {}).popup({ window: win });
});

// ------------------------------------------------------------------ lifecycle
app.on('second-instance', () => { if (!visible) toggleVisible(); send({ type: 'recenter' }); });
app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.manosh.desktoppet');
  loadSettings();
  createWindow();
  createTray();
  const notify = () => send({ type: 'display' });
  screen.on('display-metrics-changed', notify);
  screen.on('display-added', notify);
  screen.on('display-removed', notify);
});
app.on('before-quit', () => {
  clearInterval(topTimer);
  if (win && !win.isDestroyed()) { const b = win.getBounds(); settings.posX = Math.round(b.x + b.width / 2); }
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* ignore */ }
});
// A desktop pet has no "last window closed" quit semantics other than the menu / tray.
app.on('window-all-closed', () => app.quit());
