const token = localStorage.getItem('token');
const adm = JSON.parse(localStorage.getItem('adm') || '{}');

if (!token) window.location.href = 'admin.html';

document.getElementById('nav-adm-nome').textContent = `👤 ${adm.nome || ''}`;

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('adm');
  window.location.href = 'admin.html';
}

function authFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
}

// ── TABS ──────────────────────────────────────────────────
document.querySelectorAll('.dash-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dash-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'denuncias')  carregarDenuncias();
    if (tab === 'aprovadas')  carregarAprovadas();
    if (tab === 'risco')      carregarRisco();
    if (tab === 'admins')     carregarAdmins();
  });
});

// ── HELPERS ───────────────────────────────────────────────
function badgeStatus(s) {
  const map = { pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada' };
  return `<span class="card-badge badge-${s}">${map[s] || s}</span>`;
}
function badgeNivel(n) {
  return `<span class="card-badge badge-${n}">${n}</span>`;
}
function dataFmt(d) {
  return d ? new Date(d).toLocaleString('pt-BR') : '—';
}
function showMsg(id, msg, tipo = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${tipo}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function fecharModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ── DENÚNCIAS ─────────────────────────────────────────────
async function carregarDenuncias() {
  const lista = document.getElementById('lista-denuncias');
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  const filtro = document.getElementById('filtro-status').value;
  try {
    const res = await authFetch('/api/denuncias');
    const dados = await res.json();
    const filtrados = filtro ? dados.filter(d => d.status === filtro) : dados;
    const pendentes = dados.filter(d => d.status === 'pendente').length;
    const badge = document.getElementById('badge-pendente');
    badge.textContent = pendentes || '';
    badge.style.display = pendentes ? 'inline' : 'none';

    if (!filtrados.length) {
      lista.innerHTML = '<div class="empty">Nenhuma denúncia encontrada.</div>';
      return;
    }
    lista.innerHTML = filtrados.map(d => `
      <div class="card-item">
        <div style="flex-shrink:0">${badgeStatus(d.status)}</div>
        <div class="card-info">
          <h4>Denúncia #${d.id} — ${badgeNivel(d.nivel_agua || 'medio')}</h4>
          <p>${d.descricao}</p>
          <small>
            👤 ${d.nome_denunciante || 'Anônimo'}
            ${d.telefone ? ` · 📞 ${d.telefone}` : ''}
            · 📅 ${dataFmt(d.criado_em)}
            ${d.adm_nome ? ` · ✅ Verificado por ${d.adm_nome}` : ''}
          </small>
        </div>
        <div class="card-actions">
          ${d.status === 'pendente' ? `
            <button class="btn-sm btn-sm-success" onclick="abrirModalVerificar(${d.id})">Verificar</button>
          ` : ''}
          ${d.foto_url ? `<button class="btn-sm btn-sm-info" onclick="verFoto('${d.foto_url}')">📷 Foto</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch {
    lista.innerHTML = '<div class="empty">Erro ao carregar denúncias.</div>';
  }
}

function verFoto(url) {
  window.open(url, '_blank');
}

function abrirModalVerificar(id) {
  authFetch('/api/denuncias').then(r => r.json()).then(dados => {
    const d = dados.find(x => x.id === id);
    if (!d) return;
    const conteudo = document.getElementById('modal-verificar-conteudo');
    conteudo.innerHTML = `
      ${d.foto_url ? `<img src="${d.foto_url}" class="modal-denuncia-foto" alt="Foto da ocorrência">` : ''}
      <div class="modal-denuncia-info">
        <div class="modal-denuncia-field"><label>Denunciante</label><span>${d.nome_denunciante || 'Anônimo'}</span></div>
        <div class="modal-denuncia-field"><label>Telefone</label><span>${d.telefone || '—'}</span></div>
        <div class="modal-denuncia-field"><label>Nível da água</label><span>${d.nivel_agua}</span></div>
        <div class="modal-denuncia-field"><label>Data</label><span>${dataFmt(d.criado_em)}</span></div>
        <div class="modal-denuncia-field" style="grid-column:1/-1"><label>Descrição</label><span>${d.descricao}</span></div>
        <div class="modal-denuncia-field"><label>Latitude</label><span>${d.latitude}</span></div>
        <div class="modal-denuncia-field"><label>Longitude</label><span>${d.longitude}</span></div>
      </div>
      <hr style="border-color:var(--border);margin:12px 0">
      <div style="margin-bottom:12px">
        <label style="font-size:0.82rem;color:var(--text-muted)">Decisão *</label>
        <select id="v-status" style="width:100%;margin-top:6px">
          <option value="aprovada">✅ Aprovar denúncia</option>
          <option value="rejeitada">❌ Rejeitar denúncia</option>
        </select>
      </div>
      <div id="campos-aprovacao">
        <div class="form-row" style="margin-bottom:10px">
          <div class="form-group">
            <label style="font-size:0.82rem;color:var(--text-muted)">Nome da área</label>
            <input type="text" id="v-nome" placeholder="Ex: Rua das Flores, Guamá" value="Alagamento #${d.id}">
          </div>
          <div class="form-group">
            <label style="font-size:0.82rem;color:var(--text-muted)">Bairro</label>
            <input type="text" id="v-bairro" placeholder="Bairro">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label style="font-size:0.82rem;color:var(--text-muted)">Nível de alagamento confirmado</label>
          <select id="v-nivel" style="margin-top:6px">
            <option value="baixo">Baixo</option>
            <option value="medio" ${d.nivel_agua==='medio'?'selected':''}>Médio</option>
            <option value="alto" ${d.nivel_agua==='alto'?'selected':''}>Alto</option>
            <option value="critico" ${d.nivel_agua==='critico'?'selected':''}>Crítico</option>
          </select>
        </div>
      </div>
      <div id="msg-verificar" class="alert hidden"></div>
      <button class="btn-submit" style="margin:0" onclick="confirmarVerificacao(${d.id})">Confirmar</button>
    `;

    document.getElementById('v-status').addEventListener('change', e => {
      document.getElementById('campos-aprovacao').style.display = e.target.value === 'aprovada' ? 'block' : 'none';
    });

    document.getElementById('modal-verificar').classList.remove('hidden');
  });
}

async function confirmarVerificacao(id) {
  const status = document.getElementById('v-status').value;
  const body = {
    status,
    nome_area: status === 'aprovada' ? document.getElementById('v-nome')?.value : undefined,
    bairro: status === 'aprovada' ? document.getElementById('v-bairro')?.value : undefined,
    nivel_alagamento: status === 'aprovada' ? document.getElementById('v-nivel')?.value : undefined
  };
  try {
    const res = await authFetch(`/api/denuncias/${id}/verificar`, { method: 'PATCH', body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro);
    fecharModal('modal-verificar');
    carregarDenuncias();
    if (status === 'aprovada') {
      document.querySelectorAll('.dash-nav-btn')[1].click();
    }
  } catch (err) {
    showMsg('msg-verificar', err.message, 'error');
  }
}

// ── ÁREAS APROVADAS ────────────────────────────────────────
async function carregarAprovadas() {
  const lista = document.getElementById('lista-aprovadas');
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  try {
    const res = await fetch('/api/areas-aprovadas');
    const dados = await res.json();
    if (!dados.length) {
      lista.innerHTML = '<div class="empty">Nenhuma área alagada confirmada.</div>';
      return;
    }
    lista.innerHTML = dados.map(a => `
      <div class="card-item">
        <div style="flex-shrink:0">${badgeNivel(a.nivel_alagamento)}</div>
        <div class="card-info">
          <h4>🌊 ${a.nome}</h4>
          <p>${a.descricao || '—'}</p>
          <small>
            ${a.bairro ? `📍 ${a.bairro} · ` : ''}
            Aprovado por ${a.adm_nome || '—'} · ${dataFmt(a.criado_em)}
            ${a.denuncia_id ? ` · Denúncia #${a.denuncia_id}` : ''}
          </small>
        </div>
        <div class="card-actions">
          <button class="btn-sm btn-sm-danger" onclick="desativarAprovada(${a.id})">Desativar</button>
        </div>
      </div>
    `).join('');
  } catch {
    lista.innerHTML = '<div class="empty">Erro ao carregar áreas.</div>';
  }
}

async function desativarAprovada(id) {
  if (!confirm('Desativar esta área alagada?')) return;
  await authFetch(`/api/areas-aprovadas/${id}/desativar`, { method: 'PATCH' });
  carregarAprovadas();
}

// ── ÁREAS DE RISCO ─────────────────────────────────────────
async function carregarRisco() {
  const lista = document.getElementById('lista-risco');
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  try {
    const res = await fetch('/api/areas-risco');
    const dados = await res.json();
    if (!dados.length) {
      lista.innerHTML = '<div class="empty">Nenhuma área de risco cadastrada.</div>';
      return;
    }
    lista.innerHTML = dados.map(a => `
      <div class="card-item">
        <div style="flex-shrink:0">${badgeNivel(a.nivel_risco)}</div>
        <div class="card-info">
          <h4>⚠️ ${a.nome}</h4>
          <p>${a.descricao || '—'}</p>
          <small>${a.bairro ? `📍 ${a.bairro} · ` : ''}Lat: ${a.latitude}, Lng: ${a.longitude} · ${dataFmt(a.criado_em)}</small>
        </div>
        <div class="card-actions">
          <button class="btn-sm btn-sm-danger" onclick="removerRisco(${a.id})">Remover</button>
        </div>
      </div>
    `).join('');
  } catch {
    lista.innerHTML = '<div class="empty">Erro ao carregar áreas de risco.</div>';
  }
}

async function removerRisco(id) {
  if (!confirm('Remover esta área de risco?')) return;
  await authFetch(`/api/areas-risco/${id}`, { method: 'DELETE' });
  carregarRisco();
}

let mapRisco = null;
function abrirModalRisco() {
  document.getElementById('modal-risco').classList.remove('hidden');
  setTimeout(() => {
    if (!mapRisco) {
      mapRisco = L.map('map-risco-modal').setView([-1.4558, -48.4902], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRisco);
      let mRisco = null;
      mapRisco.on('click', e => {
        document.getElementById('risco-lat').value = e.latlng.lat.toFixed(7);
        document.getElementById('risco-lng').value = e.latlng.lng.toFixed(7);
        if (mRisco) mRisco.remove();
        mRisco = L.marker([e.latlng.lat, e.latlng.lng]).addTo(mapRisco);
      });
    }
    mapRisco.invalidateSize();
  }, 200);
}

document.getElementById('form-risco').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    nome: document.getElementById('risco-nome').value,
    bairro: document.getElementById('risco-bairro').value,
    nivel_risco: document.getElementById('risco-nivel').value,
    descricao: document.getElementById('risco-descricao').value,
    latitude: document.getElementById('risco-lat').value,
    longitude: document.getElementById('risco-lng').value
  };
  try {
    const res = await authFetch('/api/areas-risco', { method: 'POST', body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro);
    fecharModal('modal-risco');
    document.getElementById('form-risco').reset();
    carregarRisco();
  } catch (err) {
    showMsg('msg-risco', err.message, 'error');
  }
});

// ── ADMINS ─────────────────────────────────────────────────
async function carregarAdmins() {
  const lista = document.getElementById('lista-admins');
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  try {
    const res = await authFetch('/api/adms');
    const dados = await res.json();
    lista.innerHTML = dados.map(a => `
      <div class="card-item">
        <div style="font-size:2rem;flex-shrink:0">👤</div>
        <div class="card-info">
          <h4>${a.nome}</h4>
          <p>${a.email}</p>
          <small>Cadastrado em ${dataFmt(a.criado_em)}</small>
        </div>
        <div class="card-actions">
          ${a.id !== adm.id ? `<button class="btn-sm btn-sm-danger" onclick="removerAdmin(${a.id})">Remover</button>` : '<span style="font-size:0.8rem;color:var(--text-muted)">Você</span>'}
        </div>
      </div>
    `).join('');
  } catch {
    lista.innerHTML = '<div class="empty">Erro ao carregar administradores.</div>';
  }
}

async function removerAdmin(id) {
  if (!confirm('Remover este administrador?')) return;
  await authFetch(`/api/adms/${id}`, { method: 'DELETE' });
  carregarAdmins();
}

function abrirModalAdmin() {
  document.getElementById('modal-admin').classList.remove('hidden');
}

document.getElementById('form-novo-admin').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    nome:  document.getElementById('new-adm-nome').value,
    email: document.getElementById('new-adm-email').value,
    senha: document.getElementById('new-adm-senha').value
  };
  try {
    const res = await authFetch('/api/adms', { method: 'POST', body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro);
    fecharModal('modal-admin');
    document.getElementById('form-novo-admin').reset();
    carregarAdmins();
  } catch (err) {
    showMsg('msg-novo-adm', err.message, 'error');
  }
});

carregarDenuncias();
