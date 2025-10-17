const express = require('express');
const router = express.Router();
const { login, verifyUser, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @route   POST /api/auth/login
 * @desc    Login de usuario
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   GET /api/auth/verify
 * @desc    Verificar token y obtener datos de usuario
 * @access  Private
 */
router.get('/verify', authenticate, verifyUser);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Cambiar contraseña del usuario
 * @access  Private
 */
router.put('/change-password', authenticate, changePassword);

module.exports = router;