const BELEM = [-1.4558, -48.4902];
let map, marker;

function initMap() {
  map = L.map('map-denuncia').setView(BELEM, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(map);

  map.on('click', e => definirLocal(e.latlng.lat, e.latlng.lng));
}

function definirLocal(lat, lng) {
  document.getElementById('lat').value = lat.toFixed(7);
  document.getElementById('lng').value = lng.toFixed(7);
  if (marker) marker.remove();
  marker = L.marker([lat, lng]).addTo(map).bindPopup('📍 Local da ocorrência').openPopup();
  map.setView([lat, lng], 16);
  document.getElementById('loc-status').textContent = `Local selecionado: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

document.getElementById('btn-minha-loc').addEventListener('click', () => {
  const btn = document.getElementById('btn-minha-loc');
  const status = document.getElementById('loc-status');
  if (!navigator.geolocation) {
    status.textContent = 'Geolocalização não suportada.';
    return;
  }
  btn.disabled = true;
  status.textContent = 'Obtendo localização...';
  navigator.geolocation.getCurrentPosition(
    pos => {
      definirLocal(pos.coords.latitude, pos.coords.longitude);
      btn.disabled = false;
    },
    () => {
      status.textContent = 'Não foi possível obter sua localização.';
      btn.disabled = false;
    }
  );
});

document.getElementById('form-denuncia').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-submit');
  const msgSucesso = document.getElementById('msg-sucesso');
  const msgErro = document.getElementById('msg-erro');
  msgSucesso.classList.add('hidden');
  msgErro.classList.add('hidden');

  const lat = document.getElementById('lat').value;
  const lng = document.getElementById('lng').value;
  if (!lat || !lng) {
    msgErro.textContent = 'Por favor, selecione a localização no mapa.';
    msgErro.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const form = e.target;
    const data = new FormData(form);

    const res = await fetch('/api/denuncias', { method: 'POST', body: data });
    const json = await res.json();

    if (!res.ok) throw new Error(json.erro || 'Erro ao enviar');

    msgSucesso.classList.remove('hidden');
    form.reset();
    if (marker) { marker.remove(); marker = null; }
    document.getElementById('lat').value = '';
    document.getElementById('lng').value = '';
    document.getElementById('loc-status').textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    msgErro.textContent = err.message;
    msgErro.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar Denúncia';
  }
});

initMap();
