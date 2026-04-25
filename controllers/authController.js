// Importa o arquivo de conexão com o banco de dados
const db = require('../config/db');

// --- FUNÇÃO DE CADASTRAR ---
const cadastrar = (req, res) => {
    // 1. Pegamos os dados com os nomes corretos que vêm do Thunder Client
    const { nome, email, senha, cpf, telefone, endereco, perfil } = req.body;

    console.log(`Recebido pedido de cadastro para: ${nome}`);

    // 2. A query SQL agora usa os nomes exatos das colunas da tabela Usuario
    const query = `INSERT INTO Usuario (nome, email, senha, cpf, telefone, endereco, perfil) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

    // 3. Enviamos os dados na mesma ordem
    db.query(query, [nome, email, senha, cpf, telefone, endereco, perfil], (err, results) => {
        if (err) {
            console.error('Erro ao cadastrar no banco:', err);
            return res.status(500).json({ erro: 'Erro ao cadastrar usuário', detalhes: err.message });
        }
        
        res.status(201).json({ 
            mensagem: 'Usuário cadastrado com sucesso no banco de dados!',
            idUsuario: results.insertId
        });
    });
};

// --- FUNÇÃO DE LOGIN (Mocada por enquanto) ---
const login = (req, res) => {
    const { email, senha } = req.body;
    res.json({ sucesso: true, mensagem: "Rota de login acessada!", email });
};

// Exporta as duas funções
module.exports = { cadastrar, login };