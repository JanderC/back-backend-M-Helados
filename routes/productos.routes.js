const express = require('express');
const router = express.Router();
const {
  getProductos,
  getProductoById,
  createProducto,
  updateProducto,
  deleteProducto,
  getCategorias
} = require('../controllers/productosController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /api/productos
 * @desc    Listar productos
 * @access  Private
 */
router.get('/', authenticate, getProductos);

/**
 * @route   GET /api/productos/categorias
 * @desc    Listar categorías
 * @access  Private
 * @note    Esta ruta debe ir ANTES de /:id para evitar conflictos
 */
router.get('/categorias', authenticate, getCategorias);

/**
 * @route   GET /api/productos/:id
 * @desc    Obtener producto por ID
 * @access  Private
 */
router.get('/:id', authenticate, getProductoById);

/**
 * @route   POST /api/productos
 * @desc    Crear producto
 * @access  Private (Admin)
 */
router.post('/', authenticate, isAdmin, createProducto);

/**
 * @route   PUT /api/productos/:id
 * @desc    Actualizar producto
 * @access  Private (Admin)
 */
router.put('/:id', authenticate, isAdmin, updateProducto);

/**
 * @route   DELETE /api/productos/:id
 * @desc    Eliminar producto
 * @access  Private (Admin)
 */
router.delete('/:id', authenticate, isAdmin, deleteProducto);

module.exports = router;