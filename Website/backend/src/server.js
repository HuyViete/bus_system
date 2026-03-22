import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectToDB } from "./libs/db.js";

import authRoute from "./routes/authRoute.js";
import busRoute  from "./routes/busRoute.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:4173"],  // Vite dev + preview
    credentials: true,
}));
app.use(express.json());

// Public routes
app.use("/api/auth", authRoute);

// Bus data (proxy from Big Server) — no auth required for map view
app.use("/api/buses", busRoute);

connectToDB().then(() => {
    app.listen(PORT, () => {
        console.log(`[Website Backend] Running on port ${PORT}`);
        console.log(`[Website Backend] Bus live data → GET /api/buses/live`);
    });
});
