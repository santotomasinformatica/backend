const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuración de Railway MySQL usando variables de entorno
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
};

const pool = mysql.createPool(dbConfig);

// Wrapper para manejar errores de base de datos
const safeDbQuery = async (queryFn, fallbackValue = []) => {
    try {
        return await queryFn();
    } catch (error) {
        console.error('💥 Database Error:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sql: error.sql
        });
        return fallbackValue;
    }
};

module.exports = {
    dbConfig,
    pool,
    safeDbQuery
};