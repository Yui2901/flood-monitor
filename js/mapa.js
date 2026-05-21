const BELEM = [-1.4558, -48.4902];
let map, layerRisco, layerAlagados, layerDenuncias;

function initMap() {
  map = L.map('map', { zoomControl: true }).setView(BELEM, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap | Monitor Alagamentos Belém',
    maxZoom: 19
  }).addTo(map);

  layerRisco     = L.layerGroup().addTo(map);
  layerAlagados  = L.layerGroup().addTo(map);
  layerDenuncias = L.layerGroup().addTo(map);

  document.getElementById('filter-risco').addEventListener('change', e => {
    e.target.checked ? map.addLayer(layerRisco) : map.removeLayer(layerRisco);
  });
  document.getElementById('filter-alagados').addEventListener('change', e => {
    e.target.checked ? map.addLayer(layerAlagados) : map.removeLayer(layerAlagados);
  });
  document.getElementById('filter-denuncias').addEventListener('change', e => {
    e.target.checked ? map.addLayer(layerDenuncias) : map.removeLayer(layerDenuncias);
  });
}

function corRisco(nivel) {
  return { critico: '#ef4444', alto: '#f97316', medio: '#f59e0b', baixo: '#22c55e' }[nivel] || '#f59e0b';
}
function corNivel(nivel) {
  return { critico: '#7c3aed', alto: '#ef4444', medio: '#f97316', baixo: '#0ea5e9' }[nivel] || '#0ea5e9';
}

function criarCirculo(lat, lng, cor, raio, tooltip) {
  return L.circleMarker([lat, lng], {
    radius: raio, color: cor, fillColor: cor,
    fillOpacity: 0.35, weight: 2
  }).bindPopup(tooltip);
}

async function carregarMapa() {
  try {
    const [riscos, aprovadas, denuncias, stats] = await Promise.all([
      fetch('/api/areas-risco').then(r => r.json()),
      fetch('/api/areas-aprovadas').then(r => r.json()),
      fetch('/api/denuncias/publico').then(r => r.json()),
      fetch('/api/stats').then(r => r.json())
    ]);

    layerRisco.clearLayers();
    layerAlagados.clearLayers();
    layerDenuncias.clearLayers();

    riscos.forEach(a => {
      const cor = corRisco(a.nivel_risco);
      const popup = `
        <div class="popup-title">⚠️ ${a.nome}</div>
        <div class="popup-desc">${a.descricao || ''}</div>
        <span class="popup-badge" style="background:${cor}22;color:${cor}">Risco ${a.nivel_risco}</span>
        ${a.bairro ? `<div style="margin-top:4px;font-size:0.78rem;color:#94a3b8">📍 ${a.bairro}</div>` : ''}
      `;
      criarCirculo(a.latitude, a.longitude, cor, 24, popup).addTo(layerRisco);
    });

    aprovadas.forEach(a => {
      const cor = corNivel(a.nivel_alagamento);
      const data = new Date(a.criado_em).toLocaleDateString('pt-BR');
      const popup = `
        <div class="popup-title">🌊 ${a.nome}</div>
        <div class="popup-desc">${a.descricao || ''}</div>
        <span class="popup-badge" style="background:${cor}22;color:${cor}">Nível ${a.nivel_alagamento}</span>
        ${a.bairro ? `<div style="margin-top:4px;font-size:0.78rem;color:#94a3b8">📍 ${a.bairro}</div>` : ''}
        <div style="font-size:0.75rem;color:#64748b;margin-top:4px">Confirmado em ${data}</div>
      `;
      criarCirculo(a.latitude, a.longitude, cor, 18, popup).addTo(layerAlagados);
    });

    denuncias.filter(d => d.status === 'pendente').forEach(d => {
      const data = new Date(d.criado_em).toLocaleDateString('pt-BR');
      const popup = `
        <div class="popup-title">📋 Denúncia #${d.id}</div>
        <div class="popup-desc">${d.descricao}</div>
        <span class="popup-badge" style="background:#94a3b822;color:#94a3b8">Aguardando verificação</span>
        <div style="font-size:0.75rem;color:#64748b;margin-top:4px">Registrado em ${data}</div>
      `;
      criarCirculo(d.latitude, d.longitude, '#94a3b8', 10, popup).addTo(layerDenuncias);
    });

    const statMap = {};
    (stats.denuncias || []).forEach(s => statMap[s.status] = s.total);
    document.getElementById('stat-pendente').textContent = statMap['pendente'] || 0;
    document.getElementById('stat-alagadas').textContent = stats.areas_aprovadas?.total || 0;
    const totalRisco = (stats.areas_risco || []).reduce((s, r) => s + parseInt(r.total), 0);
    document.getElementById('stat-risco').textContent = totalRisco;

    const agora = new Date().toLocaleTimeString('pt-BR');
    document.getElementById('ultima-atualizacao').textContent = `Atualizado às ${agora}`;

  } catch (err) {
    console.error('Erro ao carregar mapa:', err);
    document.getElementById('ultima-atualizacao').textContent = 'Erro ao carregar dados';
  }
}

initMap();
carregarMapa();
setInterval(carregarMapa, 60000);
