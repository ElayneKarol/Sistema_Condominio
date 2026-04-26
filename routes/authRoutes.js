const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Linha 6 - Provavelmente o erro está aqui
router.post('/cadastrar', authController.cadastrar);

// Rota de Login
router.post('/login', authController.login);

// Rota de Recuperar Senha
router.put('/recuperar-senha', authController.recuperarSenha);

module.exports = router;