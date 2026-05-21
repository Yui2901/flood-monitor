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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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

async function initDB() {
  const schema = fs.readFileSync('./db/schema.sql', 'utf8');
  try {
    await pool.query(schema);
    console.log('Banco de dados inicializado com sucesso.');
  } catch (err) {
    console.error('Erro ao inicializar banco:', err.message);
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
    const { rows } = await pool.query('SELECT * FROM adms WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const adm = rows[0];
    const ok = await bcrypt.compare(senha, adm.senha_hash);
    if (!ok) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const token = jwt.sign({ id: adm.id, nome: adm.nome, email: adm.email }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, adm: { id: adm.id, nome: adm.nome, email: adm.email } });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── DENÚNCIAS ─────────────────────────────────────────────
app.get('/api/denuncias', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, a.nome as adm_nome FROM denuncias d
       LEFT JOIN adms a ON d.adm_id = a.id
       ORDER BY d.criado_em DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar denúncias' });
  }
});

app.get('/api/denuncias/publico', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, descricao, latitude, longitude, nivel_agua, status, criado_em
       FROM denuncias WHERE status = 'pendente' OR status = 'aprovada'
       ORDER BY criado_em DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar denúncias' });
  }
});

app.post('/api/denuncias', upload.single('foto'), async (req, res) => {
  const { nome_denunciante, telefone, descricao, latitude, longitude, nivel_agua } = req.body;
  if (!descricao || !latitude || !longitude) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  const foto_url = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO denuncias (nome_denunciante, telefone, descricao, latitude, longitude, foto_url, nivel_agua)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [nome_denunciante || 'Anônimo', telefone || null, descricao, latitude, longitude, foto_url, nivel_agua || 'medio']
    );
    res.status(201).json({ mensagem: 'Denúncia registrada com sucesso!', id: rows[0].id });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao registrar denúncia' });
  }
});

app.patch('/api/denuncias/:id/verificar', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, nome_area, bairro, nivel_alagamento } = req.body;
  if (!['aprovada','rejeitada'].includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  try {
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
    res.json({ mensagem: `Denúncia ${status} com sucesso!` });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar denúncia' });
  }
});

// ── ÁREAS APROVADAS ────────────────────────────────────────
app.get('/api/areas-aprovadas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT aa.*, a.nome as adm_nome FROM areas_aprovadas aa
       LEFT JOIN adms a ON aa.adm_id = a.id
       WHERE aa.ativa = TRUE ORDER BY aa.criado_em DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar áreas aprovadas' });
  }
});

app.patch('/api/areas-aprovadas/:id/desativar', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE areas_aprovadas SET ativa=FALSE WHERE id=$1', [req.params.id]);
    res.json({ mensagem: 'Área desativada com sucesso!' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao desativar área' });
  }
});

// ── ÁREAS DE RISCO ─────────────────────────────────────────
app.get('/api/areas-risco', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM areas_de_risco ORDER BY nivel_risco DESC, nome ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar áreas de risco' });
  }
});

app.post('/api/areas-risco', authMiddleware, async (req, res) => {
  const { nome, descricao, latitude, longitude, nivel_risco, bairro } = req.body;
  if (!nome || !latitude || !longitude) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO areas_de_risco (nome, descricao, latitude, longitude, nivel_risco, bairro)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nome, descricao || '', latitude, longitude, nivel_risco || 'medio', bairro || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao cadastrar área' });
  }
});

app.delete('/api/areas-risco/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM areas_de_risco WHERE id=$1', [req.params.id]);
    res.json({ mensagem: 'Área removida com sucesso!' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover área' });
  }
});

// ── ADMINS ─────────────────────────────────────────────────
app.get('/api/adms', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nome, email, criado_em FROM adms ORDER BY criado_em');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar administradores' });
  }
});

app.post('/api/adms', authMiddleware, async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await pool.query(
      'INSERT INTO adms (nome, email, senha_hash) VALUES ($1,$2,$3) RETURNING id, nome, email, criado_em',
      [nome, email, hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'Email já cadastrado' });
    res.status(500).json({ erro: 'Erro ao cadastrar administrador' });
  }
});

app.delete('/api/adms/:id', authMiddleware, async (req, res) => {
  if (parseInt(req.params.id) === req.adm.id) return res.status(400).json({ erro: 'Você não pode remover seu próprio usuário' });
  try {
    await pool.query('DELETE FROM adms WHERE id=$1', [req.params.id]);
    res.json({ mensagem: 'Administrador removido.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover administrador' });
  }
});

// ── ESTATÍSTICAS ───────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [d, ap, ar] = await Promise.all([
      pool.query('SELECT status, COUNT(*) as total FROM denuncias GROUP BY status'),
      pool.query('SELECT COUNT(*) as total FROM areas_aprovadas WHERE ativa=TRUE'),
      pool.query('SELECT nivel_risco, COUNT(*) as total FROM areas_de_risco GROUP BY nivel_risco')
    ]);
    res.json({ denuncias: d.rows, areas_aprovadas: ap.rows[0], areas_risco: ar.rows });
  } catch (err) {
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
