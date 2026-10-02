const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const config = require('./config');
const commands = require('./lib/commands');

const SESSION_DIR = path.join(__dirname, 'sessions');
const PORT = process.env.PORT || 10000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const state = {
  sock: null,
  connected: false,
  pairingPhone: null,
  pairingCode: null,
  pushname: null,
  myNumber: null,
  botEnabled: true,
  selfMode: false
};

function broadcastStatus() {
  io.emit('status', {
    connected: state.connected,
    number: state.myNumber,
    pushname: state.pushname,
    botEnabled: state.botEnabled,
    selfMode: state.selfMode
  });
}

async function startSock() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['ALYZ BOT', 'Chrome', '1.0.0']
  });

  state.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'open') {
      state.connected = true;
      state.myNumber = sock.user?.id?.split(':')[0] || null;
      state.pushname = sock.user?.name || null;
      state.pairingCode = null;
      console.log('[ALYZ BOT] Terhubung sebagai', state.myNumber);
      broadcastStatus();
    }

    if (connection === 'close') {
      state.connected = false;
      broadcastStatus();
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log('[ALYZ BOT] Koneksi tertutup. Logged out:', loggedOut);
      if (!loggedOut) {
        setTimeout(startSock, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    io.emit('message', msg);
    if (!msg?.message || msg.key.fromMe) return;
    if (!state.botEnabled) return;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant : jid;
    const senderNumber = (sender || '').split('@')[0];
    const isOwner = senderNumber === config.ownerNumber;

    if (state.selfMode && !isOwner) return;

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    if (!body.startsWith(config.prefix)) return;

    const [cmdRaw, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
    const cmd = (cmdRaw || '').toLowerCase();
    const fn = commands[cmd];
    if (!fn) return;

    try {
      await fn({ sock, msg, jid, sender, isGroup, args, text: body, isOwner, state });
    } catch (e) {
      console.error('[CMD ERROR]', cmd, e);
      sock.sendMessage(jid, { text: 'Terjadi kesalahan saat menjalankan perintah.' }).catch(() => {});
    }
  });

  return sock;
}

startSock().catch((e) => console.error('[ALYZ BOT] Gagal memulai:', e));

/* ---------------- REST API untuk web pairing & ALYZ PANEL ---------------- */

app.get('/api/status', (req, res) => {
  res.json({
    connected: state.connected,
    number: state.myNumber,
    pushname: state.pushname,
    botEnabled: state.botEnabled,
    selfMode: state.selfMode,
    channelLink: config.channelLink
  });
});

// Daftar "device" — bot ini hanya mengelola satu sesi WhatsApp per deployment.
app.get('/api/devices', (req, res) => {
  res.json([
    {
      id: state.myNumber || 'belum-terhubung',
      number: state.myNumber,
      pushname: state.pushname,
      connected: state.connected,
      botEnabled: state.botEnabled
    }
  ]);
});

app.post('/api/pair', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^\d{8,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Nomor tidak valid. Gunakan format 62xxxxxxxxxx.' });
    }
    if (!state.sock) return res.status(503).json({ error: 'Socket belum siap, coba lagi sebentar.' });
    if (state.connected) return res.status(409).json({ error: 'Sudah terhubung ke sebuah akun.' });

    const code = await state.sock.requestPairingCode(phone);
    state.pairingPhone = phone;
    state.pairingCode = code;
    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Gagal membuat kode pairing.' });
  }
});

app.post('/api/bot/toggle', (req, res) => {
  state.botEnabled = !state.botEnabled;
  broadcastStatus();
  res.json({ botEnabled: state.botEnabled });
});

app.post('/api/logout', async (req, res) => {
  try {
    if (state.sock) await state.sock.logout().catch(() => {});
    state.connected = false;
    state.myNumber = null;
    state.pushname = null;
    broadcastStatus();
    res.json({ ok: true });
    setTimeout(startSock, 1500);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Socket.IO realtime chat (dipakai oleh ALYZ PANEL) ---------------- */

io.on('connection', (socket) => {
  broadcastStatus();

  socket.on('send-message', async ({ jid, text }) => {
    if (!state.sock || !jid || !text) return;
    try {
      await state.sock.sendMessage(jid, { text });
      socket.emit('send-result', { ok: true });
    } catch (e) {
      socket.emit('send-result', { ok: false, error: e.message });
    }
  });
});

server.listen(PORT, () => console.log(`[ALYZ BOT] Web pairing & API berjalan di port ${PORT}`));
