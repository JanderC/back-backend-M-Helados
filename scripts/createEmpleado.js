const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'display2024';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  
  console.log('=================================');
  console.log('Password:', password);
  console.log('Hash generado:', hash);
  console.log('=================================');
  console.log('\nEjecuta este SQL:');
  console.log(`
UPDATE usuarios 
SET password_hash = '${hash}' 
WHERE username = 'display';
  `);
  console.log('=================================');
}

generateHash();