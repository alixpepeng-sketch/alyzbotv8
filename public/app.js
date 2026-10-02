const $ = (s) => document.querySelector(s);

const show = (id) => {
  ['intro', 'pairForm', 'pairResult', 'connected'].forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
};

document.addEventListener('DOMContentLoaded', () => {
  show('intro');

  $('#btnMulai')?.addEventListener('click', () => {
    show('pairForm');
  });

  $('#btnRequest')?.addEventListener('click', async () => {
    const phoneEl = $('#phone');
    const msgEl = $('#formMsg');
    const codeEl = $('#codeBox');
    const btn = $('#btnRequest');
    
    let phone = phoneEl.value.replace(/[^0-9]/g, '');

    if (!phone.startsWith('62') || phone.length < 10) {
      msgEl.innerHTML = `<span style="color:#ff3b30">Nomor harus 62, contoh 6283176204764</span>`;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'MEMINTA...';
    msgEl.textContent = '';

    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal');

      if (codeEl) codeEl.textContent = data.code;
      show('pairResult');
    } catch (e) {
      msgEl.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'DAPATKAN KODE';
    }
  });
});

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      const conn = document.getElementById('connNumber');
      if (conn) conn.textContent = `Terhubung sebagai +${data.number}`;
      show('connected');
    }
  } catch {}
}
setInterval(pollStatus, 3000);
pollStatus();
