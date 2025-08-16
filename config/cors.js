const corsConfig = {
    origin: [
        'https://abeja-mu.vercel.app',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080'
    ],
    credentials: true
};

module.exports = corsConfig;