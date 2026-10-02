# ALYZ BOT

Bot WhatsApp multi-device berbasis Baileys, login lewat pairing code (bukan QR), siap deploy di Render.com.

## Sebelum deploy
1. Edit `config.js`:
   - `catboxMenuImg` → link gambar header `.menu` (upload ke https://catbox.moe).
   - `channelLink` → link channel WhatsApp milik sendiri.
   - `ownerNumber` → nomor WhatsApp kamu (format `62xxxxxxxxxx`, tanpa `+`).
2. Push folder ini ke repo GitHub.

## Deploy di Render
1. New → Blueprint, pilih repo ini (Render akan membaca `render.yaml`).
2. Render otomatis membangun image dari `Dockerfile` dan memasang disk persistent di `/app/sessions`, supaya sesi tidak hilang saat redeploy.
3. Setelah live, buka URL Render-nya di browser → halaman pairing akan muncul.
4. Tekan MULAI → masukkan nomor WhatsApp (format `628xxxxxxxxxx`) → tekan DAPATKAN KODE.
5. Di HP: WhatsApp → Perangkat Tertaut → Tautkan Perangkat → Tautkan dengan nomor telepon → masukkan kode 8 digit yang muncul.

## Perintah
`.menu .tiktok .selfmode .toptv .toimg .kick .rvo .open .close .toqr .tomp3 .getpp .revoke`

(`.menu` sendiri tidak ditampilkan di daftar menu, sesuai permintaan.)

## Catatan penting
- **`.toptv` (video note bulat)** memakai flag `ptv: true` saat mengirim video. Fitur ini butuh versi `@whiskeysockets/baileys` yang mendukungnya — kalau WhatsApp menolak atau videonya tidak bulat, update paket Baileys ke versi terbaru.
- **`.kick`** hanya memproses satu target per perintah (reply atau tag satu orang), bot tidak pernah melakukan kick massal.
- **Tidak ada fitur broadcast massal** sesuai permintaan — tidak ada perintah untuk mengirim pesan ke banyak chat sekaligus.
- API yang dipakai ALYZ PANEL: `GET /api/status`, `GET /api/devices`, `POST /api/bot/toggle`, `POST /api/logout`, plus Socket.IO event `message` (pesan masuk) dan `send-message` (kirim pesan).
- Kode ini belum sempat dites end-to-end (tidak ada akses jaringan di lingkungan pembuatan), baru lolos pengecekan sintaks. Uji dulu di Render sebelum dipakai produksi, dan pantau log kalau ada error.
