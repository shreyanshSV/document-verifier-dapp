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
import { createWorker } from 'tesseract.js';
import qrcode from 'qrcode';
import MongoStore from "connect-mongodb-session";
import pinataSDK from '@pinata/sdk';
import stream from 'stream';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(express.json());

// --- CRITICAL FIX: Reading MONGODB_URI from environment ---
const MONGODB_URI = process.env.MONGODB_URI;
// --- Reading PINATA keys from environment ---
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || "DEFAULT_SECRET_KEY";

// --- PINATA SETUP ---
const pinata = new pinataSDK(PINATA_API_KEY, PINATA_SECRET_API_KEY);
// -----------------------------------------------------------------


// --- SESSION STORE FIX: MongoDBStore ---
const MongoDBStore = MongoStore(session);
const sessionStore = new MongoDBStore({
    uri: MONGODB_URI,
    collection: 'sessions',
    expires: 1000 * 60 * 60 * 24 * 7,
});

sessionStore.on('error', function(error) {
    console.error("Session Store Error:", error);
});

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 7
        },
    })
);

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.static(__dirname));

mongoose
    .connect(MONGODB_URI)
    .then(() => console.log(" Successfully connected to MongoDB Atlas!"))
    .catch((err) => console.error(" MongoDB Connection error:", err.message));

// --- Blockchain Setup (omitted for brevity) ---
const web3 = new Web3(process.env.WEB3_PROVIDER_URL || "http://127.0.0.1:7545");
const accountAddress = process.env.ACCOUNT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;

async function sendHashToBlockchain(fileHash) {
    try {
        if (!web3.utils.isAddress(accountAddress)) {
            throw new Error(`Invalid account address: ${accountAddress}. Please check your .env file.`);
        }
        if (!privateKey || privateKey.length < 64) {
            throw new Error("Private key is missing or invalid. Please check your .env file.");
        }

        const txCount = await web3.eth.getTransactionCount(accountAddress);
        const networkGasPrice = await web3.eth.getGasPrice();

        const increasedGasPrice = BigInt(networkGasPrice) * BigInt(125) / BigInt(100);

        const tx = {
            nonce: web3.utils.toHex(txCount),
            gasLimit: web3.utils.toHex(500000),
            gasPrice: web3.utils.toHex(increasedGasPrice),
            to: accountAddress,
            value: "0x0",
            data: web3.utils.toHex(fileHash),
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        if (!signedTx || !signedTx.rawTransaction) {
            throw new Error("Failed to sign transaction, rawTransaction is missing.");
        }

        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log(" Blockchain Tx Successful:", receipt.transactionHash);
        return receipt.transactionHash;
    } catch (err) {
        console.error(" Blockchain Tx Failed:", err.message || err);
        return null;
    }
}
// --- Tesseract.js Worker Initialization (omitted for brevity) ---
let worker;
(async () => {
    try {
        worker = await createWorker('eng');
        console.log(" Tesseract.js worker initialized successfully.");
    } catch (err) {
        console.error(" Error initializing Tesseract.js worker:", err.message || err);
    }
})();

// --- Mongoose Schemas ---
const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    walletAddress: { type: String, unique: true, sparse: true }
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
    qrId: { type: String, unique: true, sparse: true },
    docId: String,
    docType: String,
    docNumber: String,
    fileHash: String,
    transactionHash: String,
    verificationStatus: { type: String, default: "Pending" },
    userId: mongoose.Schema.Types.ObjectId,
    submittedAt: { type: Date, default: Date.now },
    documentCID: String, // <-- Stores the IPFS Content Identifier
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

// --- Middleware (omitted for brevity) ---
function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ message: "Authentication required" });
}

// ----------------------------------------------------
// --- ROUTES (Defined after all Models & Middleware) ---
// ----------------------------------------------------

// Authentication Routes (omitted for brevity)
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
        console.error("Error during sign-up:", error.message);
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
        console.error("Error during sign-in:", error.message);
        res.status(500).json({ message: "Internal server error." });
    }
});

app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ message: "Failed to log out." });
        }
        res.json({ message: "Logged out successfully." });
    });
});

// User Profile Routes (omitted for brevity)
app.get("/api/profile", isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select("-password");
        if (!user) return res.status(404).json({ message: "User not found." });
        res.json(user);
    } catch (error) {
        console.error("Error fetching profile:", error.message);
        res.status(500).json({ message: "Failed to fetch profile." });
    }
});

app.put("/api/profile", isAuthenticated, async (req, res) => {
    try {
        const { fullName, email, phone } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser._id.toString() !== req.session.userId.toString()) {
            return res.status(400).json({ message: "Email already in use by another account." });
        }

        await User.findByIdAndUpdate(req.session.userId, { fullName, email, phone }, { new: true });
        res.json({ message: "Profile updated successfully!" });
    } catch (error) {
        console.error("Error updating profile:", error.message);
        res.status(500).json({ message: "Failed to update profile." });
    }
});

app.put("/api/settings", isAuthenticated, async (req, res) => {
    try {
        const { emailNotifications, smsNotifications } = req.body;
        await UserSettings.findOneAndUpdate({ userId: req.session.userId }, { emailNotifications, smsNotifications }, { new: true, upsert: true });
        res.json({ message: "Settings updated successfully!" });
    } catch (error) {
        console.error("Error updating settings:", error.message);
        res.status(500).json({ message: "Failed to update settings." });
    }
});

// --- RESTORED ROUTE: Link Wallet Address to Profile (FIXED LOCATION) ---
app.post("/api/profile/link-wallet", isAuthenticated, async (req, res) => {
    const { walletAddress } = req.body;
    const userId = req.session.userId;

    if (!walletAddress || !web3.utils.isAddress(walletAddress)) {
        return res.status(400).json({ message: "Invalid wallet address provided." });
    }

    try {
        const existingUser = await User.findOne({ walletAddress: web3.utils.toChecksumAddress(walletAddress) });
        if (existingUser && existingUser._id.toString() !== userId.toString()) {
            return res.status(400).json({ message: "This wallet address is already linked to another user account." });
        }

        await User.findByIdAndUpdate(userId, { walletAddress: web3.utils.toChecksumAddress(walletAddress) });
        res.json({ message: "Wallet address linked successfully!" });
    } catch (error) {
        console.error("Error linking wallet:", error.message);
        res.status(500).json({ message: "Failed to link wallet." });
    }
});

// Document Verification Route (omitted for brevity)
app.post("/api/verify", isAuthenticated, upload.single("document"), async (req, res) => {
    if (!worker) {
        return res.status(503).json({ message: "OCR service is not ready. Please try again in a moment." });
    }

    const { docType, docNumber } = req.body;
    const userId = req.session.userId;

    if (!docType || !docNumber || !req.file) {
        return res.status(400).json({ message: "All fields are required (Document Type, Document Number, and Document File)." });
    }
    if (!req.file.buffer) {
        return res.status(400).json({ message: "Uploaded file is empty or corrupted." });
    }

    let documentCID = null;
    let verificationStatus = "Rejected";
    let transactionHash = null;
    let qrId = null;
    let qrCodeDataUrl = null;
    let qrLink = null;

    try {
        // =================================================================
        // *** FIX: STEP 1 - CHECK FOR EXISTING VERIFIED RECORD ***
        // =================================================================
        const existingRecord = await DocumentVerification.findOne({
            docNumber: docNumber,
            verificationStatus: "Verified"
        });

        if (existingRecord) {
            console.log("Existing verified record found. Regenerating QR Code Image.");

            const existingQrId = existingRecord.qrId;
            const existingQrLink = existingQrId ?
                `${process.env.RENDER_APP_URL || `http://localhost:${port}`}/verify-qr?id=${existingQrId}`
                : null;

            let existingQrCodeDataUrl = null;

            // --- CRITICAL FIX: Regenerate the QR Code Image Data URL ---
            if (existingQrLink) {
                existingQrCodeDataUrl = await qrcode.toDataURL(existingQrLink);
                console.log("QR Code Image Regenerated Successfully.");
            }
            // -----------------------------------------------------------

            return res.json({
                message: "Document Already Verified!",
                verificationStatus: "Verified",
                fileHash: existingRecord.fileHash,
                transactionHash: existingRecord.transactionHash,
                documentCID: existingRecord.documentCID,
                qrCodeLink: existingQrLink,       // Pass the permanent link
                qrCodeDataUrl: existingQrCodeDataUrl, // <-- PASS THE REGENERATED IMAGE DATA
            });
        }
        // =================================================================

        // --- STEP 2: PROCEED WITH NEW VERIFICATION (If no existing record found) ---

        // --- 2.1 OCR AND HASHING ---
        const { data: { text } } = await worker.recognize(req.file.buffer);
        console.log("OCR Extracted Text:", text);

        const fileHash = web3.utils.sha3(req.file.buffer);

        // --- 2.2 IPFS UPLOAD LOGIC ---
        if (pinata && PINATA_API_KEY && PINATA_SECRET_API_KEY) {
            const readableStreamForFile = stream.Readable.from(req.file.buffer);
            readableStreamForFile.path = req.file.originalname;

            const pinataResponse = await pinata.pinFileToIPFS(readableStreamForFile, {
                pinataMetadata: {
                    name: `Verified_Doc_${docNumber}`,
                    keyvalues: { docNumber: docNumber, userId: userId.toString() }
                }
            });

            documentCID = pinataResponse.IpfsHash;
            console.log("IPFS Upload Successful. CID:", documentCID);
        } else {
            console.error("Pinata SDK not fully initialized (check environment keys). Document CID will be null.");
        }

        // --- 2.3 AUTHORIZATION AND BLOCKCHAIN ---
        const docNumberFoundInText = text.includes(docNumber);

        if (docNumberFoundInText) {
            const isAuthorized = await AuthorizedDocument.findOne({ docNumber: docNumber });
            if (isAuthorized) {
                verificationStatus = "Verified";

                if (documentCID) {
                    transactionHash = await sendHashToBlockchain(fileHash);
                } else {
                    verificationStatus = "Rejected";
                    console.error("Verification failed: Document could not be pinned to IPFS.");
                }
            }
        }

        // --- 2.4 FINAL RECORD AND QR GENERATION ---
        if (verificationStatus === "Verified" && transactionHash && documentCID) {
            qrId = uuidv4(); // Generate new QR ID only for a new successful verification
            const baseUrl = process.env.RENDER_APP_URL || `http://localhost:${port}`;
            qrLink = `${baseUrl}/verify-qr?id=${qrId}`;
            qrCodeDataUrl = await qrcode.toDataURL(qrLink);
        } else {
            verificationStatus = "Rejected";
        }

        const newVerification = new DocumentVerification({
            docId: uuidv4(),
            qrId: qrId, // Will be null or the newly generated ID
            docType,
            docNumber,
            fileHash,
            transactionHash,
            verificationStatus,
            userId,
            documentCID: documentCID,
        });
        await newVerification.save();

        if (verificationStatus === "Verified") {
            res.json({
                message: "Document Found and Verified!",
                verificationStatus: "Verified",
                fileHash,
                transactionHash,
                qrCodeDataUrl,
                documentCID: documentCID,
                qrCodeLink: qrLink,
            });
        } else {
            res.status(404).json({
                message: "Document not found or invalid. Verification Rejected.",
                verificationStatus: "Rejected",
                fileHash: newVerification.fileHash, // Return hash even if rejected for debugging
                transactionHash: null,
                documentCID: null,
                qrCodeDataUrl: null,
                qrCodeLink: null
            });
        }

    } catch (error) {
        console.error("Error during verification:", error.message);
        if (error.message && error.message.includes('API Key') || error.message.includes('pinFileToIPFS')) {
            return res.status(500).json({ message: "Verification failed. Pinata API Keys may be incorrect or missing from your .env/Render environment." });
        }
        res.status(500).json({ message: `An internal server error occurred during verification: ${error.message}` });
    }
});


// QR Code Initial Check Endpoint (omitted for brevity)
app.get("/api/qr-check", async (req, res) => {
    const qrId = req.query.id;
    if (!qrId) {
        return res.status(400).json({ message: "QR Document ID is required." });
    }

    try {
        const verificationRecord = await DocumentVerification.findOne({ qrId: qrId });

        if (!verificationRecord) {
            return res.status(404).json({ message: "Document verification record not found for this QR code." });
        }

        res.json({
            verificationStatus: verificationRecord.verificationStatus,
            docType: verificationRecord.docType,
            submittedAt: verificationRecord.submittedAt,
            message: "Initial verification check successful."
        });
    } catch (error) {
        console.error("Error during QR initial check:", error.message);
        res.status(500).json({ message: "An internal server error occurred during QR check." });
    }
});

// FINAL: Web3 Signature Verification Endpoint with Authorization Check
app.post("/api/qr-verify-signature", async (req, res) => {
    const { qrId, walletAddress, signature, message } = req.body;

    if (!qrId || !walletAddress || !signature || !message) {
        return res.status(400).json({ message: "QR ID, Wallet Address, Signature, and Message are required." });
    }

    try {
        const recoveredAddress = await web3.eth.accounts.recover(message, signature);
        const recoveredAddressChecksum = web3.utils.toChecksumAddress(recoveredAddress);
        const walletAddressChecksum = web3.utils.toChecksumAddress(walletAddress);

        if (recoveredAddressChecksum !== walletAddressChecksum) {
            return res.status(401).json({ message: "Invalid cryptographic signature." });
        }

        const verificationRecord = await DocumentVerification.findOne({ qrId: qrId });
        if (!verificationRecord) {
            return res.status(404).json({ message: "Document record not found." });
        }

        const owner = await User.findById(verificationRecord.userId);

        if (!owner || !owner.walletAddress) {
            return res.status(403).json({ message: "Access Denied: The document owner has not linked a wallet for security verification." });
        }

        const ownerWalletChecksum = web3.utils.toChecksumAddress(owner.walletAddress);

        if (recoveredAddressChecksum !== ownerWalletChecksum) {
            console.warn(`ACCESS DENIED: Wallet ${recoveredAddressChecksum} tried to unlock document owned by ${ownerWalletChecksum}`);
            return res.status(403).json({ message: "Access Denied: The signing wallet does not match the registered document owner." });
        }

        res.json({
            message: "Signature verified. Full details revealed.",
            docType: verificationRecord.docType,
            docNumber: verificationRecord.docNumber,
            fileHash: verificationRecord.fileHash,
            transactionHash: verificationRecord.transactionHash,
            verificationStatus: verificationRecord.verificationStatus,
            documentCID: verificationRecord.documentCID, // <-- CRITICAL: Return CID to client
        });

    } catch (error) {
        console.error("Error during signature verification:", error.message || error);
        res.status(500).json({ message: "An internal server error occurred during signature verification." });
    }
});

// Statistics and Contact Routes (omitted for brevity)
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
    } catch (error) {
        console.error("Error fetching statistics:", error.message);
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
    } catch (error) {
        console.error("Error sending contact message:", error.message);
        res.status(500).json({ message: "Failed to send message." });
    }
});


// --- Server Start ---
app.listen(port, () => {
    console.log(` Server is running on http://localhost:${port}`);
});