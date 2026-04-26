require('dotenv').config(); // Carrega as senhas do .env
const express = require('express');
const cors = require('cors');

// Importa as nossas rotas
const authRoutes = require('./routes/authRoutes');

const app = express();
app.use(cors());
app.use(express.json()); 
app.use(express.static('public'));

// Avisa o servidor para usar as rotas de autenticação a partir do caminho '/api'
app.use('/api', authRoutes);

// Rota de teste inicial
app.get('/', (req, res) => {
    res.send('Servidor do Condomínio rodando perfeitamente! 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});