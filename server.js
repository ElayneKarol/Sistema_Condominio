require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');

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
        const senhaCriptografada = await bcrypt.hash(senha, 10); 

        const query = "INSERT INTO usuario (nome, email, cpf, telefone, endereco, senha, perfil, status) VALUES (?, ?, ?, ?, ?, ?, 'MORADOR', 'PENDENTE')";
        
        db.query(query, [nome, email, cpf, telefone, endereco, senhaCriptografada], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ erro: 'Este e-mail já está cadastrado em nosso sistema.' });
                }
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

    db.query("SELECT * FROM usuario WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro no servidor' });

        if (results.length > 0) {
            const usuario = results[0];
            const senhaValida = await bcrypt.compare(senha, usuario.senha);

            if (!senhaValida) {
                return res.status(401).json({ erro: 'Email ou senha inválidos' });
            }

            if (usuario.status === 'PENDENTE') {
                return res.status(403).json({ erro: 'Sua conta ainda está aguardando a aprovação da administração.' });
            }
            if (usuario.status === 'RECUSADO') {
                return res.status(403).json({ erro: 'Seu cadastro foi recusado pela administração.' });
            }

            delete usuario.senha;
            res.json({ mensagem: 'Login realizado com sucesso', usuario: usuario });
        } else {
            res.status(401).json({ erro: 'Email ou senha inválidos' });
        }
    });
});

// ==========================================
// ROTAS DO PAINEL DO SÍNDICO (CENTRAL DE PENDÊNCIAS)
// ==========================================
app.get('/api/pendencias', (req, res) => {
    const queryUsuarios = "SELECT id, nome, email, endereco, perfil FROM usuario WHERE status = 'PENDENTE'";
    
    // CORRIGIDO: Nome da tabela alterado de r_reserva para reserva
    const queryReservas = `
        SELECT r.id, u.nome, a.nome AS area, r.data_reserva, r.horario 
        FROM reserva r 
        JOIN usuario u ON r.usuario_id = u.id 
        JOIN area a ON r.area_id = a.id
        WHERE r.status = 'PENDENTE'
    `;

    const queryAlteracoes = `
        SELECT sa.id, sa.usuario_id, sa.campo, sa.novo_valor, u.nome, u.endereco
        FROM SolicitacaoAlteracao sa
        JOIN usuario u ON sa.usuario_id = u.id
        WHERE sa.status = 'PENDENTE'
    `;

    db.query(queryUsuarios, (err, usuarios) => {
        if (err) return res.status(500).json({ erro: 'Erro usuários: ' + err.message });
        
        db.query(queryReservas, (err, reservas) => {
            if (err) return res.status(500).json({ erro: 'Erro reservas: ' + err.message });
            
            db.query(queryAlteracoes, (err, alteracoes) => {
                if (err) {
                    console.log("Aviso: Tabela SolicitacaoAlteracao não encontrada.");
                    return res.json({ usuariosPendentes: usuarios, reservasPendentes: reservas, alteracoesPendentes: [] });
                }
                
                res.json({ 
                    usuariosPendentes: usuarios, 
                    reservasPendentes: reservas,
                    alteracoesPendentes: alteracoes
                });
            });
        });
    });
});

// ALTERAR STATUS DO MORADOR (ACEITAR/RECUSAR)
app.put('/api/usuarios/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body; 

    console.log(`[Painel Admin] Atualizando usuário ID ${id} para status: ${status}`);
    
    if (!['ATIVO', 'RECUSADO', 'INATIVO'].includes(status)) {
        return res.status(400).json({ erro: 'Status de usuário inválido.' });
    }

    const query = "UPDATE usuario SET status = ? WHERE id = ?";
    
    db.query(query, [status, id], (err, result) => {
        if (err) {
            console.error("❌ Erro ao atualizar status do usuário:", err.message);
            return res.status(500).json({ erro: "Erro interno no banco de dados: " + err.message });
        }
        return res.json({ mensagem: `Status do morador atualizado para ${status} com sucesso!` });
    });
});

// APROVAR ALTERAÇÃO DE PERFIL
app.put('/api/alteracoes/:id/aprovar', (req, res) => {
    const { id } = req.params;
    db.query("SELECT usuario_id, campo, novo_valor FROM SolicitacaoAlteracao WHERE id = ?", [id], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ erro: 'Solicitação não encontrada.' });
        
        const { usuario_id, campo, novo_valor } = results[0];
        const campoColuna = campo.toLowerCase(); 

        db.query(`UPDATE usuario SET ${campoColuna} = ? WHERE id = ?`, [novo_valor, usuario_id], (errUpdate) => {
            if (errUpdate) return res.status(500).json({ erro: 'Erro ao atualizar dados.' });

            db.query("UPDATE SolicitacaoAlteracao SET status = 'APROVADA' WHERE id = ?", [id], (errStatus) => {
                if (errStatus) return res.status(500).json({ erro: 'Erro ao finalizar pendência.' });
                res.json({ mensagem: 'Aprovado!' });
            });
        });
    });
});

// RECUSAR ALTERAÇÃO DE PERFIL
app.put('/api/alteracoes/:id/recusar', (req, res) => {
    const { id } = req.params;
    db.query("UPDATE SolicitacaoAlteracao SET status = 'RECUSADA' WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Recusado.' });
    });
});

// ==========================================
// TELA DE GERENCIAR USUÁRIOS / PERFIL
// ==========================================

// LISTAR TODOS OS USUÁRIOS (Ordenado por Status e Nome)
app.get('/api/usuarios', (req, res) => {
    const query = `
        SELECT id, nome, email, cpf, telefone, endereco, perfil, status 
        FROM usuario 
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

// BUSCAR DADOS DO PERFIL DE UM MORADOR ESPECÍFICO
app.get('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const query = "SELECT id, nome, email, endereco, telefone FROM usuario WHERE id = ?";
    db.query(query, [id], (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar dados do perfil' });
        if (results.length === 0) return res.status(404).json({ erro: 'Utilizador não encontrado' });
        res.json(results[0]);
    });
});

// ATUALIZAR DADOS DO USUÁRIO
app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { nome, email, telefone, endereco, senha } = req.body;
    
    if (senha && senha.trim() !== "") {
        bcrypt.hash(senha, 10, (errHash, senhaCriptografada) => {
            if (errHash) return res.status(500).json({ erro: 'Erro ao processar nova senha.' });
            
            const query = "UPDATE usuario SET nome = COALESCE(?, nome), email = COALESCE(?, email), telefone = ?, endereco = COALESCE(?, endereco), senha = ? WHERE id = ?";
            db.query(query, [nome, email, telefone, endereco, senhaCriptografada, id], (err) => {
                if (err) return res.status(500).json({ erro: 'Erro ao atualizar dados e senha.' });
                res.json({ mensagem: 'Perfil e senha atualizados com sucesso!' });
            });
        });
    } else {
        const query = "UPDATE usuario SET nome = COALESCE(?, nome), email = COALESCE(?, email), telefone = ?, endereco = COALESCE(?, endereco) WHERE id = ?";
        db.query(query, [nome, email, telefone, endereco, id], (err) => {
            if (err) return res.status(500).json({ erro: 'Erro ao atualizar dados do usuário.' });
            res.json({ mensagem: 'Dados updated com sucesso!' });
        });
    }
});

// ENVIAR SOLICITAÇÃO DE ALTERAÇÃO DE DADOS AO SÍNDICO
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

// ==========================================
// GERENCIAR LOCAIS / ÁREAS COMUNS (Ordem Alfabética)
// ==========================================

// LISTAR: Busca apenas locais ativos em Ordem Alfabética
app.get('/api/areas', (req, res) => {
    db.query("SELECT * FROM area WHERE status != 'INATIVO' ORDER BY nome ASC", (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar áreas: ' + err.message });
        res.json(results);
    });
});

// CADASTRAR: Cria um novo local (CORRIGIDO: alterado capacity para capacidade)
app.post('/api/areas', (req, res) => {
    const { nome, descricao, capacidade } = req.body;
    db.query("INSERT INTO area (nome, descricao, capacidade) VALUES (?, ?, ?)", 
    [nome, descricao, capacidade], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao cadastrar local' });
        res.json({ mensagem: 'Local cadastrado com sucesso!' });
    });
});

// EDITAR: Atualiza os dados de um local existente
app.put('/api/areas/:id', (req, res) => {
    const { nome, descricao, capacidade, status } = req.body;
    const { id } = req.params;
    db.query("UPDATE area SET nome = ?, descricao = ?, capacidade = ?, status = ? WHERE id = ?", 
    [nome, descricao, capacidade, status, id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao atualizar local' });
        res.json({ mensagem: 'Local atualizado!' });
    });
});

// DELETAR (SOFT DELETE): Muda o status para 'INATIVO'
app.delete('/api/areas/:id', (req, res) => {
    const { id } = req.params;
    db.query("UPDATE area SET status = 'INATIVO' WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao remover local' });
        res.json({ mensagem: 'Local removido com sucesso!' });
    });
});

// ==========================================
// RESERVAS (Regras de negócio unificadas)
// ==========================================

// CADASTRAR/SOLICITAR NOVA RESERVA
app.post('/api/reservas', (req, res) => {
    const { usuario_id, area_id, data_reserva, horario } = req.body;

    if (!usuario_id || !area_id || !data_reserva || !horario) {
        return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
    }

    const hoje = new Date().toISOString().split('T')[0];
    if (data_reserva < hoje) {
        return res.status(400).json({ erro: 'Não é possível realizar uma reserva para um dia que já passou.' });
    }

    const queryVerificar = `
        SELECT * FROM reserva 
        WHERE area_id = ? AND data_reserva = ? AND horario = ? AND status != 'RECUSADA'
    `;
    
    db.query(queryVerificar, [area_id, data_reserva, horario], (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao verificar disponibilidade.' });

        if (results.length > 0) {
            return res.status(400).json({ erro: 'Este local já está reservado ou aguardando aprovação para este dia e horário!' });
        }

        const queryInserir = "INSERT INTO reserva (usuario_id, area_id, data_reserva, horario, status) VALUES (?, ?, ?, ?, 'PENDENTE')";
        db.query(queryInserir, [usuario_id, area_id, data_reserva, horario], (errInsert) => {
            if (errInsert) return res.status(500).json({ erro: 'Erro ao registrar solicitação de reserva.' });
            res.status(201).json({ mensagem: 'Reserva solicitada com sucesso! Aguarde a aprovação.' });
        });
    });
});

// LISTAR "MINHAS RESERVAS" (Para a visão do Morador)
app.get('/api/reservas/usuario/:id', (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT r.id, r.data_reserva, r.horario, r.status, a.nome as area_nome 
        FROM reserva r 
        JOIN area a ON r.area_id = a.id 
        WHERE r.usuario_id = ?
        ORDER BY r.data_reserva DESC
    `;
    db.query(query, [id], (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar reservas' });
        res.json(results);
    });
});

// CANCELAR RESERVA (Pelo Morador)
app.put('/api/reservas/:id/cancelar', (req, res) => {
    const { id } = req.params;
    const query = "UPDATE reserva SET status = 'CANCELADA' WHERE id = ?";
    db.query(query, [id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao cancelar a reserva' });
        res.json({ mensagem: 'Reserva cancelada com sucesso!' });
    });
});

// SÍNDICO: Listar Todas as Reservas (Histórico Geral/Cronograma)
app.get('/api/admin/reservas-geral', (req, res) => {
    const query = `
        SELECT r.id, u.nome AS morador, u.endereco, a.nome AS area, r.data_reserva, r.horario, r.status
        FROM reserva r
        JOIN usuario u ON r.usuario_id = u.id
        JOIN area a ON r.area_id = a.id
        ORDER BY r.data_reserva DESC, r.horario ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar listagem geral de reservas.' });
        res.json(results);
    });
});

// SÍNDICO: APROVAR OU RECUSAR UMA RESERVA
app.put('/api/reservas/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body; 

    if (!['APROVADA', 'RECUSADA'].includes(status)) {
        return res.status(400).json({ erro: 'Status inválido.' });
    }

    if (status === 'APROVADA') {
        db.query("SELECT area_id, data_reserva, horario FROM reserva WHERE id = ?", [id], (err, results) => {
            if (err || results.length === 0) return res.status(500).json({ erro: 'Reserva não encontrada.' });
            
            const { area_id, data_reserva, horario } = results[0];

            const queryConflito = `
                SELECT * FROM reserva 
                WHERE area_id = ? AND data_reserva = ? AND horario = ? AND status = 'APROVADA' AND id != ?
            `;
            
            db.query(queryConflito, [area_id, data_reserva, horario, id], (errConflito, conflitos) => {
                if (errConflito) return res.status(500).json({ erro: 'Erro ao validar conflitos no banco.' });

                if (conflitos.length > 0) {
                    return res.status(400).json({ erro: 'Não é possível aprovar! Já existe uma reserva APROVADA para este mesmo local, data e horário.' });
                }

                executarAtualizacaoStatus(id, status, res);
            });
        });
    } else {
        executarAtualizacaoStatus(id, status, res);
    }
});

function executarAtualizacaoStatus(id, status, res) {
    const queryUpdate = "UPDATE reserva SET status = ? WHERE id = ?";
    db.query(queryUpdate, [status, id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao atualizar o status no banco de dados.' });
        res.json({ mensagem: `Reserva concluída como ${status} com sucesso!` });
    });
}

// ==========================================
// ROTAS PARA AVISOS
// ==========================================

// 1. Listar todos os Avisos
app.get('/api/avisos', (req, res) => {
    const query = "SELECT * FROM aviso ORDER BY data_criacao DESC";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar avisos' });
        res.json(results);
    });
});

// 2. Criar um novo Aviso
app.post('/api/avisos', (req, res) => {
    const { titulo, mensagem, tipo } = req.body;
    const query = "INSERT INTO aviso (titulo, mensagem, tipo) VALUES (?, ?, ?)";
    db.query(query, [titulo, mensagem, tipo], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao criar aviso' });
        res.status(201).json({ mensagem: 'Aviso publicado com sucesso!' });
    });
});

// 3. Apagar um Aviso
app.delete('/api/avisos/:id', (req, res) => {
    const { id } = req.params;
    const query = "DELETE FROM aviso WHERE id = ?";
    db.query(query, [id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao apagar aviso' });
        res.json({ mensagem: 'Aviso apagado com sucesso!' });
    });
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando perfeitamente na porta ${PORT} 🚀`);
});