const { Server } = require('socket.io');
const { verifyToken } = require('./jwt');

/**
 * Configurar Socket.IO para comunicación en tiempo real
 */
const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'https://front-m-helados.vercel.app',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Middleware de autenticación para sockets
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Token no proporcionado'));
      }

      const decoded = verifyToken(token);
      socket.user = decoded;
      next();
    } catch (error) {
      console.error('Error en autenticación de socket:', error.message);
      next(new Error('Autenticación fallida'));
    }
  });

  // Almacenar usuarios conectados
  const connectedUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`✅ Usuario conectado: ${socket.user.username} (${socket.user.rol}) - Socket ID: ${socket.id}`);
    
    // Agregar usuario a la lista de conectados
    connectedUsers.set(socket.user.id_usuario, {
      socketId: socket.id,
      username: socket.user.username,
      rol: socket.user.rol,
      connectedAt: new Date()
    });

    // Unir a sala según rol
    if (socket.user.rol === 'ADMINISTRADOR') {
      socket.join('admins');
      console.log(`👑 Admin ${socket.user.username} unido a sala 'admins'`);
    } else if (socket.user.rol === 'DESPENSADOR' || socket.user.rol === 'EMPLEADO') {
      socket.join('despensadores');
      console.log(`👨‍🍳 Despensador ${socket.user.username} unido a sala 'despensadores'`);
    }

    // Enviar lista de usuarios conectados
    io.emit('usuarios_conectados', Array.from(connectedUsers.values()));

    // ========================================
    // EVENTOS DE VENTAS
    // ========================================

    /**
     * Nueva venta creada - Notificar a despensadores
     */
    socket.on('nueva_venta', (data) => {
      console.log('📦 Nueva venta recibida:', data.numero_factura);
      
      // Emitir a todos los despensadores
      io.to('despensadores').emit('pedido_nuevo', {
        venta: data,
        mensaje: `Nueva orden: ${data.numero_factura}`,
        timestamp: new Date()
      });

      // También notificar a admins
      io.to('admins').emit('venta_registrada', data);
    });

    /**
     * Cambio de estado de pedido
     */
    socket.on('cambiar_estado_pedido', (data) => {
      console.log(`🔄 Cambio de estado: Venta ${data.id_venta} -> ${data.estado_venta}`);
      
      // Notificar a todos (admin y despensadores)
      io.emit('estado_pedido_actualizado', {
        id_venta: data.id_venta,
        estado_venta: data.estado_venta,
        actualizado_por: socket.user.username,
        timestamp: new Date()
      });
    });

    /**
     * Despensador acepta pedido
     */
    socket.on('aceptar_pedido', (data) => {
      console.log(`✅ Pedido ${data.id_venta} aceptado por ${socket.user.username}`);
      
      io.emit('pedido_aceptado', {
        id_venta: data.id_venta,
        despensador: socket.user.username,
        timestamp: new Date()
      });
    });

    /**
     * Pedido listo para entrega
     */
    socket.on('pedido_listo', (data) => {
      console.log(`🍦 Pedido ${data.id_venta} listo`);
      
      io.to('admins').emit('pedido_completado', {
        id_venta: data.id_venta,
        numero_factura: data.numero_factura,
        despensador: socket.user.username,
        timestamp: new Date()
      });
    });

    // ========================================
    // EVENTOS DE INVENTARIO
    // ========================================

    /**
     * Alerta de inventario bajo
     */
    socket.on('inventario_bajo', (data) => {
      console.log(`⚠️ Alerta de inventario bajo: ${data.nombre}`);
      
      io.to('admins').emit('alerta_inventario', {
        tipo: 'STOCK_BAJO',
        item: data,
        timestamp: new Date()
      });
    });

    /**
     * Actualización de stock
     */
    socket.on('actualizar_stock', (data) => {
      console.log(`📊 Stock actualizado: ${data.nombre}`);
      
      io.emit('stock_actualizado', {
        tipo: data.tipo, // 'topping' o 'materia_prima'
        id: data.id,
        nombre: data.nombre,
        stock_anterior: data.stock_anterior,
        stock_nuevo: data.stock_nuevo,
        timestamp: new Date()
      });
    });

    // ========================================
    // EVENTOS DE CAJA
    // ========================================

    /**
     * Caja abierta
     */
    socket.on('caja_abierta', (data) => {
      console.log('💰 Caja abierta');
      
      io.emit('notificacion_caja', {
        tipo: 'APERTURA',
        data,
        timestamp: new Date()
      });
    });

    /**
     * Caja cerrada
     */
    socket.on('caja_cerrada', (data) => {
      console.log('🔒 Caja cerrada');
      
      io.emit('notificacion_caja', {
        tipo: 'CIERRE',
        data,
        timestamp: new Date()
      });
    });

    // ========================================
    // EVENTOS DE NOTIFICACIONES GENERALES
    // ========================================

    /**
     * Mensaje de chat interno
     */
    socket.on('enviar_mensaje', (data) => {
      io.emit('mensaje_recibido', {
        de: socket.user.username,
        rol: socket.user.rol,
        mensaje: data.mensaje,
        timestamp: new Date()
      });
    });

    /**
     * Notificación general
     */
    socket.on('notificacion', (data) => {
      const targetRoom = data.solo_admins ? 'admins' : null;
      
      if (targetRoom) {
        io.to(targetRoom).emit('nueva_notificacion', {
          tipo: data.tipo,
          mensaje: data.mensaje,
          de: socket.user.username,
          timestamp: new Date()
        });
      } else {
        io.emit('nueva_notificacion', {
          tipo: data.tipo,
          mensaje: data.mensaje,
          de: socket.user.username,
          timestamp: new Date()
        });
      }
    });

    // ========================================
    // DESCONEXIÓN
    // ========================================

    socket.on('disconnect', () => {
      console.log(`❌ Usuario desconectado: ${socket.user.username} - Socket ID: ${socket.id}`);
      
      // Remover de usuarios conectados
      connectedUsers.delete(socket.user.id_usuario);
      
      // Notificar a todos
      io.emit('usuarios_conectados', Array.from(connectedUsers.values()));
    });

    // ========================================
    // MANEJO DE ERRORES
    // ========================================

    socket.on('error', (error) => {
      console.error('❌ Error en socket:', error);
      socket.emit('error_socket', {
        mensaje: 'Error en la conexión',
        detalle: error.message
      });
    });
  });

  console.log('🔌 Socket.IO configurado correctamente');
  
  return io;
};

module.exports = { setupSocket };