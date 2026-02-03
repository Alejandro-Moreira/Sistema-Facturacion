const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1752717932m',
    database: process.env.DB_DATABASE || 'reconocimiento',    
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Convertir pool a promesas
const promisePool = pool.promise();

module.exports = promisePool; 