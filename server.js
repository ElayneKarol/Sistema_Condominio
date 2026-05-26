require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // A mágica da criptografia entra aqui!

const app = express();
app.use(cors());
app.use(express.json()); 
app.use(express.static('public'));

// ==========================================
// CONEXÃO COM O BANCO DE DADOS
// ==========================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'UFrn#2007',
    database: 'condominio_db'
});

db.connect((err) => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err);
        return;
    }
    console.log('Conectado ao banco de dados MySQL com sucesso!');
});

// ==========================================
// ROTA DE CADASTRO (Criptografando a senha)
// ==========================================
app.post('/api/cadastrar', async (req, res) => {
    const { nome, email, cpf, telefone, endereco, senha } = req.body; 

    try {
        // O número 10 é o "custo" (nível de complexidade do embaralhamento)
        const senhaCriptografada = await bcrypt.hash(senha, 10); 

        const query = "INSERT INTO Usuario (nome, email, cpf, telefone, endereco, senha, perfil, status) VALUES (?, ?, ?, ?, ?, ?, 'MORADOR', 'PENDENTE')";
        
        // Salvamos a 'senhaCriptografada' em vez da 'senha' normal
        db.query(query, [nome, email, cpf, telefone, endereco, senhaCriptografada], (err, result) => {
            if (err) {
                // Se o erro for de e-mail duplicado, a gente avisa o frontend!
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ erro: 'Este e-mail já está cadastrado em nosso sistema.' });
                }
                
                // Se for outro erro qualquer
                console.error("Erro ao cadastrar:", err);
                return res.status(500).json({ erro: 'Erro interno ao criar conta.' });
            }
            res.json({ mensagem: 'Cadastro realizado com sucesso! Aguarde a aprovação do Síndico.' });
        });
    } catch (erro) {
        console.error("Erro na criptografia:", erro);
        res.status(500).json({ erro: 'Erro interno no servidor' });
    }
});

// ==========================================
// ROTA DE LOGIN (Comparando as senhas)
// ==========================================
app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;

    // Agora buscamos no banco APENAS pelo email
    db.query("SELECT * FROM Usuario WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro no servidor' });

        if (results.length > 0) {
            const usuario = results[0];

            // Compara a senha digitada com o "hash" (senha embaralhada) salva no banco
            const senhaValida = await bcrypt.compare(senha, usuario.senha);

            if (!senhaValida) {
                return res.status(401).json({ erro: 'Email ou senha inválidos' });
            }

            // Se a senha bater, verifica se está aprovado
            if (usuario.status === 'PENDENTE') {
                return res.status(403).json({ erro: 'Sua conta ainda está aguardando a aprovação da administração.' });
            }
            if (usuario.status === 'RECUSADO') {
                return res.status(403).json({ erro: 'Seu cadastro foi recusado pela administração.' });
            }

            // Deu tudo certo! Remove a senha do objeto antes de devolver pro frontend por segurança
            delete usuario.senha;
            res.json({ mensagem: 'Login realizado com sucesso', usuario: usuario });
        } else {
            res.status(401).json({ erro: 'Email ou senha inválidos' });
        }
    });
});

// ==========================================
// ROTAS DO PAINEL DO SÍNDICO (CORRIGIDO DEFINITIVO)
// ==========================================
app.get('/api/pendencias', (req, res) => {
    const queryUsuarios = "SELECT id, nome, email, endereco, perfil FROM Usuario WHERE status = 'PENDENTE'";
    
    // Restaurado r.area original que já funciona no seu banco
    const queryReservas = `
        SELECT r.id, u.nome, r.area, r.data_reserva, r.horario 
        FROM Reserva r 
        JOIN Usuario u ON r.usuario_id = u.id 
        WHERE r.status = 'PENDENTE'
    `;

    // Corrigido: u.endereco em vez de bloco/apartamento
    const queryAlteracoes = `
        SELECT sa.id, sa.usuario_id, sa.campo, sa.novo_valor, u.nome, u.endereco
        FROM SolicitacaoAlteracao sa
        JOIN Usuario u ON sa.usuario_id = u.id
        WHERE sa.status = 'PENDENTE'
    `;

    db.query(queryUsuarios, (err, usuarios) => {
        if (err) return res.status(500).json({ erro: 'Erro na tabela Usuários: ' + err.message });
        
        db.query(queryReservas, (err, reservas) => {
            if (err) return res.status(500).json({ erro: 'Erro na tabela Reservas: ' + err.message });
            
            db.query(queryAlteracoes, (err, alteracoes) => {
                if (err) return res.status(500).json({ erro: 'Erro na tabela Solicitações: ' + err.message });
                
                res.json({ 
                    usuariosPendentes: usuarios, 
                    reservasPendentes: reservas,
                    alteracoesPendentes: alteracoes || []
                });
            });
        });
    });
});

// APROVAR ALTERAÇÃO DE PERFIL DO MORADOR
app.put('/api/alteracoes/:id/aprovar', (req, res) => {
    const { id } = req.params;

    db.query("SELECT usuario_id, campo, novo_valor FROM SolicitacaoAlteracao WHERE id = ?", [id], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ erro: 'Solicitação não encontrada.' });
        
        const { usuario_id, campo, novo_valor } = results[0];
        const campoColuna = campo.toLowerCase(); 

        // Colunas reais presentes na sua tabela Usuario
        const colunasValidas = ['nome', 'email', 'telefone', 'endereco'];
        if (!colunasValidas.includes(campoColuna)) {
            return res.status(400).json({ erro: 'Campo inválido para alteração.' });
        }

        const queryAtualizarUsuario = `UPDATE Usuario SET ${campoColuna} = ? WHERE id = ?`;
        db.query(queryAtualizarUsuario, [novo_valor, usuario_id], (errUpdate) => {
            if (errUpdate) return res.status(500).json({ erro: 'Erro ao atualizar dados do morador.' });

            db.query("UPDATE SolicitacaoAlteracao SET status = 'APROVADA' WHERE id = ?", [id], (errStatus) => {
                if (errStatus) return res.status(500).json({ erro: 'Erro ao finalizar a pendência.' });
                res.json({ mensagem: 'Alteração aprovada e aplicada com sucesso!' });
            });
        });
    });
});

// RECUSAR ALTERAÇÃO DE PERFIL DO MORADOR
app.put('/api/alteracoes/:id/recusar', (req, res) => {
    const { id } = req.params;
    db.query("UPDATE SolicitacaoAlteracao SET status = 'RECUSADA' WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Solicitação de alteração rejeitada.' });
    });
});

// ==========================================
// TELA DE GERENCIAR USUÁRIOS (T5)
// ==========================================
app.get('/api/usuarios', (req, res) => {
    // A mágica da ordenação: PENDENTES primeiro, depois ATIVOS, depois INATIVOS e RECUSADOS.
    // Dentro de cada grupo, ordena por Nome alfabeticamente!
    const query = `
        SELECT id, nome, email, cpf, telefone, endereco, perfil, status 
        FROM Usuario 
        ORDER BY 
            FIELD(status, 'PENDENTE', 'ATIVO', 'INATIVO', 'RECUSADO'), 
            nome ASC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Erro ao buscar usuários:", err);
            return res.status(500).json({ erro: 'Erro ao buscar lista de usuários' });
        }
        res.json(results);
    });
});

// ==========================================
// GERENCIAR LOCAIS / ÁREAS COMUNS (T7)
// ==========================================

// LISTAR: Busca apenas locais que não foram excluídos (soft delete)
app.get('/api/areas', (req, res) => {
    db.query("SELECT * FROM Area WHERE status != 'INATIVO'", (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar locais' });
        res.json(results);
    });
});

// CADASTRAR: Cria um novo local
app.post('/api/areas', (req, res) => {
    const { nome, descricao, capacidade } = req.body;
    db.query("INSERT INTO Area (nome, descricao, capacidade) VALUES (?, ?, ?)", 
    [nome, descricao, capacidade], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao cadastrar local' });
        res.json({ mensagem: 'Local cadastrado com sucesso!' });
    });
});

// EDITAR: Atualiza os dados de um local existente
app.put('/api/areas/:id', (req, res) => {
    const { nome, descricao, capacidade, status } = req.body;
    const { id } = req.params;
    db.query("UPDATE Area SET nome = ?, descricao = ?, capacidade = ?, status = ? WHERE id = ?", 
    [nome, descricao, capacidade, status, id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao atualizar local' });
        res.json({ mensagem: 'Local atualizado!' });
    });
});

// DELETAR (SOFT DELETE): Apenas muda o status para 'INATIVO'
app.delete('/api/areas/:id', (req, res) => {
    const { id } = req.params;
    db.query("UPDATE Area SET status = 'INATIVO' WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao remover local' });
        res.json({ mensagem: 'Local removido com sucesso!' });
    });
});

// ==========================================
// RESERVAS (T8)
// ==========================================

// CADASTRAR NOVA RESERVA
app.post('/api/reservas', (req, res) => {
    const { usuario_id, area_id, data_reserva, horario } = req.body;
    db.query("INSERT INTO Reserva (usuario_id, area_id, data_reserva, horario) VALUES (?, ?, ?, ?)", 
    [usuario_id, area_id, data_reserva, horario], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao cadastrar reserva' });
        res.json({ mensagem: 'Reserva solicitada com sucesso!' });
    });
});

// LISTAR "MINHAS RESERVAS" (Busca as reservas de um usuário específico com o nome da área)
app.get('/api/reservas/usuario/:id', (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT r.id, r.data_reserva, r.horario, r.status, a.nome as area_nome 
        FROM Reserva r 
        JOIN Area a ON r.area_id = a.id 
        WHERE r.usuario_id = ?
        ORDER BY r.data_reserva DESC
    `;
    db.query(query, [id], (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar reservas' });
        res.json(results);
    });
});
// EDITAR DADOS DO USUÁRIO (Admin)
app.put('/api/usuarios/:id', (req, res) => {
    const { nome, email, telefone, endereco } = req.body;
    const { id } = req.params;
    
    const query = "UPDATE Usuario SET nome = ?, email = ?, telefone = ?, endereco = ? WHERE id = ?";
    db.query(query, [nome, email, telefone, endereco, id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao atualizar utilizador' });
        res.json({ mensagem: 'Utilizador atualizado com sucesso!' });
    });
});
// CANCELAR RESERVA (Pelo Morador)
app.put('/api/reservas/:id/cancelar', (req, res) => {
    const { id } = req.params;
    
    const query = "UPDATE Reserva SET status = 'CANCELADA' WHERE id = ?";
    db.query(query, [id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao cancelar a reserva' });
        res.json({ mensagem: 'Reserva cancelada com sucesso!' });
    });
});
// ==========================================
// ROTAS PARA AVISOS
// ==========================================

// 1. Listar todos os Avisos
app.get('/api/avisos', (req, res) => {
    const query = "SELECT * FROM Aviso ORDER BY data_criacao DESC";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar avisos' });
        res.json(results);
    });
});

// 2. Criar um novo Aviso
app.post('/api/avisos', (req, res) => {
    const { titulo, mensagem, tipo } = req.body;
    const query = "INSERT INTO Aviso (titulo, mensagem, tipo) VALUES (?, ?, ?)";
    db.query(query, [titulo, mensagem, tipo], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao criar aviso' });
        res.status(201).json({ mensagem: 'Aviso publicado com sucesso!' });
    });
});

// 3. Apagar um Aviso
app.delete('/api/avisos/:id', (req, res) => {
    const { id } = req.params;
    const query = "DELETE FROM Aviso WHERE id = ?";
    db.query(query, [id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao apagar aviso' });
        res.json({ mensagem: 'Aviso apagado com sucesso!' });
    });
});

// 1. BUSCAR DADOS DO PERFIL DO MORADOR
app.get('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const query = "SELECT id, nome, email, bloco, apartamento, telefone FROM Usuario WHERE id = ?";
    db.query(query, [id], (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar dados do perfil' });
        if (results.length === 0) return res.status(404).json({ erro: 'Utilizador não encontrado' });
        res.json(results[0]);
    });
});

// 2. ATUALIZAR DADOS DO PERFIL (Telefone e/ou Senha)
app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { telefone, senha } = req.body;
    
    let query = "UPDATE Usuario SET telefone = ? WHERE id = ?";
    let params = [telefone, id];

    // Se o morador digitou uma nova senha, atualiza a senha também
    if (senha && senha.trim() !== "") {
        query = "UPDATE Usuario SET telefone = ?, senha = ? WHERE id = ?";
        params = [telefone, senha, id];
    }

    db.query(query, params, (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao atualizar o perfil' });
        res.json({ mensagem: 'Perfil atualizado com sucesso!' });
    });
});

// 3. ENVIAR SOLICITAÇÃO DE ALTERAÇÃO DE DADOS AO SÍNDICO
app.post('/api/usuarios/:id/solicitar-alteracao', (req, res) => {
    const { id } = req.params;
    const { campo, novo_valor } = req.body;

    if (!novo_valor || novo_valor.trim() === "") {
        return res.status(400).json({ erro: 'O novo valor não pode estar vazio.' });
    }

    const query = "INSERT INTO SolicitacaoAlteracao (usuario_id, campo, novo_valor) VALUES (?, ?, ?)";
    db.query(query, [id, campo, novo_valor], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao enviar a solicitação.' });
        res.status(201).json({ mensagem: 'Solicitação enviada com sucesso ao síndico!' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando perfeitamente na porta ${PORT} 🚀`);
});