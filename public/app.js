const $ = (s) => document.querySelector(s);
const show = (id) => {
  ['intro', 'pairForm', 'pairResult', 'connected'].forEach((s) => ($('#' + s).style.display = 'none'));
  $('#' + id).style.display = 'block';
};

$('#btnMulai').onclick = () => show('pairForm');

$('#btnRequest').onclick = async () => {
  const phone = $('#phone').value.trim().replace(/[^0-9]/g, '');
  const msg = $('#formMsg');
  if (!/^\d{8,15}$/.test(phone)) {
    msg.innerHTML = '<div class="error">NOMOR TIDAK VALID, GUNAKAN FORMAT 628XXXXXXXXXX</div>';
    return;
  }
  msg.innerHTML = '';
  try {
    const res = await fetch('./api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membuat kode pairing');
    $('#codeBox').textContent = data.code;
    show('pairResult');
  } catch (e) {
    msg.innerHTML = '<div class="error">' + e.message.toUpperCase() + '</div>';
  }
};

async function pollStatus() {
  try {
    const res = await fetch('./api/status');
    const data = await res.json();
    if (data.connected) {
      $('#connNumber').textContent = 'Terhubung sebagai +' + data.number;
      show('connected');
    }
  } catch (e) { /* abaikan, coba lagi nanti */ }
}
setInterval(pollStatus, 3000);
pollStatus();
