import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        trim: true,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        unique: true
    },
    hashedPassword: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        trim: true,
        required: true
    },
    avatarUrl: {
        type: String,
        trim: true,
        default: ""
    },
    avatarId: {
        type: String,
        trim: true,
        default: ""
    },
    phone: {
        type: String,
        sparse: true
    }
}, {
    timestamps: true
});

const User = mongoose.model("User", UserSchema);

export default User;
