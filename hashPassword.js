const bcrypt = require('bcryptjs'); // Cambia 'bcrypt' por 'bcryptjs'

const hashPassword = async () => {
  const password = 'admin123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log('Password hasheada:', hash);
  console.log('\nAhora ejecuta este SQL:');
  console.log(`UPDATE usuarios SET password = '${hash}' WHERE username = 'admin';`);
};

hashPassword();