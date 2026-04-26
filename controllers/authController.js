// Importa o arquivo de conexão com o banco de dados
const db = require('../config/db');

// --- FUNÇÃO DE CADASTRAR ---
const cadastrar = (req, res) => {
    const { nome, email, senha, cpf, telefone, endereco, perfil } = req.body;

    console.log(`Recebido pedido de cadastro para: ${nome}`);

    const query = `INSERT INTO Usuario (nome, email, senha, cpf, telefone, endereco, perfil) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

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

// --- FUNÇÃO DE LOGIN ---
const login = (req, res) => {
    const { email, senha } = req.body;

    console.log(`Tentativa de login para: ${email}`);

    const query = 'SELECT * FROM Usuario WHERE email = ?';

    db.query(query, [email], (err, results) => {
        if (err) {
            console.error('Erro no banco:', err);
            return res.status(500).json({ erro: 'Erro interno no servidor' });
        }

        if (results.length === 0) {
            return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
        }

        const usuario = results[0];

        if (senha !== usuario.senha) {
            return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
        }

        res.json({
            mensagem: 'Login realizado com sucesso!',
            usuario: {
                id: usuario.idUsuario,
                nome: usuario.nome,
                perfil: usuario.perfil
            }
        });
    });
}; // Fechamento correto da função login

// --- FUNÇÃO DE RECUPERAR SENHA ---
const recuperarSenha = (req, res) => {
    const { email, novaSenha } = req.body;

    const checkQuery = 'SELECT * FROM Usuario WHERE email = ?';
    db.query(checkQuery, [email], (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro no banco' });
        if (results.length === 0) return res.status(404).json({ erro: 'E-mail não encontrado' });

        const updateQuery = 'UPDATE Usuario SET senha = ? WHERE email = ?';
        db.query(updateQuery, [novaSenha, email], (updateErr, updateResults) => {
            if (updateErr) return res.status(500).json({ erro: 'Erro ao atualizar' });
            
            res.json({ mensagem: 'Senha alterada com sucesso!' });
        });
    });
}; // Fechamento correto da função recuperarSenha

module.exports = { 
    login, 
    cadastrar, 
    recuperarSenha 
};