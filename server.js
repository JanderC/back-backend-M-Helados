const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Importar configuraciones
const { testConnection } = require('./config/database');
const { setupSocket } = require('./config/socket');

// Importar middlewares
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const productosRoutes = require('./routes/productos.routes');
const toppingsRoutes = require('./routes/toppings.routes');
const ventasRoutes = require('./routes/ventas.routes');
const cajaRoutes = require('./routes/caja.routes');
const reportesRoutes = require('./routes/reportes.routes');
const monedasRoutes = require('./routes/monedas.routes');

// ============================================
// INICIALIZACIÓN DE EXPRESS
// ============================================
const app = express();
const server = http.createServer(app);

// ============================================
// CONFIGURACIÓN DE SOCKET.IO
// ============================================
const io = setupSocket(server);

// Hacer io accesible en las rutas
app.set('io', io);

// ============================================
// MIDDLEWARES GLOBALES
// ============================================

// Seguridad
app.use(helmet({
  contentSecurityPolicy: false, // Ajustar según necesidades
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://front-m-helados.vercel.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compresión
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Servir archivos estáticos (imágenes de productos)
app.use('/uploads', express.static('uploads'));

// ============================================
// RUTAS DE LA API
// ============================================

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🍦 API M Helados funcionando correctamente',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      productos: '/api/productos',
      toppings: '/api/toppings',
      ventas: '/api/ventas',
      caja: '/api/caja',
      reportes: '/api/reportes',
      monedas: '/api/monedas'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/toppings', toppingsRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/monedas', monedasRoutes);

// ============================================
// MANEJO DE ERRORES
// ============================================

// Ruta no encontrada
app.use(notFound);

// Manejador de errores general
app.use(errorHandler);

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Verificar conexión a base de datos
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ No se pudo conectar a la base de datos');
      process.exit(1);
    }

    // Iniciar servidor
    server.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('🍦 SERVIDOR M HELADOS INICIADO');
      console.log('='.repeat(50));
      console.log(`🚀 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📡 Socket.IO escuchando en http://localhost:${PORT}`);
      console.log(`🗄️  Base de datos: ${process.env.DB_NAME}`);
      console.log('='.repeat(50) + '\n');
      console.log('📋 Rutas disponibles:');
      console.log('   → GET  /');
      console.log('   → GET  /health');
      console.log('   → POST /api/auth/login');
      console.log('   → GET  /api/auth/verify');
      console.log('   → PUT  /api/auth/change-password');
      console.log('   → GET  /api/productos');
      console.log('   → GET  /api/toppings');
      console.log('   → POST /api/ventas');
      console.log('   → GET  /api/caja/estado');
      console.log('   → GET  /api/reportes/dashboard');
      console.log('   → GET  /api/monedas/tasas');
      console.log('='.repeat(50) + '\n');
    });

  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  server.close(() => process.exit(1));
});

// Manejo de señal de terminación
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM recibido. Cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

// Iniciar el servidor
startServer();

module.exports = { app, server, io };