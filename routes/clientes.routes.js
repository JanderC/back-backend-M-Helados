const express = require('express');
const router = express.Router();
const {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente
} = require('../controllers/clientesController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /api/clientes
 * @desc    Listar clientes
 * @access  Private
 */
router.get('/', authenticate, getClientes);

/**
 * @route   GET /api/clientes/:id
 * @desc    Obtener cliente por ID
 * @access  Private
 */
router.get('/:id', authenticate, getClienteById);

/**
 * @route   POST /api/clientes
 * @desc    Crear cliente
 * @access  Private
 */
router.post('/', authenticate, createCliente);

/**
 * @route   PUT /api/clientes/:id
 * @desc    Actualizar cliente
 * @access  Private (Admin)
 */
router.put('/:id', authenticate, isAdmin, updateCliente);

/**
 * @route   DELETE /api/clientes/:id
 * @desc    Eliminar cliente
 * @access  Private (Admin)
 */
router.delete('/:id', authenticate, isAdmin, deleteCliente);

module.exports = router;