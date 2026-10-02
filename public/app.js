const $ = (s) => document.querySelector(s);
const show = (id) => {
  ['intro', 'pairForm', 'pairResult', 'connected'].forEach((s) => {
    const el = $('#' + s);
    if(el) el.style.display = 'none';
  });
  const target = $('#' + id);
  if(target) target.style.display = 'block';
};

// biar intro muncul pertama kali
document.addEventListener('DOMContentLoaded', () => show('intro'));

$('#btnMulai').onclick = () => show('pairForm');

$('#btnRequest').onclick = async () => {
  const input = $('#phone');
  const phone = input.value.trim().replace(/[^0-9]/g, '');
  const msg = $('#formMsg');
  const btn = $('#btnRequest');
  
  if (!phone.startsWith('62') || phone.length < 10) {
    msg.innerHTML = '<div class="error">HARUS FORMAT 62, CONTOH 62812XXXX</div>';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'MEMINTA KODE...';
  msg.innerHTML = '';
  
  try {
    const res = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membuat kode');
    
    $('#codeBox').textContent = data.code.match(/.{1,4}/g).join('-'); // biar jadi XXXX-XXXX
    $('#codeInfo').textContent = `Masukkan di WA: Setelan > Perangkat Tertaut > Tautkan dengan nomor telepon`;
    show('pairResult');
  } catch (e) {
    msg.innerHTML = `<div class="error">${e.message.toUpperCase()}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'MINTA KODE';
  }
};

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      $('#connNumber').textContent = `Terhubung sebagai +${data.number} (${data.pushname || ''})`;
      show('connected');
    }
  } catch (e) {}
}
setInterval(pollStatus, 3000);
pollStatus();

// biar bisa balik ke intro
$('#btnLogout')?.addEventListener('click', async () => {
  await fetch('/api/logout', {method: 'POST'});
  show('intro');
});
