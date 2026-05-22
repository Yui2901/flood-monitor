-- Tabela de administradores
CREATE TABLE IF NOT EXISTS adms (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de áreas de risco
CREATE TABLE IF NOT EXISTS areas_de_risco (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  nivel_risco VARCHAR(20) DEFAULT 'medio' CHECK (nivel_risco IN ('baixo','medio','alto','critico')),
  bairro VARCHAR(100),
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de denúncias
CREATE TABLE IF NOT EXISTS denuncias (
  id SERIAL PRIMARY KEY,
  nome_denunciante VARCHAR(100),
  telefone VARCHAR(20),
  descricao TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  foto_url VARCHAR(500),
  nivel_agua VARCHAR(20) DEFAULT 'baixo' CHECK (nivel_agua IN ('baixo','medio','alto','critico')),
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada')),
  adm_id INTEGER REFERENCES adms(id),
  criado_em TIMESTAMP DEFAULT NOW(),
  verificado_em TIMESTAMP
);

-- Tabela de áreas aprovadas (alagadas confirmadas)
CREATE TABLE IF NOT EXISTS areas_aprovadas (
  id SERIAL PRIMARY KEY,
  denuncia_id INTEGER REFERENCES denuncias(id),
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  nivel_alagamento VARCHAR(20) DEFAULT 'medio' CHECK (nivel_alagamento IN ('baixo','medio','alto','critico')),
  bairro VARCHAR(100),
  ativa BOOLEAN DEFAULT TRUE,
  adm_id INTEGER REFERENCES adms(id),
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Admin padrão (senha: admin123)
INSERT INTO adms (nome, email, senha_hash) 
VALUES ('Administrador', 'admin@belem.pa.gov.br', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (email) DO NOTHING;

-- Áreas de risco pré-cadastradas em Belém
INSERT INTO areas_de_risco (nome, descricao, latitude, longitude, nivel_risco, bairro) VALUES
('Baixada do Jurunas', 'Região historicamente afetada por alagamentos', -1.4700, -48.4850, 'critico', 'Jurunas'),
('Av. Almirante Barroso', 'Alagamentos frequentes em períodos chuvosos', -1.4550, -48.4780, 'alto', 'Marco'),
('Passagem São Jorge', 'Área de risco em chuvas intensas', -1.4620, -48.4920, 'alto', 'Guamá'),
('Rua dos Mundurucus', 'Baixada com histórico de alagamentos', -1.4680, -48.4960, 'medio', 'Umarizal'),
('Canal do Tucunduba', 'Transbordamento em épocas de chuva', -1.4810, -48.4700, 'critico', 'Guamá'),
('Av. Perimetral', 'Pontos de alagamento recorrentes', -1.4480, -48.4640, 'medio', 'Sacramenta'),
('Baixada de Campina', 'Área central com risco de alagamento', -1.4530, -48.5010, 'alto', 'Campina'),
('Conjunto Satélite', 'Região periférica com problemas de drenagem', -1.4230, -48.4560, 'medio', 'Satélite')
ON CONFLICT DO NOTHING;
