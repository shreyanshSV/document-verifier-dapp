import express from "express";
import mongoose from "mongoose";
import path from "path";
import session from "express-session";
import bcrypt from "bcrypt";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import Web3 from "web3";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Tesseract from 'tesseract.js';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET || "DEFAULT_SECRET_KEY", // Use SESSION_SECRET from .env
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
    })
);

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.static(__dirname));

// Use MONGODB_URI from .env
const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb+srv://shreyanshvariya2006:sVhNKGEVuWUpzwBA@genai.nlsmnrj.mongodb.net/verifier_db?retryWrites=true&w=majority&appName=genai";

mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("✅ Successfully connected to MongoDB Atlas!"))
    .catch((err) => console.error("❌ MongoDB Connection error:", err));

// --- CORRECTED Blockchain Setup ---
// Use WEB3_PROVIDER_URL from .env for Sepolia, or fallback to Ganache for local dev
const web3 = new Web3(process.env.WEB3_PROVIDER_URL || "http://127.0.0.1:7545");

// Use ACCOUNT_ADDRESS from .env
const accountAddress = process.env.ACCOUNT_ADDRESS;

// Use PRIVATE_KEY from .env
const privateKey = Buffer.from(
    (process.env.PRIVATE_KEY) // No fallback here, as PRIVATE_KEY should always be set in .env for this logic
        .replace(/^0x/, ""), // Remove 0x prefix if present
    "hex"
);

// Ensure accountAddress and privateKey are loaded for debugging/initial checks
if (!accountAddress) {
    console.warn("⚠️ ACCOUNT_ADDRESS is not set in .env. Blockchain transactions may fail.");
}
if (!process.env.PRIVATE_KEY) { // Check the raw env variable
    console.warn("⚠️ PRIVATE_KEY is not set in .env. Blockchain transactions may fail.");
}


async function sendHashToBlockchain(fileHash) {
    try {
        // Ensure accountAddress is valid before proceeding
        if (!web3.utils.isAddress(accountAddress)) {
            throw new Error(`Invalid account address: ${accountAddress}. Please check your .env file.`);
        }

        const txCount = await web3.eth.getTransactionCount(accountAddress);
        const gasPrice = await web3.eth.getGasPrice(); // Fetch current gas price dynamically

        const txData = {
            nonce: web3.utils.toHex(txCount),
            gasLimit: web3.utils.toHex(50000), // A reasonable gas limit for a simple data transaction
            gasPrice: web3.utils.toHex(gasPrice),
            to: accountAddress, // Sending to own address as a record
            value: "0x0", // No Ether being sent
            data: web3.utils.toHex(fileHash), // Your file hash as transaction data
        };

        const signedTx = await web3.eth.accounts.signTransaction(
            txData,
            "0x" + privateKey.toString("hex") // Re-add 0x for signing if needed by web3.js
        );

        const receipt = await web3.eth.sendSignedTransaction(
            signedTx.rawTransaction
        );

        console.log("✅ Blockchain Tx Successful:", receipt.transactionHash);
        return receipt.transactionHash;
    } catch (err) {
        console.error("❌ Blockchain Tx Failed:", err.message || err); // Log specific error message
        return null;
    }
}

const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
});
const User = mongoose.model("User", userSchema, "users");

const authorizedDocumentSchema = new mongoose.Schema({
    docNumber: { type: String, required: true, unique: true },
    docType: String,
});
const AuthorizedDocument = mongoose.model(
    "AuthorizedDocument",
    authorizedDocumentSchema,
    "authorized_documents"
);

const verificationSchema = new mongoose.Schema({
    docId: String,
    docType: String,
    docNumber: String,
    fileHash: String,
    transactionHash: String,
    verificationStatus: { type: String, default: "Pending" },
    userId: mongoose.Schema.Types.ObjectId,
    submittedAt: { type: Date, default: Date.now },
});
const DocumentVerification = mongoose.model(
    "DocumentVerification",
    verificationSchema,
    "document_verifications"
);

const messageSchema = new mongoose.Schema({
    subject: String,
    message: String,
    submittedBy: mongoose.Schema.Types.ObjectId,
    submittedAt: { type: Date, default: Date.now },
});
const ContactMessage = mongoose.model(
    "ContactMessage",
    messageSchema,
    "contact_messages"
);

const settingsSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
});
const UserSettings = mongoose.model("UserSettings", settingsSchema, "user_settings");

function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ message: "Authentication required" });
}

app.post("/api/auth/signup", async (req, res) => {
    const { fullName, email, password, phone } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, password: hashedPassword, phone });
        await user.save();

        req.session.userId = user._id;
        await new UserSettings({ userId: user._id }).save();

        res.status(201).json({ message: "Account created successfully!" });
    } catch (error) {
        console.error("Error during sign-up:", error);
        res.status(400).json({ message: "Email already in use or invalid data." });
    }
});

app.post("/api/auth/signin", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Invalid credentials." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials." });

        req.session.userId = user._id;
        res.json({ message: "Signed in successfully!", user: { fullName: user.fullName } });
    } catch (error) {
        console.error("Error during sign-in:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ message: "Logged out successfully." }));
});

app.get("/api/profile", isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select("-password");
        res.json(user);
    } catch {
        res.status(500).json({ message: "Failed to fetch profile." });
    }
});

app.put("/api/profile", isAuthenticated, async (req, res) => {
    try {
        const { fullName, email, phone } = req.body;
        await User.findByIdAndUpdate(req.session.userId, { fullName, email, phone });
        res.json({ message: "Profile updated successfully!" });
    } catch {
        res.status(500).json({ message: "Failed to update profile." });
    }
});

app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
        const settings = await UserSettings.findOne({ userId: req.session.userId });
        res.json(settings || {});
    } catch {
        res.status(500).json({ message: "Failed to fetch settings." });
    }
});

app.put("/api/settings", isAuthenticated, async (req, res) => {
    try {
        const { emailNotifications, smsNotifications } = req.body;
        await UserSettings.findOneAndUpdate(
            { userId: req.session.userId },
            { emailNotifications, smsNotifications },
            { new: true, upsert: true }
        );
        res.json({ message: "Settings updated successfully!" });
    } catch {
        res.status(500).json({ message: "Failed to update settings." });
    }
});

app.post("/api/verify", isAuthenticated, upload.single("document"), async (req, res) => {
    const { docType, docNumber } = req.body;
    const userId = req.session.userId;

    if (!docType || !docNumber || !req.file) {
        return res.status(400).json({ message: "All fields are required." });
    }

    try {
        // Use Tesseract.recognize to process the image directly
        const { data: { text } } = await Tesseract.recognize(
            req.file.buffer,
            'eng',
            {
                logger: m => console.log(m)
            }
        );
        console.log("OCR Extracted Text:", text);

        const fileHash = web3.utils.sha3(req.file.buffer);

        const docNumberFoundInText = text.includes(docNumber);

        let verificationStatus = "Rejected";
        let transactionHash = null;

        if (docNumberFoundInText) {
            const isAuthorized = await AuthorizedDocument.findOne({ docNumber: docNumber });
            if (isAuthorized) {
                verificationStatus = "Verified";
                transactionHash = await sendHashToBlockchain(fileHash);
            }
        }

        const newVerification = new DocumentVerification({
            docId: uuidv4(),
            docType,
            docNumber,
            fileHash,
            transactionHash,
            verificationStatus,
            userId,
        });

        await newVerification.save();

        if (verificationStatus === "Verified") {
            res.json({
                message: "Document Found and Verified!",
                verificationStatus: "Verified",
                fileHash,
                transactionHash,
            });
        } else {
            res.status(404).json({
                message: "Document not found or invalid.",
                verificationStatus: "Rejected",
                fileHash,
                transactionHash,
            });
        }
    } catch (error) {
        console.error("Error during verification:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
});

app.get("/api/stats", isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const totalVerified = await DocumentVerification.countDocuments({ userId });
        const successfulVerifications = await DocumentVerification.countDocuments({
            userId,
            verificationStatus: "Verified",
        });
        const pendingRequests = await DocumentVerification.countDocuments({
            userId,
            verificationStatus: "Pending",
        });

        res.json({ totalVerified, successfulVerifications, pendingRequests });
    } catch {
        res.status(500).json({ message: "Failed to fetch statistics." });
    }
});

app.post("/api/contact", isAuthenticated, async (req, res) => {
    const { subject, message } = req.body;
    try {
        const contactMessage = new ContactMessage({
            subject,
            message,
            submittedBy: req.session.userId,
        });
        await contactMessage.save();
        res.status(201).json({ message: "Message sent successfully!" });
    } catch {
        res.status(500).json({ message: "Failed to send message." });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});