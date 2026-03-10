import express from "express";
import dotenv from "dotenv";
import { connectToDB } from "./libs/db.js";

import authRoute from "./routes/authRoute.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());

// public routes
app.use("/api/auth", authRoute);

// private routes

connectToDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});

