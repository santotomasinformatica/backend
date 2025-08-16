// Middleware de logging mejorado
const loggingMiddleware = (req, res, next) => {
    console.log(`\n🔄 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.method === 'POST' || req.method === 'PUT') {
        console.log('📝 Body:', JSON.stringify(req.body, null, 2));
    }
    if (Object.keys(req.query).length > 0) {
        console.log('🔍 Query:', JSON.stringify(req.query, null, 2));
    }
    next();
};

// Middleware de manejo de errores
const errorHandler = (err, req, res, next) => {
    console.error('💥 Error no manejado:', err);
    console.error('Stack trace:', err.stack);
    console.error('Request details:', {
        method: req.method,
        url: req.url,
        body: req.body,
        params: req.params,
        query: req.query
    });
    
    res.status(500).json({ 
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? {
            message: err.message,
            stack: err.stack
        } : {}
    });
};

// Middleware para rutas no encontradas
const notFoundHandler = (req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
};

module.exports = {
    loggingMiddleware,
    errorHandler,
    notFoundHandler
};