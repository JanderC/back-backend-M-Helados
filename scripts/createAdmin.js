const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
require('dotenv').config();

/**
 * Script para crear usuario administrador
 * Ejecutar: node scripts/createAdmin.js
 */

const createAdminUser = async () => {
  try {
    console.log('🔧 Creando usuario administrador...\n');

    // Datos del admin
    const username = 'admin';
    const password = 'admin123'; // CAMBIAR EN PRODUCCIÓN
    const nombre_completo = 'Administrador Sistema';
    const email = 'admin@mhelados.com';

    // Verificar si ya existe
    const existingUser = await query(
      'SELECT * FROM usuarios WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      console.log('⚠️  Usuario administrador ya existe');
      console.log('Username:', existingUser.rows[0].username);
      console.log('Email:', existingUser.rows[0].email);
      process.exit(0);
    }

    // Obtener rol de administrador
    const roleResult = await query(
      "SELECT id_rol FROM roles WHERE nombre_rol = 'ADMINISTRADOR'"
    );

    if (roleResult.rows.length === 0) {
      console.error('❌ Rol ADMINISTRADOR no encontrado en la base de datos');
      console.log('💡 Asegúrate de ejecutar el script SQL de la base de datos primero');
      process.exit(1);
    }

    const idRol = roleResult.rows[0].id_rol;

    // Hash de contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Crear usuario
    const result = await query(
      `INSERT INTO usuarios 
       (nombre_completo, username, password_hash, email, id_rol, activo)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id_usuario, username, nombre_completo, email`,
      [nombre_completo, username, passwordHash, email, idRol]
    );

    console.log('✅ Usuario administrador creado exitosamente!\n');
    console.log('📋 Detalles:');
    console.log('─'.repeat(40));
    console.log('ID:', result.rows[0].id_usuario);
    console.log('Nombre:', result.rows[0].nombre_completo);
    console.log('Username:', result.rows[0].username);
    console.log('Email:', result.rows[0].email);
    console.log('Password:', password);
    console.log('─'.repeat(40));
    console.log('\n⚠️  IMPORTANTE: Cambia la contraseña después del primer login\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error al crear usuario administrador:', error);
    process.exit(1);
  }
};

// Ejecutar script
createAdminUser();