const mysql = require('mysql2');

const pool = mysql.createPool({
    host:            process.env.DB_HOST     || 'localhost',
    user:            process.env.DB_USER,
    password:        process.env.DB_PASSWORD || '',
    database:        process.env.DB_DATABASE || 'reconocimiento',
    connectionLimit: Math.max(1, parseInt(process.env.DB_CONN_LIMIT, 10) || 10),
    waitForConnections: true,
    queueLimit: 0
}).promise();

// Verificar la conexión al iniciar
pool.getConnection()
    .then(connection => {
        console.log('✔ Conexión exitosa a la base de datos');
        connection.release();
    })
    .catch(err => {
        console.error('✘ Error al conectar a la base de datos:', err.message);
    });

module.exports = pool;
