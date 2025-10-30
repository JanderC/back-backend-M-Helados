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

router.get('/:id', getSiropeById);

router.post('/', authenticate, isAdmin, createSirope);

router.put('/:id',authenticate, isAdmin, updateSirope);

router.delete('/:id',authenticate, isAdmin, deleteSirope);

router.post('/:id/ajustar-stock',authenticate, isAdmin, ajustarStock);

module.exports = router;