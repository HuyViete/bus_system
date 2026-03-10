import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken";


const ACCESS_TOKEN_TTL = '30m';
const REFRESH_TOKEN_TTL = 14 * 24 * 3600 * 1000;

export const signUp = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const duplicate = await User.findOne({ email: email }).exec();
        if (duplicate) {
            return res.status(409).json({ message: "User with the email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            username,
            email,
            hashedPassword
        });

        return res.sendStatus(204);
    } catch (error) {
        console.error("Error signing up:", error);
        return res.sendStatus(500).json({ message: "System Error" });
    }
};

export const signIn = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: "Missing Username or Password" })
        }

        const user = User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: "Invalid Username or Password" })
        }

        const passwordCorrect = await bcrypt.compare(password, user.hashedPassword);
        if (!passwordCorrect) {
            return res.status(401).json({ message: "Invalid Username or Password" })
        }

        const accessToken = jwt.sign({ userId: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
        const refreshToken = crypto.randomBytes(64).toString('hex');

        await Session.create({
            userId: user._id,
            refreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: REFRESH_TOKEN_TTL,
        });

        return res.status(200).json({ message: `User ${user.displayName} logged in!`, accessToken });


    } catch (error) {
        console.error("Error signing in:", error);
        return res.status(500).json({ message: "System Error" })
    }
}
