import 'dotenv/config';

const ajustes = {
  NODE_ENV: 'test',
  JWT_SECRET: 'clave_secreta_de_pruebas_para_el_servidor_de_login',
  JWT_EXPIRES_IN: '15m',
  JWT_ISSUER: 'microservicio-login'
};

for (const [clave, valor] of Object.entries(ajustes)) {
  process.env[clave] = valor;
}
