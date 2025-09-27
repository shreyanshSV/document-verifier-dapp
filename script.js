// Base URL for API calls
const API_URL = '/api';

// --- Global UI State ---
const state = {
    user: null,
    isAuthenticated: false,
    // Client-side flag for persistent authentication state check
    isLoggedInClient: localStorage.getItem('isLoggedInClient') === 'true'
};

// --- QR Code Scanning Global Variables ---
let html5QrCode = null;
let currentQrScanId = null;
let droppedFile = null; // Global variable to hold file from drag-and-drop

// --- DOM Elements (Placeholder declaration - populated in DOMContentLoaded) ---
const pages = {};
const forms = {};
const messages = {};
const profileInputs = {};
const statsElements = {};
const settingsToggles = {};


// ----------------------------------------------------------------------
// --- I. CORE GLOBAL/WINDOW FUNCTIONS (DEFINED IMMEDIATELY FOR HTML) ---
// ----------------------------------------------------------------------

function hideAllPages() {
    Object.values(pages).forEach(page => page.classList.add('hidden'));
}

function showPage(pageId) {
    hideAllPages();
    pages[pageId].classList.remove('hidden');
    pages[pageId].classList.add('fade-in');
}

function showMessage(element, message, type = 'success') {
    element.textContent = message;
    element.className = `mt-4 text-center font-medium ${type === 'success' ? 'text-green-600' : 'text-red-600'}`;
}

function getWeb3Provider() {
    if (window.ethereum) {
        return window.ethereum;
    }
    return null;
}

// --- Modal Functions (CRITICAL FIX: Explicitly defined on window) ---

window.showAuthModal = function() {
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('modal-status').textContent = "Click the button below to connect your wallet and sign the proof message.";
    document.getElementById('modal-status').classList.remove('hidden', 'text-red-500', 'text-green-500');
};

window.hideAuthModal = function() {
    document.getElementById('authModal').classList.add('hidden');
};

window.showLinkWalletModal = function() {
    document.getElementById('linkWalletModal').classList.remove('hidden');
    document.getElementById('link-modal-status').classList.add('hidden');
    document.getElementById('linked-address-display').classList.add('hidden');
};

window.hideLinkWalletModal = function() {
    document.getElementById('linkWalletModal').classList.add('hidden');
    if (typeof fetchProfile === 'function') fetchProfile();
};

// --- Dashboard Functions ---

function showDashboardSection(section) {
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach(s => s.classList.add('hidden'));

    // Stop QR scanner if not on QR verification section
    if (html5QrCode && html5QrCode.isScanning && section !== 'qrVerification') {
        html5QrCode.stop().then(ignore => {}).catch(err =>
            console.warn("QR scanner stop failed:", err));
    }

    document.getElementById(`${section}Section`).classList.remove('hidden');
    document.getElementById(`${section}Section`).classList.add('fade-in');

    const navButtons = document.querySelectorAll('.dashboard-nav-btn');
    navButtons.forEach(btn => {
        btn.classList.remove('bg-blue-50', 'text-blue-700', 'font-medium');
        btn.classList.add('hover:bg-gray-50', 'text-gray-700');
    });

    const clickedButton = document.querySelector(`[onclick="showDashboardSection('${section}')"]`);
    if (clickedButton) {
        clickedButton.classList.add('bg-blue-50', 'text-blue-700', 'font-medium');
        clickedButton.classList.remove('hover:bg-gray-50', 'text-gray-700');
    }

    // FIX: Initialize scanner immediately when entering QR page (isSilent=true)
    if (section === 'qrVerification') {
        const qrReaderDiv = document.getElementById('qr-reader');
        const startBtn = document.getElementById('start-scanner-btn');
        const qrScanResultDiv = document.getElementById('qr-scan-result');

        // Hide scanner, show activation button
        if(qrReaderDiv) qrReaderDiv.classList.add('hidden');
        if(startBtn) startBtn.classList.remove('hidden');
        if(qrScanResultDiv) qrScanResultDiv.classList.add('hidden');

        if(window.initQrScanner) {
            window.initQrScanner(true);
        }
    }
}

// --- Guest Navigation Helpers ---

function showGuestAuth() {
    showPage('guestAuthPage');
    if(window.switchGuestTab) window.switchGuestTab('signup');
}

function showUserLogin() {
    showPage('userLoginPage');
}

// --- Logout Function ---

async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            const response = await fetch(`${API_URL}/auth/logout`, { method: 'POST' });
            const data = await response.json();

            if (response.ok) {
                state.isAuthenticated = false;
                state.user = null;
                localStorage.setItem('isLoggedInClient', 'false'); // NEW: Clear client flag
                window.showPage('guestPage');
            } else {
                alert('Logout failed. Please try again.');
            }
        } catch (error) {
            console.error('Logout error:', error);
            alert('Could not connect to server to log out.');
        }
    }
}


// ----------------------------------------------------
// --- II. DATA FETCHERS & UTILITIES ---
// ----------------------------------------------------

async function fetchStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        if (response.ok) {
            const data = await response.json();
            statsElements.totalVerified.textContent = data.totalVerified;
            statsElements.successfulVerifications.textContent = data.successfulVerifications;
            statsElements.pendingRequests.textContent = data.pendingRequests;
        }
    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

async function fetchProfile() {
    try {
        const response = await fetch(`${API_URL}/profile`);

        // FIX: Check for 401 Unauthorized status explicitly to handle session loss
        if (response.status === 401) {
            state.isAuthenticated = false;
            localStorage.setItem('isLoggedInClient', 'false');
            showPage('guestPage');
            return;
        }

        if (response.ok) {
            const user = await response.json();
            state.user = user;

            document.getElementById('welcome-message').textContent = `Welcome, ${user.fullName}`;
            profileInputs.fullName.value = user.fullName || '';
            profileInputs.email.value = user.email || '';
            profileInputs.phone.value = user.phone || '';
            document.getElementById('profile-fullname').textContent = user.fullName;
            document.getElementById('profile-email').textContent = user.email;

            // Display Wallet Status
            const walletDisplay = document.getElementById('profile-wallet');
            const walletAddress = user.walletAddress;

            if (walletAddress) {
                walletDisplay.textContent = `Wallet: Linked (${walletAddress.substring(0, 6)}...${walletAddress.substring(38)})`;
                walletDisplay.className = 'text-sm text-green-600 mt-1';
            } else {
                walletDisplay.textContent = 'Wallet: NOT LINKED (REQUIRED for security)';
                walletDisplay.className = 'text-sm text-red-600 mt-1';
            }
        }
    } catch (error) {
        console.error('Failed to fetch profile:', error);
    }
}

async function fetchSettings() {
    try {
        const response = await fetch(`${API_URL}/settings`);
        if (response.ok) {
            const settings = await response.json();
            settingsToggles.email.checked = settings.emailNotifications;
            settingsToggles.sms.checked = settings.smsNotifications;
        }
    } catch (error) {
        console.error('Failed to fetch settings:', error);
    }
}

function hideQrDisplayArea() {
    document.getElementById('qr-code-display-area').classList.add('hidden');
    forms.verify.reset();
    document.getElementById('result').textContent = "Awaiting verification...";
}


// ----------------------------------------------------
// --- III. DRAG & DROP UTILITY FUNCTIONS ---
// ----------------------------------------------------

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const dt = e.dataTransfer;
    const fileDropArea = document.getElementById('file-drop-area');

    if (dt.files && dt.files.length > 0) {
        droppedFile = dt.files[0];

        const fileNameElement = document.createElement('p');
        fileNameElement.className = 'text-green-600 font-medium mt-2';
        fileNameElement.textContent = `File selected: ${droppedFile.name}`;

        // Clear old content and display new file name
        fileDropArea.innerHTML = '';
        fileDropArea.appendChild(fileNameElement);

        // Visually signal success
        fileDropArea.classList.remove('border-gray-300', 'border-blue-500', 'bg-blue-50');
        fileDropArea.classList.add('border-green-500', 'bg-green-50');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const fileDropArea = document.getElementById('file-drop-area');
    fileDropArea.classList.remove('border-gray-300', 'border-green-500', 'bg-green-50');
    fileDropArea.classList.add('border-blue-500', 'bg-blue-50');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const fileDropArea = document.getElementById('file-drop-area');
    // Restore neutral look if no file has been dropped
    if (!droppedFile) {
        fileDropArea.classList.remove('border-blue-500', 'bg-blue-50', 'border-green-500', 'bg-green-50');
        fileDropArea.classList.add('border-gray-300');
    }
}

// Function to reset the input area's content to its default HTML
function resetDropAreaVisuals(fileDropArea) {
    fileDropArea.innerHTML = `
        <div class="text-gray-400 text-4xl mb-4">📁</div>
        <p class="text-gray-600">Click to upload or drag and drop</p>
    `;
    fileDropArea.classList.remove('border-green-500', 'bg-green-50', 'border-blue-500', 'bg-blue-50');
    fileDropArea.classList.add('border-gray-300');
}


// ----------------------------------------------------
// --- IV. QR SCANNING LOGIC (Final Version) ---
// ----------------------------------------------------

async function initQrScanner(isSilent = false) {
    const qrFileInput = document.getElementById('qr-code-file-input');
    const qrResultMessage = document.getElementById('qr-result-message');
    const qrReaderDiv = document.getElementById('qr-reader');
    const startBtn = document.getElementById('start-scanner-btn');

    // Clear previous results
    document.getElementById('qr-scan-result').classList.add('hidden');
    qrResultMessage.textContent = "";
    document.getElementById('qr-detailed-info').classList.add('hidden');
    document.getElementById('unlock-details-btn').classList.add('hidden');
    currentQrScanId = null;

    // Check 1: Ensure Html5Qrcode library is loaded
    if (typeof Html5Qrcode === 'undefined') {
        qrResultMessage.className = 'font-medium text-red-600';
        qrResultMessage.textContent = 'Scanner library failed to load. Please try a hard refresh (Ctrl+Shift+R).';
        document.getElementById('qr-scan-result').classList.remove('hidden');
        return;
    }

    // 2. Setup UI for live scanning (only if not silent)
    if(!isSilent) {
        if(qrReaderDiv) qrReaderDiv.classList.remove('hidden');
        if(startBtn) startBtn.classList.add('hidden');
    }

    // Initialize the main object (CRITICAL STEP FOR FILE SCAN)
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    // 3. Start Camera Scanning (Conditional)
    if (!isSilent) {
        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length) {
                const camerald = devices[0].id;
                html5QrCode.start(
                    camerald,
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    (decodedText, decodedResult) => {
                        console.log(`QR Code Scanned: ${decodedText}`);
                        handleQrScanResult(decodedText);
                        html5QrCode.stop();
                        if(startBtn) startBtn.classList.remove('hidden');
                    },
                    (errorMessage) => { }
                ).catch((err) => {
                    console.error("QR Code Scanner Start Failed (Camera error):", err);
                    if(qrReaderDiv) qrReaderDiv.classList.add('hidden');
                    if(startBtn) startBtn.classList.remove('hidden');
                    qrResultMessage.className = 'font-medium text-orange-600';
                    qrResultMessage.textContent = 'Camera failed to start. You can still upload a QR image below.';
                    document.getElementById('qr-scan-result').classList.remove('hidden');
                });
            } else {
                console.error("No cameras found on this device. Please upload a QR image.");
                if(qrReaderDiv) qrReaderDiv.classList.add('hidden');
                if(startBtn) startBtn.classList.remove('hidden');
                qrResultMessage.className = 'font-medium text-orange-600';
                qrResultMessage.textContent = 'No camera detected. Please upload a QR image.';
                document.getElementById('qr-scan-result').classList.remove('hidden');
            }
        }).catch(err => {
            console.error("Error getting camera devices:", err);
        });
    }

    // Event listener for file input
    qrFileInput.onchange = (e) => {
        if (e.target.files.length === 0) return;
        const imageFile = e.target.files[0];

        // Stop camera if running, then scan file
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(ignore => {}).catch(err => console.warn("QR scanner stop failed:", err));
        }

        // Show scanning message immediately
        qrResultMessage.className = 'font-medium text-gray-700';
        qrResultMessage.textContent = 'Scanning QR image...';
        document.getElementById('qr-scan-result').classList.remove('hidden');

        html5QrCode.scanFile(imageFile, true)
            .then(decodedText => {
                console.log(`QR Code from file: ${decodedText}`);
                handleQrScanResult(decodedText);
                e.target.value = null; // Clear the input
            })
            .catch(err => {
                console.error("Error scanning file:", err);
                qrResultMessage.className = 'font-medium text-red-600';
                qrResultMessage.textContent = "Failed to scan QR code from image. Please ensure it's a valid QR code.";
                document.getElementById('qr-scan-result').classList.remove('hidden');
            });
    };
}

async function handleQrScanResult(qrData) {
    // Stop the scanner if it's still running (e.g., from camera scan)
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(ignore => {}).catch(err => console.warn("QR scanner stop failed after scan:", err));
    }

    const qrScanResultDiv = document.getElementById('qr-scan-result');
    const qrResultMessage = document.getElementById('qr-result-message');
    const qrDetailedInfo = document.getElementById('qr-detailed-info');
    const unlockDetailsBtn = document.getElementById('unlock-details-btn');

    qrDetailedInfo.classList.add('hidden');
    unlockDetailsBtn.classList.add('hidden');
    qrScanResultDiv.classList.remove('hidden');
    qrResultMessage.className = 'font-medium text-gray-700';
    qrResultMessage.textContent = 'Scanning successful. Checking verification status...';

    try {
        // Extract the ID from the QR data
        const url = new URL(qrData);
        const docId = url.searchParams.get('id');

        if (!docId) {
            qrResultMessage.className = 'font-medium text-red-600';
            qrResultMessage.textContent = 'Invalid QR code data: Missing document ID.';
            return;
        }

        currentQrScanId = docId; // Store the ID for Web3 auth

        // Make API call to backend for initial check
        const response = await fetch(`${API_URL}/qr-check?id=${docId}`);
        const data = await response.json();

        if (response.ok) {
            qrResultMessage.className = 'font-medium text-green-600';
            qrResultMessage.textContent = `Initial Verification: ${data.verificationStatus}`;

            qrDetailedInfo.classList.remove('hidden');
            document.getElementById('qr-doc-type').textContent = data.docType || 'N/A';
            document.getElementById('qr-status').textContent = data.verificationStatus || 'N/A';
            document.getElementById('qr-submitted-at').textContent = new Date(data.submittedAt).toLocaleDateString() || 'N/A';

            if (data.verificationStatus === 'Verified') {
                unlockDetailsBtn.classList.remove('hidden');
            }
        } else {
            qrResultMessage.className = 'font-medium text-red-600';
            qrResultMessage.textContent = data.message || 'Verification failed or document not found.';
        }

    } catch (error) {
        qrResultMessage.className = 'font-medium text-red-600';
        qrResultMessage.textContent = 'An error occurred during verification. Please check the console.';
    }
}


// ----------------------------------------------------
// --- V. WEB3 & AUTHENTICATION LOGIC ---
// ----------------------------------------------------

document.getElementById('link-wallet-btn').addEventListener('click', async () => {
    const provider = getWeb3Provider();
    const modalStatus = document.getElementById('link-modal-status');
    const linkedAddressDisplay = document.getElementById('linked-address-display');

    modalStatus.textContent = "";
    modalStatus.classList.remove('hidden', 'text-red-500', 'text-green-500');
    modalStatus.textContent = "Connecting to MetaMask...";

    if (!provider) {
        modalStatus.textContent = "MetaMask not detected. Please install it.";
        modalStatus.classList.add('text-red-500');
        return;
    }

    try {
        // 1. Request Wallet Access
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        const walletAddress = accounts[0];

        modalStatus.textContent = "Wallet connected. Linking address on server...";

        // 2. Send Address to Backend
        const response = await fetch(`${API_URL}/profile/link-wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
        });
        const data = await response.json();

        if (response.ok) {
            modalStatus.textContent = "Success!";
            modalStatus.classList.add('text-green-500');
            document.getElementById('linked-address-display').textContent = `Linked: ${walletAddress}`;
            document.getElementById('linked-address-display').classList.remove('hidden');
            document.getElementById('link-wallet-btn').classList.add('hidden');
        } else {
            modalStatus.textContent = data.message || "Failed to link wallet.";
            modalStatus.classList.add('text-red-500');
        }

    } catch (error) {
        modalStatus.textContent = "Connection failed or transaction rejected.";
        modalStatus.classList.add('text-red-500');
    }
});

document.getElementById('auth-sign-btn').addEventListener('click', async () => {
    const qrId = currentQrScanId;
    const provider = getWeb3Provider();
    const modalStatus = document.getElementById('modal-status');
    const resultDiv = document.getElementById('qr-scan-result');

    modalStatus.textContent = "";
    modalStatus.classList.remove('hidden', 'text-red-500', 'text-green-500');
    modalStatus.textContent = "Connecting to MetaMask...";

    if (!provider) {
        modalStatus.textContent = "MetaMask not detected. Please install it and try again.";
        modalStatus.classList.add('text-red-500');
        return;
    }

    if (!qrId) {
        modalStatus.textContent = "Error: Document ID missing. Please re-scan the QR code.";
        modalStatus.classList.add('text-red-500');
        return;
    }

    try {
        // 1. Request Wallet Access
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        const walletAddress = accounts[0];

        // 2. Define Message (Nonce) for signing
        const message = `Verify ownership of document ID: ${qrId}. Timestamp: ${Date.now()}`;

        modalStatus.textContent = "Waiting for signature in MetaMask...";

        // 3. Request Signature
        const signature = await provider.request({
            method: 'personal_sign',
            params: [message, walletAddress],
        });

        modalStatus.textContent = "Signature received. Verifying ownership...";

        // 4. Send Signature to Backend for Verification
        const response = await fetch(`${API_URL}/qr-verify-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qrId, walletAddress, signature, message })
        });
        const data = await response.json();

        if (response.ok) {
            window.hideAuthModal();
            // Display the FULL, sensitive data
            document.getElementById('qr-detailed-info').innerHTML = `
                <p class="text-md font-bold text-green-700 mb-2">✅ ${data.message}</p>
                <p class="text-sm text-gray-600"><strong>Document Type:</strong> ${data.docType}</p>
                <p class="text-sm text-gray-600"><strong>Document Number:</strong> ${data.docNumber}</p>
                <p class="text-sm text-gray-600 mt-3 break-all"><strong>File Hash (SHA3):</strong> ${data.fileHash}</p>
                <p class="text-sm text-gray-600 break-all"><strong>Blockchain TX Hash:</strong> <a href="https://sepolia.etherscan.io/tx/${data.transactionHash}" target="_blank" class="text-blue-500 hover:underline">${data.transactionHash}</a></p>
            `;
            document.getElementById('qr-detailed-info').classList.remove('hidden');
            document.getElementById('unlock-details-btn').classList.add('hidden');
            resultDiv.classList.remove('hidden');

        } else {
            modalStatus.textContent = data.message || "Signature Verification Failed on Server.";
            modalStatus.classList.add('text-red-500');
        }

    } catch (error) {
        modalStatus.textContent = "Authentication failed (User rejected or network error).";
        modalStatus.classList.add('text-red-500');
    }
});


// ----------------------------------------------------
// --- VI. FORM HANDLERS (UPDATED for Drag & Drop) ---
// ----------------------------------------------------

// NOTE: LISTENERS ARE ATTACHED INSIDE DOMContentLoaded

// ----------------------------------------------------
// --- VII. FINAL INITIALIZATION AND EXPOSURE ---
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', function() {

    // --- 1. POPULATE DOM ELEMENTS (CRITICAL) ---
    pages.guestPage = document.getElementById('guestPage');
    pages.guestAuthPage = document.getElementById('guestAuthPage');
    pages.userLoginPage = document.getElementById('userLoginPage');
    pages.dashboard = document.getElementById('dashboard');

    // Populate Forms (CRITICAL for listeners)
    forms.signup = document.getElementById('signup-form');
    forms.signin = document.getElementById('signin-form');
    forms.userLogin = document.getElementById('user-login-form');
    forms.profile = document.getElementById('profile-form');
    forms.verify = document.getElementById('verify-form');
    forms.contact = document.getElementById('contact-form');

    // Populate Messages
    messages.signup = document.getElementById('signup-message');
    messages.signin = document.getElementById('signin-message');
    messages.userLogin = document.getElementById('user-login-message');
    messages.profile = document.getElementById('profile-message');
    messages.contact = document.getElementById('contact-message-status');

    // Populate Inputs/Stats
    profileInputs.fullName = document.getElementById('profile-edit-fullname');
    profileInputs.email = document.getElementById('profile-edit-email');
    profileInputs.phone = document.getElementById('profile-edit-phone');

    statsElements.totalVerified = document.getElementById('total-verified');
    statsElements.successfulVerifications = document.getElementById('successful-verifications');
    statsElements.pendingRequests = document.getElementById('pending-requests');

    settingsToggles.email = document.getElementById('email-toggle');
    settingsToggles.sms = document.getElementById('sms-toggle');


    const fileDropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('document-file');


    // --- 2. DRAG & DROP LISTENERS (RELIABLE ATTACHMENT) ---
    if (fileDropArea && fileInput) {

        // A. Handle Files Selected by Clicking (Clear the dropped file if user clicks)
        fileInput.addEventListener('change', () => {
            droppedFile = null;
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const fileNameElement = document.createElement('p');
                fileNameElement.className = 'text-green-600 font-medium mt-2';
                fileNameElement.textContent = `File selected: ${file.name}`;

                fileDropArea.innerHTML = '';
                fileDropArea.appendChild(fileNameElement);

                fileDropArea.classList.remove('border-gray-300', 'border-blue-500', 'bg-blue-50');
                fileDropArea.classList.add('border-green-500', 'bg-green-50');
            }
        });

        // B. Handle Drag and Drop Events
        fileDropArea.addEventListener('dragover', handleDragOver);
        fileDropArea.addEventListener('dragleave', handleDragLeave);
        fileDropArea.addEventListener('drop', handleDrop);

        // Prevents default browser drop behavior (opening file in new tab)
        document.body.addEventListener('dragover', (e) => e.preventDefault());
        document.body.addEventListener('drop', (e) => e.preventDefault());
    }

    // --- 3. INITIAL AUTH CHECK ---
    if (state.isAuthenticated || state.isLoggedInClient) {
        showPage('dashboard');
        fetchStats();
        fetchProfile();
    } else {
        showPage('guestPage');
    }

    // --- 4. ATTACH FORM LISTENERS (MOVED HERE FOR STABILITY) ---

    forms.signup.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('signup-fullname').value;
        const email = document.getElementById('signup-email').value;
        const phone = document.getElementById('signup-phone').value;
        const password = document.getElementById('signup-password').value;

        const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, phone, password })
        });

        const data = await response.json();
        showMessage(messages.signup, data.message, response.ok ? 'success' : 'error');
        if (response.ok) {
            setTimeout(() => window.switchGuestTab('signin'), 1000);
        }
    });

    forms.signin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signin-email').value;
        const password = document.getElementById('signin-password').value;

        const response = await fetch(`${API_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        showMessage(messages.signin, data.message, response.ok ? 'success' : 'error');
        if (response.ok) {
            state.isAuthenticated = true;
            localStorage.setItem('isLoggedInClient', 'true'); // NEW: Set client flag

            // FIX: Add a small delay (50ms) to ensure the browser saves the session cookie
            showPage('dashboard');
            setTimeout(() => {
                fetchStats();
                fetchProfile();
            }, 50);
        }
    });

    forms.userLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('user-login-email').value;
        const password = document.getElementById('user-login-password').value;

        const response = await fetch(`${API_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        showMessage(messages.userLogin, data.message, response.ok ? 'success' : 'error');
        if (response.ok) {
            state.isAuthenticated = true;
            localStorage.setItem('isLoggedInClient', 'true'); // NEW: Set client flag

            // FIX: Add a small delay (50ms) to ensure the browser saves the session cookie
            showPage('dashboard');
            setTimeout(() => {
                fetchStats();
                fetchProfile();
            }, 50);
        }
    });

    forms.profile.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = profileInputs.fullName.value;
        const email = profileInputs.email.value;
        const phone = profileInputs.phone.value;

        const response = await fetch(`${API_URL}/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, phone })
        });

        const data = await response.json();
        showMessage(messages.profile, data.message, response.ok ? 'success' : 'error');
        if (response.ok) {
            fetchProfile();
        }
    });

    forms.verify.addEventListener('submit', async (e) => {
        e.preventDefault();
        const docType = document.getElementById('doc-type').value;
        const docNumber = document.getElementById('doc-number').value;
        const fileInput = document.getElementById('document-file');
        const resultDiv = document.getElementById('result');
        const fileDropArea = document.getElementById('file-drop-area');

        const file = droppedFile || fileInput.files[0];

        if (!file) {
            resultDiv.className = 'mt-6 p-4 text-center text-red-600 bg-red-100 rounded-lg font-semibold';
            resultDiv.textContent = 'Please select a file to upload.';
            return;
        }

        resultDiv.className = 'mt-6 p-4 text-center text-gray-500 bg-gray-100 rounded-lg font-semibold';
        resultDiv.textContent = 'Verifying...';
        document.getElementById('qr-code-display-area').classList.add('hidden');

        try {
            const formData = new FormData();
            formData.append('document', file);
            formData.append('docType', docType);
            formData.append('docNumber', docNumber);

            const response = await fetch(`${API_URL}/verify`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                resultDiv.className = 'mt-6 p-4 text-center text-green-600 bg-green-100 rounded-lg font-semibold';
                resultDiv.textContent = `Document Found and Verified!`;
                fetchStats();

                const qrDisplayArea = document.getElementById('qr-code-display-area');
                const generatedQrCodeImg = document.getElementById('generated-qr-code');
                const qrCodeLinkText = document.getElementById('qr-code-link-text');

                if (data.qrCodeDataUrl) {
                    generatedQrCodeImg.src = data.qrCodeDataUrl;
                    qrCodeLinkText.href = data.qrCodeLink;
                    qrCodeLinkText.textContent = data.qrCodeLink;
                    qrDisplayArea.classList.remove('hidden');
                } else {
                    console.warn("QR Code data URL not received from server.");
                }
            } else {
                resultDiv.className = 'mt-6 p-4 text-center text-red-600 bg-red-100 rounded-lg font-semibold';
                resultDiv.textContent = data.message || 'Document not found or invalid.';
                fetchStats();
            }
        } catch (error) {
            console.error('Error during verification:', error);
            resultDiv.className = 'mt-6 p-4 text-center text-red-600 bg-red-100 rounded-lg font-semibold';
            resultDiv.textContent = 'Could not connect to the server. Please check the console.';
        }

        droppedFile = null;
        resetDropAreaVisuals(fileDropArea);
        fileInput.value = null;
    });

    forms.contact.addEventListener('submit', async (e) => {
        e.preventDefault();
        const subject = document.getElementById('contact-subject').value;
        const message = document.getElementById('contact-message').value;

        const response = await fetch(`${API_URL}/contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, message })
        });

        const data = await response.json();
        showMessage(messages.contact, data.message, response.ok ? 'success' : 'error');
    });

    if (settingsToggles.email) {
        settingsToggles.email.addEventListener('change', async (e) => {
            const response = await fetch(`${API_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailNotifications: e.target.checked })
            });
            if (!response.ok) {
                console.error('Failed to update settings');
            }
        });
    }

    if (settingsToggles.sms) {
        settingsToggles.sms.addEventListener('change', async (e) => {
            const response = await fetch(`${API_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smsNotifications: e.target.checked })
            });
            if (!response.ok) {
                console.error('Failed to update settings');
            }
        });
    }

    // --- 5. EXPOSE FUNCTIONS TO WINDOW SCOPE ---

    window.showPage = showPage;
    window.showDashboardSection = showDashboardSection;
    window.showGuestAuth = showGuestAuth;
    window.showUserLogin = showUserLogin;

    window.showUnlockDetailsModal = window.showAuthModal;
    window.hideQrDisplayArea = hideQrDisplayArea;
    window.showLinkWalletModal = window.showLinkWalletModal;
    window.hideLinkWalletModal = window.hideLinkWalletModal;

    window.handleLogout = handleLogout;
    window.initQrScanner = initQrScanner;

    window.switchGuestTab = (tab) => {
        const signupTab = document.getElementById('signupTab');
        const signinTab = document.getElementById('signinTab');
        const signupForm = document.getElementById('signup-form');
        const signinForm = document.getElementById('signin-form');

        if (tab === 'signup') {
            signupTab.classList.add('bg-blue-600', 'text-white');
            signupTab.classList.remove('text-gray-600');
            signinTab.classList.remove('bg-blue-600', 'text-white');
            signinTab.classList.add('text-gray-600');
            signupForm.classList.remove('hidden');
            signinForm.classList.add('hidden');
        } else {
            signinTab.classList.add('bg-blue-600', 'text-white');
            signinTab.classList.remove('text-gray-600');
            signupTab.classList.remove('bg-blue-600', 'text-white');
            signupTab.classList.add('text-gray-600');
            signinForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
        }
    };
});