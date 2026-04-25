const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Rota para cadastrar um novo usuário (POST)
router.post('/cadastrar', authController.cadastrar);

// Rota para fazer login (POST)
router.post('/login', authController.login);

module.exports = router;