const mysql = require('mysql2');
require('dotenv').config(); // Puxa as informações do arquivo .env

// Cria a conexão com as variáveis do .env
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

// Testa a conexão
connection.connect((err) => {
    if (err) {
        console.error('Erro ao conectar no banco de dados:', err.message);
        console.log('Verifique se o MySQL está rodando e se a senha está correta no .env!');
        return;
    }
    console.log('Conectado ao banco de dados MySQL com sucesso! 🗄️');
});

module.exports = connection;