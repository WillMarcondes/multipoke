const { app, BaseWindow, WebContentsView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------- Configuração salva em disco ----------
const CFG_FILE = path.join(app.getPath('userData'), 'config.json');
let cfg = {
  gameUrl: 'https://pokeidle.io/app',
  accounts: 4,
  twitch: [
    'clovaobengala','matta','guaxilol1','techzz','axtlol','tftoddy','patopapao','rodil',
    'luccatv','cogu','faasii','biscoitao','dersin2k','denissnidertv','faturetosl','mecmeno'
  ]
};
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) }; } catch {}
const saveCfg = () => fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2));

const SIDEBAR_W = 340;
let win, dash;
const games = [];            // views das contas
const lives = new Map();     // canal -> view oculta
const stats = [];            // último dado coletado de cada conta

// ---------- Coletor: roda dentro de cada página do jogo ----------
// Ajuste os seletores/regex aqui conforme o HTML real do PokeIdle.
const COLLECTOR = `(() => {
  const t = document.body ? document.body.innerText : '';
  const pick = (re) => { const m = t.match(re); return m ? m[1].trim() : null; };
  return {
    xpH:      pick(/([\\d.,]+\\s*[KkMm]?)\\s*XP\\/h/i),
    profitH:  pick(/([\\d.,]+\\s*[KkMm]?)\\s*\\/h\\s*\\n?\\s*Lucro/i),
    nick:     document.title || null,
    hunting:  /hunting|ca[cç]ando/i.test(t)
  };
})()`;

// ---------- Layout ----------
function layout() {
  const { width, height } = win.getContentBounds();
  const gw = width - SIDEBAR_W;
  const cols = 2, rows = Math.ceil(cfg.accounts / cols);
  const cw = Math.floor(gw / cols), ch = Math.floor(height / rows);
  games.forEach((v, i) => v.setBounds({
    x: (i % cols) * cw, y: Math.floor(i / cols) * ch, width: cw, height: ch
  }));
  dash.setBounds({ x: gw, y: 0, width: SIDEBAR_W, height });
}

// ---------- Contas ----------
function createGame(i) {
  const v = new WebContentsView({
    webPreferences: {
      partition: `persist:acc${i + 1}`,  // sessão (login/cookies) isolada por conta
      backgroundThrottling: false        // não pausa quando fora de foco
    }
  });
  v.webContents.loadURL(cfg.gameUrl);
  win.contentView.addChildView(v);
  games.push(v);
}

// ---------- Lives em segundo plano ----------
function startLive(channel) {
  if (lives.has(channel)) return;
  const v = new WebContentsView({
    webPreferences: { partition: 'persist:twitch', backgroundThrottling: false }
  });
  v.webContents.setAudioMuted(true);
  v.webContents.on('dom-ready', () => {
    // pede a menor qualidade para gastar pouca banda/CPU
    v.webContents.executeJavaScript(
      `try{localStorage.setItem('video-quality','{"default":"160p30"}')}catch(e){}`
    ).catch(() => {});
  });
  v.webContents.loadURL(`https://www.twitch.tv/${channel}`);
  win.contentView.addChildView(v);
  v.setBounds({ x: 0, y: 0, width: 320, height: 180 });
  v.setVisible(false);
  lives.set(channel, v);
}

function stopLive(channel) {
  const v = lives.get(channel);
  if (!v) return;
  win.contentView.removeChildView(v);
  v.webContents.close();
  lives.delete(channel);
}

// ---------- Janela ----------
app.whenReady().then(() => {
  win = new BaseWindow({ width: 1600, height: 900, title: 'Pokeidle Multi' });

  for (let i = 0; i < cfg.accounts; i++) createGame(i);

  dash = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  dash.webContents.loadFile(path.join(__dirname, 'dashboard.html'));
  win.contentView.addChildView(dash);

  layout();
  win.on('resize', layout);
  cfg.twitch.forEach(startLive);

  // coleta de dados a cada 5s
  setInterval(async () => {
    for (let i = 0; i < games.length; i++) {
      try { stats[i] = await games[i].webContents.executeJavaScript(COLLECTOR); }
      catch { stats[i] = null; }
    }
    if (!dash.webContents.isDestroyed()) {
      dash.webContents.send('state', { stats, twitch: cfg.twitch });
    }
  }, 5000);
});

// ---------- Comandos vindos do painel ----------
ipcMain.handle('twitch:add', (_e, raw) => {
  const ch = String(raw).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (ch && !cfg.twitch.includes(ch)) { cfg.twitch.push(ch); saveCfg(); startLive(ch); }
  return cfg.twitch;
});
ipcMain.handle('twitch:remove', (_e, ch) => {
  cfg.twitch = cfg.twitch.filter(c => c !== ch); saveCfg(); stopLive(ch);
  return cfg.twitch;
});
ipcMain.handle('game:reload', (_e, i) => games[i]?.webContents.reload());
ipcMain.handle('game:devtools', (_e, i) => games[i]?.webContents.openDevTools({ mode: 'detach' }));
ipcMain.handle('state:get', () => ({ stats, twitch: cfg.twitch, accounts: cfg.accounts }));

app.on('window-all-closed', () => app.quit());
