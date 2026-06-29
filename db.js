const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'sistema_facturacion',    
    waitForConnections: true,
    connectionLimit: Math.max(1, parseInt(process.env.DB_CONN_LIMIT, 10) || 10),
    queueLimit: 0
});

// Convertir pool a promesas
const promisePool = pool.promise();

module.exports = promisePool;
