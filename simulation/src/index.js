import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000/api/gps';



app.listen(PORT, () => {
    console.log(`\nSimulation Controller running on port ${PORT}`);
    console.log(`Press Ctrl+C to stop the stream\n`);
});

