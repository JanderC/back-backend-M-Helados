const { query } = require('../config/database');

/**
 * Configurar eventos de pedidos en Socket.io
 */
const setupPedidosSocket = (io) => {
  
  // Namespace para pedidos
  const pedidosNamespace = io.of('/pedidos');

  pedidosNamespace.on('connection', (socket) => {
    console.log(`👨‍🍳 Usuario conectado a pedidos: ${socket.username} (${socket.userRole})`);

    // Unir a sala según rol
    if (socket.userRole === 'DESPENSADOR') {
      socket.join('despensadores');
      console.log(`✅ Despensador ${socket.username} unido a sala`);
      
      // Enviar pedidos pendientes al conectarse
      enviarPedidosPendientes(socket);
    }

    if (socket.userRole === 'ADMINISTRADOR') {
      socket.join('administradores');
      console.log(`✅ Admin ${socket.username} unido a sala`);
    }

    /**
     * Evento: Solicitar pedidos pendientes
     */
    socket.on('solicitar_pedidos_pendientes', async () => {
      try {
        const pedidos = await obtenerPedidosPendientes();
        socket.emit('pedidos_pendientes', pedidos);
      } catch (error) {
        console.error('Error al solicitar pedidos:', error);
        socket.emit('error', { message: 'Error al cargar pedidos' });
      }
    });

    /**
     * Evento: Tomar pedido (Despensador)
     */
    socket.on('tomar_pedido', async (data) => {
      try {
        const { id_venta } = data;

        // Cambiar estado a EN_PROCESO
        await query(
          'UPDATE ventas SET estado_venta = $1 WHERE id_venta = $2',
          ['EN_PROCESO', id_venta]
        );

        // Notificar a todos
        pedidosNamespace.emit('pedido_tomado', {
          id_venta,
          despensador: socket.username,
          timestamp: new Date()
        });

        console.log(`📋 Pedido #${id_venta} tomado por ${socket.username}`);

      } catch (error) {
        console.error('Error al tomar pedido:', error);
        socket.emit('error', { message: 'Error al tomar pedido' });
      }
    });

    /**
     * Evento: Completar pedido
     */
    socket.on('completar_pedido', async (data) => {
      try {
        const { id_venta } = data;

        await query(
          'UPDATE ventas SET estado_venta = $1 WHERE id_venta = $2',
          ['COMPLETADA', id_venta]
        );

        // Notificar a todos
        pedidosNamespace.emit('pedido_completado', {
          id_venta,
          despensador: socket.username,
          timestamp: new Date()
        });

        console.log(`✅ Pedido #${id_venta} completado por ${socket.username}`);

      } catch (error) {
        console.error('Error al completar pedido:', error);
        socket.emit('error', { message: 'Error al completar pedido' });
      }
    });

    /**
     * Evento: Cancelar pedido
     */
    socket.on('cancelar_pedido', async (data) => {
      try {
        const { id_venta, motivo } = data;

        await query(
          'UPDATE ventas SET estado_venta = $1, notas = $2 WHERE id_venta = $3',
          ['CANCELADA', motivo, id_venta]
        );

        // Notificar a todos
        pedidosNamespace.emit('pedido_cancelado', {
          id_venta,
          motivo,
          usuario: socket.username,
          timestamp: new Date()
        });

        console.log(`❌ Pedido #${id_venta} cancelado por ${socket.username}`);

      } catch (error) {
        console.error('Error al cancelar pedido:', error);
        socket.emit('error', { message: 'Error al cancelar pedido' });
      }
    });

    /**
     * Evento: Notificar al despensador (Admin)
     */
    socket.on('notificar_despensador', (data) => {
      pedidosNamespace.to('despensadores').emit('nueva_notificacion', {
        mensaje: data.mensaje,
        tipo: data.tipo || 'info',
        timestamp: new Date()
      });
    });

    /**
     * Evento: Despensador está preparando
     */
    socket.on('preparando_pedido', (data) => {
      pedidosNamespace.emit('estado_preparacion', {
        id_venta: data.id_venta,
        despensador: socket.username,
        progreso: data.progreso || 0
      });
    });

    // Desconexión
    socket.on('disconnect', () => {
      console.log(`🔌 Desconectado de pedidos: ${socket.username}`);
    });
  });

  return pedidosNamespace;
};

/**
 * Enviar pedidos pendientes al conectarse
 */
const enviarPedidosPendientes = async (socket) => {
  try {
    const pedidos = await obtenerPedidosPendientes();
    socket.emit('pedidos_pendientes', pedidos);
  } catch (error) {
    console.error('Error al enviar pedidos pendientes:', error);
  }
};

/**
 * Obtener pedidos pendientes o en proceso
 */
const obtenerPedidosPendientes = async () => {
  try {
    const result = await query(
      `SELECT v.*, u.nombre_completo as vendedor, tm.codigo_moneda
       FROM ventas v
       JOIN usuarios u ON v.id_usuario = u.id_usuario
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.estado_venta IN ('PENDIENTE', 'EN_PROCESO')
       ORDER BY v.fecha_venta DESC`
    );

    // Obtener detalles de cada pedido
    for (const venta of result.rows) {
      const detallesResult = await query(
        `SELECT dv.*, p.nombre_producto
         FROM detalle_ventas dv
         JOIN productos p ON dv.id_producto = p.id_producto
         WHERE dv.id_venta = $1`,
        [venta.id_venta]
      );

      venta.detalles = detallesResult.rows;

      // Obtener toppings de cada detalle
      for (const detalle of venta.detalles) {
        const toppingsResult = await query(
          `SELECT dvt.*, t.nombre_topping
           FROM detalle_ventas_toppings dvt
           JOIN toppings t ON dvt.id_topping = t.id_topping
           WHERE dvt.id_detalle_venta = $1`,
          [detalle.id_detalle_venta]
        );
        detalle.toppings = toppingsResult.rows;
      }
    }

    return result.rows;

  } catch (error) {
    console.error('Error al obtener pedidos pendientes:', error);
    throw error;
  }
};

/**
 * Emitir nuevo pedido a despensadores
 */
const emitirNuevoPedido = (io, pedido) => {
  const pedidosNamespace = io.of('/pedidos');
  pedidosNamespace.to('despensadores').emit('nuevo_pedido', pedido);
  
  // También emitir sonido de alerta
  pedidosNamespace.to('despensadores').emit('alerta_sonido', {
    tipo: 'nuevo_pedido'
  });
};

module.exports = {
  setupPedidosSocket,
  emitirNuevoPedido,
  obtenerPedidosPendientes
};  