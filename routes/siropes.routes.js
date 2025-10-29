const express = require('express');
const router = express.Router();
const { 
  getSiropes, 
  getSiropeById, 
  createSirope, 
  updateSirope, 
  deleteSirope,
  ajustarStock 
} = require('../controllers/siropesController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// GET /api/siropes - Obtener todos los siropes
router.get('/', getSiropes);

// GET /api/siropes/:id - Obtener sirope por ID
router.get('/:id', getSiropeById);

// POST /api/siropes - Crear nuevo sirope (solo admin)
router.post('/', requireAdmin, createSirope);

// PUT /api/siropes/:id - Actualizar sirope (solo admin)
router.put('/:id', requireAdmin, updateSirope);

// DELETE /api/siropes/:id - Eliminar sirope (solo admin)
router.delete('/:id', requireAdmin, deleteSirope);

// POST /api/siropes/:id/ajustar-stock - Ajustar stock (solo admin)
router.post('/:id/ajustar-stock', requireAdmin, ajustarStock);

module.exports = router;