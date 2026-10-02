const fs = require('fs');
const path = require('path');
const axios = require('axios');
const QRCode = require('qrcode');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

// ---------- helper umum ----------

async function bufferFromStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function downloadQuotedMedia(msg, type) {
  const stream = await downloadContentFromMessage(msg, type);
  return bufferFromStream(stream);
}

function getQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.quotedMessage) return null;
  return {
    message: ctx.quotedMessage,
    participant: ctx.participant,
    stanzaId: ctx.stanzaId,
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      fromMe: ctx.participant === msg.key.remoteJid,
      participant: ctx.participant
    }
  };
}

function tmpFile(ext) {
  return path.join('/tmp', `alyz-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

function runFfmpeg(inputPath, outputPath, applyFn) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath);
    applyFn(cmd);
    cmd.on('end', () => resolve(outputPath)).on('error', reject).save(outputPath);
  });
}

// ---------- commands ----------
// Setiap command: async (ctx) => {...}
// ctx = { sock, msg, jid, sender, isGroup, args, text, raw, isOwner, log }

const commands = {
  async menu(ctx) {
    const { sock, jid } = ctx;
    const list = Object.keys(commands)
      .filter((k) => k !== 'menu')
      .sort()
      .map((k) => `${config.prefix}${k}`)
      .join('\n');
    const caption = `*${config.botName}*\n\nDaftar perintah:\n${list}`;
    try {
      await sock.sendMessage(jid, { image: { url: config.catboxMenuImg }, caption });
    } catch (e) {
      // kalau gambar header gagal dimuat, tetap kirim teksnya
      await sock.sendMessage(jid, { text: caption });
    }
  },

  async tiktok(ctx) {
    const { sock, jid, args } = ctx;
    const url = args[0];
    if (!url) return sock.sendMessage(jid, { text: `Gunakan: ${config.prefix}tiktok <link>` });
    try {
      const { data } = await axios.get('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
      const d = data && data.data;
      const file = d && (d.hdplay || d.play);
      if (!file) throw new Error('Link video tidak ditemukan');
      await sock.sendMessage(jid, { video: { url: file }, caption: d.title || '' });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal mengambil video: ' + e.message });
    }
  },

  async selfmode(ctx) {
    const { sock, jid, args, isOwner, state } = ctx;
    if (!isOwner) return sock.sendMessage(jid, { text: 'Hanya owner yang bisa mengubah selfmode.' });
    const mode = (args[0] || '').toLowerCase();
    if (mode === 'on') state.selfMode = true;
    else if (mode === 'off') state.selfMode = false;
    else return sock.sendMessage(jid, { text: `Gunakan: ${config.prefix}selfmode on / off` });
    await sock.sendMessage(jid, { text: `Selfmode ${state.selfMode ? 'AKTIF' : 'NONAKTIF'}.` });
  },

  async toptv(ctx) {
    const { sock, jid, msg } = ctx;
    const quoted = getQuoted(msg);
    const videoMsg = quoted && (quoted.message.videoMessage || quoted.message.viewOnceMessage?.message?.videoMessage);
    if (!videoMsg) return sock.sendMessage(jid, { text: `Reply video dengan ${config.prefix}toptv` });
    try {
      const buf = await downloadQuotedMedia(videoMsg, 'video');
      // ptv = video note (bulat). Butuh dukungan versi Baileys yang mengirim flag ptv.
      await sock.sendMessage(jid, { video: buf, ptv: true });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal membuat PTV: ' + e.message });
    }
  },

  async toimg(ctx) {
    const { sock, jid, msg } = ctx;
    const quoted = getQuoted(msg);
    const stickerMsg = quoted && quoted.message.stickerMessage;
    if (!stickerMsg) return sock.sendMessage(jid, { text: `Reply stiker dengan ${config.prefix}toimg` });
    try {
      const buf = await downloadQuotedMedia(stickerMsg, 'sticker');
      const png = await sharp(buf).png().toBuffer();
      await sock.sendMessage(jid, { image: png });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal mengonversi stiker: ' + e.message });
    }
  },

  async kick(ctx) {
    const { sock, jid, msg, isGroup } = ctx;
    if (!isGroup) return sock.sendMessage(jid, { text: 'Perintah ini hanya untuk grup.' });
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctxInfo?.mentionedJid?.[0];
    const repliedParticipant = ctxInfo?.participant;
    const target = mentioned || repliedParticipant;
    if (!target) return sock.sendMessage(jid, { text: `Reply atau tag SATU orang untuk di-kick dengan ${config.prefix}kick` });

    try {
      const meta = await sock.groupMetadata(jid);
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const botIsAdmin = meta.participants.some((p) => p.id === botJid && (p.admin === 'admin' || p.admin === 'superadmin'));
      if (!botIsAdmin) return sock.sendMessage(jid, { text: 'Bot bukan admin grup ini.' });
      // kick 1 orang saja, tidak pernah loop seluruh anggota grup
      await sock.groupParticipantsUpdate(jid, [target], 'remove');
      await sock.sendMessage(jid, { text: 'Berhasil mengeluarkan 1 anggota.' });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal kick: ' + e.message });
    }
  },

  async rvo(ctx) {
    const { sock, jid, msg } = ctx;
    const quoted = getQuoted(msg);
    const inner = quoted && (quoted.message.viewOnceMessage?.message || quoted.message.viewOnceMessageV2?.message);
    if (!inner) return sock.sendMessage(jid, { text: `Reply pesan sekali lihat dengan ${config.prefix}rvo` });
    try {
      if (inner.imageMessage) {
        const buf = await downloadQuotedMedia(inner.imageMessage, 'image');
        await sock.sendMessage(jid, { image: buf, caption: inner.imageMessage.caption || '' });
      } else if (inner.videoMessage) {
        const buf = await downloadQuotedMedia(inner.videoMessage, 'video');
        await sock.sendMessage(jid, { video: buf, caption: inner.videoMessage.caption || '' });
      } else {
        await sock.sendMessage(jid, { text: 'Tidak ada media sekali lihat pada pesan ini.' });
      }
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal membuka pesan sekali lihat: ' + e.message });
    }
  },

  async open(ctx) {
    const { sock, jid, isGroup } = ctx;
    if (!isGroup) return sock.sendMessage(jid, { text: 'Perintah ini hanya untuk grup.' });
    try {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await sock.sendMessage(jid, { text: 'Grup dibuka, semua anggota bisa chat.' });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal membuka grup: ' + e.message });
    }
  },

  async close(ctx) {
    const { sock, jid, isGroup } = ctx;
    if (!isGroup) return sock.sendMessage(jid, { text: 'Perintah ini hanya untuk grup.' });
    try {
      await sock.groupSettingUpdate(jid, 'announcement');
      await sock.sendMessage(jid, { text: 'Grup ditutup, hanya admin yang bisa chat.' });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal menutup grup: ' + e.message });
    }
  },

  async toqr(ctx) {
    const { sock, jid, text, args } = ctx;
    const content = args.join(' ');
    if (!content) return sock.sendMessage(jid, { text: `Gunakan: ${config.prefix}toqr <teks>` });
    try {
      const buf = await QRCode.toBuffer(content, { margin: 1, width: 512 });
      await sock.sendMessage(jid, { image: buf, caption: 'QR code' });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal membuat QR: ' + e.message });
    }
  },

  async tomp3(ctx) {
    const { sock, jid, msg } = ctx;
    const quoted = getQuoted(msg);
    const media = quoted && (quoted.message.videoMessage || quoted.message.audioMessage);
    const type = quoted?.message.videoMessage ? 'video' : quoted?.message.audioMessage ? 'audio' : null;
    if (!media || !type) return sock.sendMessage(jid, { text: `Reply video/audio dengan ${config.prefix}tomp3` });
    const inPath = tmpFile(type === 'video' ? 'mp4' : 'ogg');
    const outPath = tmpFile('mp3');
    try {
      const buf = await downloadQuotedMedia(media, type);
      fs.writeFileSync(inPath, buf);
      await runFfmpeg(inPath, outPath, (cmd) => cmd.noVideo().audioCodec('libmp3lame'));
      const mp3 = fs.readFileSync(outPath);
      await sock.sendMessage(jid, { audio: mp3, mimetype: 'audio/mpeg', fileName: 'alyz.mp3' });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal konversi ke MP3: ' + e.message });
    } finally {
      [inPath, outPath].forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
    }
  },

  async getpp(ctx) {
    const { sock, jid, msg, args } = ctx;
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctxInfo?.mentionedJid?.[0];
    const repliedParticipant = ctxInfo?.participant;
    let target = mentioned || repliedParticipant;
    if (!target && args[0]) {
      const num = args[0].replace(/[^0-9]/g, '');
      if (num) target = num + '@s.whatsapp.net';
    }
    if (!target) return sock.sendMessage(jid, { text: `Reply, tag, atau ketik nomor. Contoh: ${config.prefix}getpp 628xxxx` });
    try {
      const url = await sock.profilePictureUrl(target, 'image');
      await sock.sendMessage(jid, { image: { url }, caption: '@' + target.split('@')[0], mentions: [target] });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Tidak bisa mengambil foto profil (mungkin diprivasi).' });
    }
  },

  async revoke(ctx) {
    const { sock, jid, msg } = ctx;
    const quoted = getQuoted(msg);
    if (!quoted) return sock.sendMessage(jid, { text: `Reply pesan BOT yang ingin dihapus dengan ${config.prefix}revoke` });
    if (!quoted.key.fromMe) return sock.sendMessage(jid, { text: 'Hanya bisa menghapus pesan milik bot sendiri.' });
    try {
      await sock.sendMessage(jid, { delete: quoted.key });
    } catch (e) {
      await sock.sendMessage(jid, { text: 'Gagal menghapus pesan: ' + e.message });
    }
  }
};

module.exports = commands;
