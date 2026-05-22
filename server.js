const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'belem_alagamentos_secret_2024';
const DB_FILE = path.join(__dirname, 'db', 'store.json');
const usePostgres = Boolean(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let store = null;

function getNextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}

function getDefaultStore() {
  return {
    adms: [
      {
        id: 1,
        nome: 'Administrador',
        email: 'admin@belem.pa.gov.br',
        senha_hash: bcrypt.hashSync('admin123', 10),
        criado_em: new Date().toISOString()
      }
    ],
    areas_de_risco: [
      { id: 1, nome: 'Baixada do Jurunas', descricao: 'Região historicamente afetada por alagamentos', latitude: -1.47, longitude: -48.485, nivel_risco: 'critico', bairro: 'Jurunas', criado_em: new Date().toISOString() },
      { id: 2, nome: 'Av. Almirante Barroso', descricao: 'Alagamentos frequentes em períodos chuvosos', latitude: -1.455, longitude: -48.478, nivel_risco: 'alto', bairro: 'Marco', criado_em: new Date().toISOString() },
      { id: 3, nome: 'Passagem São Jorge', descricao: 'Área de risco em chuvas intensas', latitude: -1.462, longitude: -48.492, nivel_risco: 'alto', bairro: 'Guamá', criado_em: new Date().toISOString() },
      { id: 4, nome: 'Rua dos Mundurucus', descricao: 'Baixada com histórico de alagamentos', latitude: -1.468, longitude: -48.496, nivel_risco: 'medio', bairro: 'Umarizal', criado_em: new Date().toISOString() },
      { id: 5, nome: 'Canal do Tucunduba', descricao: 'Transbordamento em épocas de chuva', latitude: -1.481, longitude: -48.47, nivel_risco: 'critico', bairro: 'Guamá', criado_em: new Date().toISOString() },
      { id: 6, nome: 'Av. Perimetral', descricao: 'Pontos de alagamento recorrentes', latitude: -1.448, longitude: -48.464, nivel_risco: 'medio', bairro: 'Sacramenta', criado_em: new Date().toISOString() },
      { id: 7, nome: 'Baixada de Campina', descricao: 'Área central com risco de alagamento', latitude: -1.453, longitude: -48.501, nivel_risco: 'alto', bairro: 'Campina', criado_em: new Date().toISOString() },
      { id: 8, nome: 'Conjunto Satélite', descricao: 'Região periférica com problemas de drenagem', latitude: -1.423, longitude: -48.456, nivel_risco: 'medio', bairro: 'Satélite', criado_em: new Date().toISOString() }
    ],
    denuncias: [],
    areas_aprovadas: []
  };
}

function loadStore() {
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Erro ao carregar store local:', err);
    return null;
  }
}

function saveStore() {
  if (!store) return;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
}

function ensureStore() {
  const defaultStore = getDefaultStore();
  if (!fs.existsSync(DB_FILE)) {
    store = defaultStore;
    saveStore();
    return;
  }

  const existing = loadStore();
  if (!existing) {
    store = defaultStore;
    saveStore();
    return;
  }

  store = {
    adms: Array.isArray(existing.adms) ? existing.adms : defaultStore.adms,
    areas_de_risco: Array.isArray(existing.areas_de_risco) ? existing.areas_de_risco : defaultStore.areas_de_risco,
    denuncias: Array.isArray(existing.denuncias) ? existing.denuncias : [],
    areas_aprovadas: Array.isArray(existing.areas_aprovadas) ? existing.areas_aprovadas : []
  };
  saveStore();
}

async function initDB() {
  if (usePostgres) {
    const schema = fs.readFileSync('./db/schema.sql', 'utf8');
    try {
      await pool.query(schema);
      console.log('Banco de dados inicializado com sucesso.');
    } catch (err) {
      console.error('Erro ao inicializar banco:', err);
    }
  } else {
    try {
      ensureStore();
      console.log('Banco de dados local inicializado com sucesso.');
    } catch (err) {
      console.error('Erro ao inicializar o banco local:', err);
    }
  }
}

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adm = decoded;
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

// ── AUTH ──────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Email e senha obrigatórios' });
  try {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT * FROM adms WHERE email = $1', [email]);
      if (!rows.length) return res.status(401).json({ erro: 'Credenciais inválidas' });
      const adm = rows[0];
      const ok = await bcrypt.compare(senha, adm.senha_hash);
      if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas' });
      const token = jwt.sign({ id: adm.id, nome: adm.nome, email: adm.email }, JWT_SECRET, { expiresIn: '8h' });
      return res.json({ token, adm: { id: adm.id, nome: adm.nome, email: adm.email } });
    }

    const adm = store.adms.find(a => a.email === email);
    if (!adm) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const ok = await bcrypt.compare(senha, adm.senha_hash);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const token = jwt.sign({ id: adm.id, nome: adm.nome, email: adm.email }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, adm: { id: adm.id, nome: adm.nome, email: adm.email } });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── DENÚNCIAS ─────────────────────────────────────────────
app.get('/api/denuncias', authMiddleware, async (req, res) => {
  try {
    if (usePostgres) {
      const { rows } = await pool.query(
        `SELECT d.*, a.nome as adm_nome FROM denuncias d
         LEFT JOIN adms a ON d.adm_id = a.id
         ORDER BY d.criado_em DESC`
      );
      return res.json(rows);
    }

    const dados = store.denuncias
      .slice()
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
      .map(d => ({
        ...d,
        adm_nome: d.adm_id ? store.adms.find(a => a.id === d.adm_id)?.nome : null
      }));
    res.json(dados);
  } catch (err) {
    console.error('Erro ao buscar denúncias:', err);
    res.status(500).json({ erro: 'Erro ao buscar denúncias' });
  }
});

app.get('/api/denuncias/publico', async (req, res) => {
  try {
    if (usePostgres) {
      const { rows } = await pool.query(
        `SELECT id, descricao, latitude, longitude, nivel_agua, status, criado_em
         FROM denuncias WHERE status = 'pendente' OR status = 'aprovada'
         ORDER BY criado_em DESC LIMIT 50`
      );
      return res.json(rows);
    }

    const dados = store.denuncias
      .filter(d => ['pendente', 'aprovada'].includes(d.status))
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
      .slice(0, 50)
      .map(({ id, descricao, latitude, longitude, nivel_agua, status, criado_em }) => ({
        id,
        descricao,
        latitude,
        longitude,
        nivel_agua,
        status,
        criado_em
      }));
    res.json(dados);
  } catch (err) {
    console.error('Erro ao buscar denúncias público:', err);
    res.status(500).json({ erro: 'Erro ao buscar denúncias' });
  }
});

app.post('/api/denuncias', upload.single('foto'), async (req, res) => {
  const { nome_denunciante, telefone, descricao, latitude, longitude, nivel_agua } = req.body;
  if (!descricao || !latitude || !longitude) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  const foto_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    if (usePostgres) {
      const { rows } = await pool.query(
        `INSERT INTO denuncias (nome_denunciante, telefone, descricao, latitude, longitude, foto_url, nivel_agua)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [nome_denunciante || 'Anônimo', telefone || null, descricao, latitude, longitude, foto_url, nivel_agua || 'medio']
      );
      return res.status(201).json({ mensagem: 'Denúncia registrada com sucesso!', id: rows[0].id });
    }

    const id = getNextId(store.denuncias);
    const now = new Date().toISOString();
    store.denuncias.push({
      id,
      nome_denunciante: nome_denunciante || 'Anônimo',
      telefone: telefone || null,
      descricao,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      foto_url,
      nivel_agua: nivel_agua || 'medio',
      status: 'pendente',
      adm_id: null,
      criado_em: now,
      verificado_em: null
    });
    saveStore();
    res.status(201).json({ mensagem: 'Denúncia registrada com sucesso!', id });
  } catch (err) {
    console.error('Erro ao registrar denúncia:', err);
    res.status(500).json({ erro: 'Erro ao registrar denúncia' });
  }
});

app.patch('/api/denuncias/:id/verificar', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, nome_area, bairro, nivel_alagamento } = req.body;
  if (!['aprovada', 'rejeitada'].includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  try {
    if (usePostgres) {
      await pool.query(
        `UPDATE denuncias SET status=$1, adm_id=$2, verificado_em=NOW() WHERE id=$3`,
        [status, req.adm.id, id]
      );
      if (status === 'aprovada') {
        const { rows } = await pool.query('SELECT * FROM denuncias WHERE id=$1', [id]);
        const d = rows[0];
        await pool.query(
          `INSERT INTO areas_aprovadas (denuncia_id, nome, descricao, latitude, longitude, nivel_alagamento, bairro, adm_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [d.id, nome_area || `Alagamento #${d.id}`, d.descricao, d.latitude, d.longitude, nivel_alagamento || d.nivel_agua, bairro || '', req.adm.id]
        );
      }
      return res.json({ mensagem: `Denúncia ${status} com sucesso!` });
    }

    const denuncia = store.denuncias.find(d => d.id === parseInt(id));
    if (!denuncia) return res.status(404).json({ erro: 'Denúncia não encontrada' });
    denuncia.status = status;
    denuncia.adm_id = req.adm.id;
    denuncia.verificado_em = new Date().toISOString();

    if (status === 'aprovada') {
      const areaId = getNextId(store.areas_aprovadas);
      store.areas_aprovadas.push({
        id: areaId,
        denuncia_id: denuncia.id,
        nome: nome_area || `Alagamento #${denuncia.id}`,
        descricao: denuncia.descricao,
        latitude: denuncia.latitude,
        longitude: denuncia.longitude,
        nivel_alagamento: nivel_alagamento || denuncia.nivel_agua,
        bairro: bairro || '',
        ativa: true,
        adm_id: req.adm.id,
        criado_em: new Date().toISOString()
      });
    }

    saveStore();
    res.json({ mensagem: `Denúncia ${status} com sucesso!` });
  } catch (err) {
    console.error('Erro ao verificar denúncia:', err);
    res.status(500).json({ erro: 'Erro ao verificar denúncia' });
  }
});

// ── ÁREAS APROVADAS ────────────────────────────────────────
app.get('/api/areas-aprovadas', async (req, res) => {
  try {
    if (usePostgres) {
      const { rows } = await pool.query(
        `SELECT aa.*, a.nome as adm_nome FROM areas_aprovadas aa
         LEFT JOIN adms a ON aa.adm_id = a.id
         WHERE aa.ativa = TRUE ORDER BY aa.criado_em DESC`
      );
      return res.json(rows);
    }

    const dados = store.areas_aprovadas
      .filter(a => a.ativa)
      .slice()
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
      .map(a => ({
        ...a,
        adm_nome: a.adm_id ? store.adms.find(adm => adm.id === a.adm_id)?.nome : null
      }));
    res.json(dados);
  } catch (err) {
    console.error('Erro ao buscar áreas aprovadas:', err);
    res.status(500).json({ erro: 'Erro ao buscar áreas aprovadas' });
  }
});

app.patch('/api/areas-aprovadas/:id/desativar', authMiddleware, async (req, res) => {
  try {
    if (usePostgres) {
      await pool.query('UPDATE areas_aprovadas SET ativa=FALSE WHERE id=$1', [req.params.id]);
      return res.json({ mensagem: 'Área desativada com sucesso!' });
    }

    const area = store.areas_aprovadas.find(a => a.id === parseInt(req.params.id));
    if (!area) return res.status(404).json({ erro: 'Área não encontrada' });
    area.ativa = false;
    saveStore();
    res.json({ mensagem: 'Área desativada com sucesso!' });
  } catch (err) {
    console.error('Erro ao desativar área:', err);
    res.status(500).json({ erro: 'Erro ao desativar área' });
  }
});

// ── ÁREAS DE RISCO ─────────────────────────────────────────
app.get('/api/areas-risco', async (req, res) => {
  try {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT * FROM areas_de_risco ORDER BY nivel_risco DESC, nome ASC');
      return res.json(rows);
    }
    const dados = store.areas_de_risco
      .slice()
      .sort((a, b) => b.nivel_risco.localeCompare(a.nivel_risco) || a.nome.localeCompare(b.nome));
    res.json(dados);
  } catch (err) {
    console.error('Erro ao buscar áreas de risco:', err);
    res.status(500).json({ erro: 'Erro ao buscar áreas de risco' });
  }
});

app.post('/api/areas-risco', authMiddleware, async (req, res) => {
  const { nome, descricao, latitude, longitude, nivel_risco, bairro } = req.body;
  if (!nome || !latitude || !longitude) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  try {
    if (usePostgres) {
      const { rows } = await pool.query(
        `INSERT INTO areas_de_risco (nome, descricao, latitude, longitude, nivel_risco, bairro)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [nome, descricao || '', latitude, longitude, nivel_risco || 'medio', bairro || '']
      );
      return res.status(201).json(rows[0]);
    }
    const id = getNextId(store.areas_de_risco);
    const novo = {
      id,
      nome,
      descricao: descricao || '',
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      nivel_risco: nivel_risco || 'medio',
      bairro: bairro || '',
      criado_em: new Date().toISOString()
    };
    store.areas_de_risco.push(novo);
    saveStore();
    res.status(201).json(novo);
  } catch (err) {
    console.error('Erro ao cadastrar área:', err);
    res.status(500).json({ erro: 'Erro ao cadastrar área' });
  }
});

app.delete('/api/areas-risco/:id', authMiddleware, async (req, res) => {
  try {
    if (usePostgres) {
      await pool.query('DELETE FROM areas_de_risco WHERE id=$1', [req.params.id]);
      return res.json({ mensagem: 'Área removida com sucesso!' });
    }
    const index = store.areas_de_risco.findIndex(a => a.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ erro: 'Área não encontrada' });
    store.areas_de_risco.splice(index, 1);
    saveStore();
    res.json({ mensagem: 'Área removida com sucesso!' });
  } catch (err) {
    console.error('Erro ao remover área:', err);
    res.status(500).json({ erro: 'Erro ao remover área' });
  }
});

// ── ADMINS ─────────────────────────────────────────────────
app.get('/api/adms', authMiddleware, async (req, res) => {
  try {
    if (usePostgres) {
      const { rows } = await pool.query('SELECT id, nome, email, criado_em FROM adms ORDER BY criado_em');
      return res.json(rows);
    }
    const dados = store.adms.slice().sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    res.json(dados);
  } catch (err) {
    console.error('Erro ao buscar administradores:', err);
    res.status(500).json({ erro: 'Erro ao buscar administradores' });
  }
});

app.post('/api/adms', authMiddleware, async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    if (usePostgres) {
      const { rows } = await pool.query(
        'INSERT INTO adms (nome, email, senha_hash) VALUES ($1,$2,$3) RETURNING id, nome, email, criado_em',
        [nome, email, hash]
      );
      return res.status(201).json(rows[0]);
    }
    if (store.adms.some(a => a.email === email)) return res.status(409).json({ erro: 'Email já cadastrado' });
    const id = getNextId(store.adms);
    const novo = { id, nome, email, senha_hash: hash, criado_em: new Date().toISOString() };
    store.adms.push(novo);
    saveStore();
    res.status(201).json({ id: novo.id, nome: novo.nome, email: novo.email, criado_em: novo.criado_em });
  } catch (err) {
    console.error('Erro ao cadastrar administrador:', err);
    res.status(500).json({ erro: 'Erro ao cadastrar administrador' });
  }
});

app.delete('/api/adms/:id', authMiddleware, async (req, res) => {
  if (parseInt(req.params.id) === req.adm.id) return res.status(400).json({ erro: 'Você não pode remover seu próprio usuário' });
  try {
    if (usePostgres) {
      await pool.query('DELETE FROM adms WHERE id=$1', [req.params.id]);
      return res.json({ mensagem: 'Administrador removido.' });
    }
    const index = store.adms.findIndex(a => a.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ erro: 'Administrador não encontrado' });
    store.adms.splice(index, 1);
    saveStore();
    res.json({ mensagem: 'Administrador removido.' });
  } catch (err) {
    console.error('Erro ao remover administrador:', err);
    res.status(500).json({ erro: 'Erro ao remover administrador' });
  }
});

// ── ESTATÍSTICAS ───────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    if (usePostgres) {
      const [d, ap, ar] = await Promise.all([
        pool.query('SELECT status, COUNT(*) as total FROM denuncias GROUP BY status'),
        pool.query('SELECT COUNT(*) as total FROM areas_aprovadas WHERE ativa=TRUE'),
        pool.query('SELECT nivel_risco, COUNT(*) as total FROM areas_de_risco GROUP BY nivel_risco')
      ]);
      return res.json({ denuncias: d.rows, areas_aprovadas: ap.rows[0], areas_risco: ar.rows });
    }
    const denuncias = store.denuncias.reduce((acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    }, {});
    const areas_risco = store.areas_de_risco.reduce((acc, a) => {
      const item = acc.find(x => x.nivel_risco === a.nivel_risco);
      if (item) item.total += 1;
      else acc.push({ nivel_risco: a.nivel_risco, total: 1 });
      return acc;
    }, []);
    res.json({
      denuncias: Object.entries(denuncias).map(([status, total]) => ({ status, total })),
      areas_aprovadas: { total: store.areas_aprovadas.filter(a => a.ativa).length },
      areas_risco
    });
  } catch (err) {
    console.error('Erro ao buscar estatísticas:', err);
    res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});
