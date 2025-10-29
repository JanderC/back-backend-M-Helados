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

router.post('/', isAdmin, createSirope);

router.put('/:id', isAdmin, updateSirope);

router.delete('/:id', isAdmin, deleteSirope);

router.post('/:id/ajustar-stock', isAdmin, ajustarStock);

module.exports = router;