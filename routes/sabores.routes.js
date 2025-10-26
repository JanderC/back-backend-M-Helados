const express = require('express');
const router = express.Router();
const {
  getSabores,
  getSaborById,
  createSabor,
  updateSabor,
  deleteSabor
} = require('../controllers/saboresController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /api/sabores
 * @desc    Listar sabores
 * @access  Private
 */
router.get('/', authenticate, getSabores);

/**
 * @route   GET /api/sabores/:id
 * @desc    Obtener sabor por ID
 * @access  Private
 */
router.get('/:id', authenticate, getSaborById);

/**
 * @route   POST /api/sabores
 * @desc    Crear sabor
 * @access  Private (Admin)
 */
router.post('/', authenticate, isAdmin, createSabor);

/**
 * @route   PUT /api/sabores/:id
 * @desc    Actualizar sabor
 * @access  Private (Admin)
 */
router.put('/:id', authenticate, isAdmin, updateSabor);

/**
 * @route   DELETE /api/sabores/:id
 * @desc    Eliminar sabor
 * @access  Private (Admin)
 */
router.delete('/:id', authenticate, isAdmin, deleteSabor);

module.exports = router;