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
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');


// GET /api/siropes - Obtener todos los siropes
router.get('/', getSiropes);

// GET /api/siropes/:id - Obtener sirope por ID
router.get('/:id', getSiropeById);

// POST /api/siropes - Crear nuevo sirope (solo admin)
router.post('/', isAdmin, createSirope);

// PUT /api/siropes/:id - Actualizar sirope (solo admin)
router.put('/:id', isAdmin, updateSirope);

// DELETE /api/siropes/:id - Eliminar sirope (solo admin)
router.delete('/:id', isAdmin, deleteSirope);

router.post('/:id/ajustar-stock', isAdmin, ajustarStock);

module.exports = router;