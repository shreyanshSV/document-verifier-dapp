// Base URL for API calls
const API_URL = '/api';

// --- Global UI State ---
const state = {
    user: null,
    isAuthenticated: false,
    isLoggedInClient: localStorage.getItem('isLoggedInClient') === 'true'
};

// --- QR Code Scanning Global Variables ---
let html5QrCode = null;
let currentQrScanId = null;
let droppedFile = null;

// --- DOM Elements (Placeholder objects - populated inside DOMContentLoaded) ---
const pages = {};
const forms = {};
const messages = {};
const profileInputs = {};
const statsElements = {};
const settingsToggles = {};

// ----------------------------------------------------------------------
// --- I. CORE GLOBAL/WINDOW FUNCTIONS (DEFINED OUTSIDE DOMContentLoaded FOR HTML) ---
// ----------------------------------------------------------------------

function hideAllPages() {
    Object.values(pages).forEach(page => {
        if (page) page.classList.add('hidden');
    });
}

function showPage(pageId) {
    hideAllPages();
    const page = pages[pageId] || document.getElementById(pageId);
    if (page) {
        page.classList.remove('hidden');
        page.classList.add('fade-in');
    } else {
        console.error("Page element not yet available:", pageId);
    }
}

function showMessage(element, message, type = 'success') {
    if (element) {
        element.textContent = message;
        element.className = `mt-4 text-center font-medium ${type === 'success' ? 'text-green-600' : 'text-red-600'}`;
    }
}

function getWeb3Provider() {
    if (window.ethereum) {
        return window.ethereum;
    }
    return null;
}

// --- Modal Functions (Explicitly defined on window to prevent crash) ---
window.showAuthModal = function() {
    const el = document.getElementById('authModal');
    if (el) el.classList.remove('hidden');
    const status = document.getElementById('modal-status');
    if (status) {
        status.textContent = "Click the button below to connect your wallet and sign the proof message.";
        status.classList.remove('hidden', 'text-red-500', 'text-green-500');
    }
};

window.hideAuthModal = function() {
    const el = document.getElementById('authModal');
    if (el) el.classList.add('hidden');
};

window.showLinkWalletModal = function() {
    const el = document.getElementById('linkWalletModal');
    if (el) el.classList.remove('hidden');
    const s = document.getElementById('link-modal-status');
    if (s) s.classList.add('hidden');
    const linked = document.getElementById('linked-address-display');
    if (linked) linked.classList.add('hidden');
};

window.hideLinkWalletModal = function() {
    const el = document.getElementById('linkWalletModal');
    if (el) el.classList.add('hidden');
    if (typeof fetchProfile === 'function') fetchProfile();
};

// --- Guest Navigation Helpers (CRITICAL FIX: Defined outside DOMContentLoaded) ---
function showGuestAuth() {
    showPage('guestAuthPage');
    if(window.switchGuestTab) window.switchGuestTab('signup');
}

function showUserLogin() {
    showPage('userLoginPage');
}

// --- Dashboard Functions ---
function showDashboardSection(section) {
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach(s => s.classList.add('hidden'));

    if (html5QrCode && html5QrCode.isScanning && section !== 'qrVerification') {
        html5QrCode.stop().then(ignore => {}).catch(err => console.warn("QR scanner stop failed:", err));
    }

    const sectionEl = document.getElementById(`${section}Section`);
    if (sectionEl) {
        sectionEl.classList.remove('hidden');
        sectionEl.classList.add('fade-in');
    }

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

    if (section === 'qrVerification') {
        const qrReaderDiv = document.getElementById('qr-reader');
        const startBtn = document.getElementById('start-scanner-btn');
        const qrScanResultDiv = document.getElementById('qr-scan-result');

        if(qrReaderDiv) qrReaderDiv.classList.add('hidden');
        if(startBtn) startBtn.classList.remove('hidden');
        if(qrScanResultDiv) qrScanResultDiv.classList.add('hidden');

        if(window.initQrScanner) {
            window.initQrScanner(true);
        }
    }
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
                localStorage.setItem('isLoggedInClient', 'false');
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
            if (statsElements.totalVerified) statsElements.totalVerified.textContent = data.totalVerified;
            if (statsElements.successfulVerifications) statsElements.successfulVerifications.textContent = data.successfulVerifications;
            if (statsElements.pendingRequests) statsElements.pendingRequests.textContent = data.pendingRequests;
        }
    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

async function fetchProfile() {
    try {
        const response = await fetch(`${API_URL}/profile`);

        if (response.status === 401) {
            state.isAuthenticated = false;
            localStorage.setItem('isLoggedInClient', 'false');
            showPage('guestPage');
            return;
        }

        if (response.ok) {
            const user = await response.json();
            state.user = user;

            const welcome = document.getElementById('welcome-message');
            if (welcome) welcome.textContent = `Welcome, ${user.fullName}`;

            if (profileInputs.fullName) profileInputs.fullName.value = user.fullName || '';
            if (profileInputs.email) profileInputs.email.value = user.email || '';
            if (profileInputs.phone) profileInputs.phone.value = user.phone || '';

            const pfFull = document.getElementById('profile-fullname');
            const pfEmail = document.getElementById('profile-email');
            if (pfFull) pfFull.textContent = user.fullName;
            if (pfEmail) pfEmail.textContent = user.email;

            const walletDisplay = document.getElementById('profile-wallet');
            if (walletDisplay) {
                const walletAddress = user.walletAddress;
                if (walletAddress) {
                    walletDisplay.textContent = `Wallet: Linked (${walletAddress.substring(0, 6)}...${walletAddress.substring(38)})`;
                    walletDisplay.className = 'text-sm text-green-600 mt-1';
                } else {
                    walletDisplay.textContent = 'Wallet: NOT LINKED (REQUIRED for security)';
                    walletDisplay.className = 'text-sm text-red-600 mt-1';
                }
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
            if (settingsToggles.email) settingsToggles.email.checked = settings.emailNotifications;
            if (settingsToggles.sms) settingsToggles.sms.checked = settings.smsNotifications;
        }
    } catch (error) {
        console.error('Failed to fetch settings:', error);
    }
}

function hideQrDisplayArea() {
    const el = document.getElementById('qr-code-display-area');
    if (el) el.classList.add('hidden');
    const formVerify = forms.verify;
    if (formVerify && typeof formVerify.reset === 'function') formVerify.reset();
    const r = document.getElementById('result');
    if (r) r.textContent = "Awaiting verification...";
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

        if (fileDropArea) {
            fileDropArea.innerHTML = '';
            fileDropArea.appendChild(fileNameElement);

            fileDropArea.classList.remove('border-gray-300', 'border-blue-500', 'bg-blue-50');
            fileDropArea.classList.add('border-green-500', 'bg-green-50');
        }
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const fileDropArea = document.getElementById('file-drop-area');
    if (fileDropArea) {
        fileDropArea.classList.remove('border-gray-300', 'border-green-500', 'bg-green-50');
        fileDropArea.classList.add('border-blue-500', 'bg-blue-50');
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const fileDropArea = document.getElementById('file-drop-area');

    if (fileDropArea && !droppedFile) {
        fileDropArea.classList.remove('border-blue-500', 'bg-blue-50', 'border-green-500', 'bg-green-50');
        fileDropArea.classList.add('border-gray-300');
    }
}

function resetDropAreaVisuals(fileDropArea) {
    if (!fileDropArea) return;
    fileDropArea.innerHTML = `
        <div class="text-gray-400 text-4xl mb-4">📁</div>
        <p class="text-gray-600">Click to upload or drag and drop</p>
    `;
    fileDropArea.classList.remove('border-green-500', 'bg-green-50', 'border-blue-500', 'bg-blue-50');
    fileDropArea.classList.add('border-gray-300');
}

// ----------------------------------------------------
// --- IV. QR SCANNING LOGIC ---
// ----------------------------------------------------

async function initQrScanner(isSilent = false) {
    const qrFileInput = document.getElementById('qr-code-file-input');
    const qrResultMessage = document.getElementById('qr-result-message');
    const qrReaderDiv = document.getElementById('qr-reader');
    const startBtn = document.getElementById('start-scanner-btn');

    const qrScanResult = document.getElementById('qr-scan-result');
    if (qrScanResult) qrScanResult.classList.add('hidden');
    if (qrResultMessage) qrResultMessage.textContent = "";
    const qrDetailedInfo = document.getElementById('qr-detailed-info');
    if (qrDetailedInfo) qrDetailedInfo.classList.add('hidden');
    const unlockBtn = document.getElementById('unlock-details-btn');
    if (unlockBtn) unlockBtn.classList.add('hidden');
    currentQrScanId = null;

    if (typeof Html5Qrcode === 'undefined') {
        if (qrResultMessage) {
            qrResultMessage.className = 'font-medium text-red-600';
            qrResultMessage.textContent = 'Scanner library failed to load. Please try a hard refresh (Ctrl+Shift+R).';
        }
        if (qrScanResult) qrScanResult.classList.remove('hidden');
        return;
    }

    if(!isSilent) {
        if(qrReaderDiv) qrReaderDiv.classList.remove('hidden');
        if(startBtn) startBtn.classList.add('hidden');
    }

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

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
                    if (qrResultMessage) {
                        qrResultMessage.className = 'font-medium text-orange-600';
                        qrResultMessage.textContent = 'Camera failed to start. You can still upload a QR image below.';
                    }
                    if (qrScanResult) qrScanResult.classList.remove('hidden');
                });
            } else {
                console.error("No cameras found on this device. Please upload a QR image.");
                if(qrReaderDiv) qrReaderDiv.classList.add('hidden');
                if(startBtn) startBtn.classList.remove('hidden');
                if (qrResultMessage) {
                    qrResultMessage.className = 'font-medium text-orange-600';
                    qrResultMessage.textContent = 'No camera detected. Please upload a QR image.';
                }
                if (qrScanResult) qrScanResult.classList.remove('hidden');
            }
        }).catch(err => {
            console.error("Error getting camera devices:", err);
        });
    }

    if (qrFileInput) {
        qrFileInput.onchange = (e) => {
            if (e.target.files.length === 0) return;
            const imageFile = e.target.files[0];

            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(ignore => {}).catch(err => console.warn("QR scanner stop failed:", err));
            }

            if (qrResultMessage) {
                qrResultMessage.className = 'font-medium text-gray-700';
                qrResultMessage.textContent = 'Scanning QR image...';
            }
            if (qrScanResult) qrScanResult.classList.remove('hidden');

            html5QrCode.scanFile(imageFile, true)
                .then(decodedText => {
                    console.log(`QR Code from file: ${decodedText}`);
                    handleQrScanResult(decodedText);
                    e.target.value = null;
                })
                .catch(err => {
                    console.error("Error scanning file:", err);
                    if (qrResultMessage) {
                        qrResultMessage.className = 'font-medium text-red-600';
                        qrResultMessage.textContent = "Failed to scan QR code from image. Please ensure it's a valid QR code.";
                    }
                    if (qrScanResult) qrScanResult.classList.remove('hidden');
                });
        };
    }
}

async function handleQrScanResult(qrData) {
    if (html5QrCode && html5QrCode.isScanning) {
        try { html5QrCode.stop(); } catch (e) {}
    }

    const qrScanResultDiv = document.getElementById('qr-scan-result');
    const qrResultMessage = document.getElementById('qr-result-message');
    const qrDetailedInfo = document.getElementById('qr-detailed-info');
    const unlockDetailsBtn = document.getElementById('unlock-details-btn');

    if (qrDetailedInfo) qrDetailedInfo.classList.add('hidden');
    if (unlockDetailsBtn) unlockDetailsBtn.classList.add('hidden');
    if (qrScanResultDiv) qrScanResultDiv.classList.remove('hidden');
    if (qrResultMessage) {
        qrResultMessage.className = 'font-medium text-gray-700';
        qrResultMessage.textContent = 'Scanning successful. Checking verification status...';
    }

    try {
        const url = new URL(qrData);
        const docId = url.searchParams.get('id');

        if (!docId) {
            if (qrResultMessage) {
                qrResultMessage.className = 'font-medium text-red-600';
                qrResultMessage.textContent = 'Invalid QR code data: Missing document ID.';
            }
            return;
        }

        currentQrScanId = docId;

        const response = await fetch(`${API_URL}/qr-check?id=${docId}`);
        const data = await response.json();

        if (response.ok) {
            if (qrResultMessage) {
                qrResultMessage.className = 'font-medium text-green-600';
                qrResultMessage.textContent = `Initial Verification: ${data.verificationStatus}`;
            }

            if (qrDetailedInfo) qrDetailedInfo.classList.remove('hidden');
            const docTypeEl = document.getElementById('qr-doc-type');
            const statusEl = document.getElementById('qr-status');
            const submittedAtEl = document.getElementById('qr-submitted-at');
            if (docTypeEl) docTypeEl.textContent = data.docType || 'N/A';
            if (statusEl) statusEl.textContent = data.verificationStatus || 'N/A';
            if (submittedAtEl) submittedAtEl.textContent = (data.submittedAt ? new Date(data.submittedAt).toLocaleDateString() : 'N/A');

            if (data.verificationStatus === 'Verified' && unlockDetailsBtn) {
                unlockDetailsBtn.classList.remove('hidden');
            }
        } else {
            if (qrResultMessage) {
                qrResultMessage.className = 'font-medium text-red-600';
                qrResultMessage.textContent = data.message || 'Verification failed or document not found.';
            }
        }

    } catch (error) {
        console.error('handleQrScanResult error:', error);
        if (qrResultMessage) {
            qrResultMessage.className = 'font-medium text-red-600';
            qrResultMessage.textContent = 'An error occurred during verification. Please check the console.';
        }
    }
}

// ----------------------------------------------------
// --- V. WEB3 & AUTHENTICATION LOGIC ---
// ----------------------------------------------------

// NOTE: These listeners are now attached inside DOMContentLoaded

// ----------------------------------------------------
// --- VI. FORM HANDLERS (UPDATED for Drag & Drop) ---
// ----------------------------------------------------

// NOTE: These listeners are now attached inside DOMContentLoaded

// ----------------------------------------------------
// --- VII. FINAL INITIALIZATION AND EXPOSURE ---
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', function() {
    // --- 1. POPULATE DOM ELEMENTS (CRITICAL) ---
    pages.guestPage = document.getElementById('guestPage');
    pages.guestAuthPage = document.getElementById('guestAuthPage');
    pages.userLoginPage = document.getElementById('userLoginPage');
    pages.dashboard = document.getElementById('dashboard');

    forms.signup = document.getElementById('signup-form');
    forms.signin = document.getElementById('signin-form');
    forms.userLogin = document.getElementById('user-login-form');
    forms.profile = document.getElementById('profile-form');
    forms.verify = document.getElementById('verify-form');
    forms.contact = document.getElementById('contact-form');

    messages.signup = document.getElementById('signup-message');
    messages.signin = document.getElementById('signin-message');
    messages.userLogin = document.getElementById('user-login-message');
    messages.profile = document.getElementById('profile-message');
    messages.contact = document.getElementById('contact-message-status');

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
        fileDropArea.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', () => {
            droppedFile = null;
            if (fileInput.files && fileInput.files.length > 0) {
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

        fileDropArea.addEventListener('dragover', handleDragOver);
        fileDropArea.addEventListener('dragleave', handleDragLeave);
        fileDropArea.addEventListener('drop', handleDrop);

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

    // --- 4. ATTACH FORM LISTENERS (CRITICAL FIX: Attach after elements exist) ---

    // Web3 Link Wallet Button
    const linkWalletBtn = document.getElementById('link-wallet-btn');
    if (linkWalletBtn) {
        linkWalletBtn.addEventListener('click', async () => {
            const provider = getWeb3Provider();
            const modalStatus = document.getElementById('link-modal-status');
            const linkedAddressDisplay = document.getElementById('linked-address-display');

            if (modalStatus) {
                modalStatus.textContent = "";
                modalStatus.classList.remove('hidden', 'text-red-500', 'text-green-500');
                modalStatus.textContent = "Connecting to MetaMask...";
            }

            if (!provider) {
                if (modalStatus) {
                    modalStatus.textContent = "MetaMask not detected. Please install it.";
                    modalStatus.classList.add('text-red-500');
                }
                return;
            }

            try {
                const accounts = await provider.request({ method: 'eth_requestAccounts' });
                const walletAddress = accounts[0];

                if (modalStatus) modalStatus.textContent = "Wallet connected. Linking address on server...";

                const response = await fetch(`${API_URL}/profile/link-wallet`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress })
                });
                const data = await response.json();

                if (response.ok) {
                    if (modalStatus) {
                        modalStatus.textContent = "Success!";
                        modalStatus.classList.add('text-green-500');
                    }
                    if (linkedAddressDisplay) {
                        linkedAddressDisplay.textContent = `Linked: ${walletAddress}`;
                        linkedAddressDisplay.classList.remove('hidden');
                    }
                    linkWalletBtn.classList.add('hidden');
                } else {
                    if (modalStatus) {
                        modalStatus.textContent = data.message || "Failed to link wallet.";
                        modalStatus.classList.add('text-red-500');
                    }
                }
            } catch (error) {
                if (modalStatus) {
                    modalStatus.textContent = "Connection failed or transaction rejected.";
                    modalStatus.classList.add('text-red-500');
                }
            }
        });
    }

    // Web3 Auth Sign Button
    const authSignBtn = document.getElementById('auth-sign-btn');
    if (authSignBtn) {
        authSignBtn.addEventListener('click', async () => {
            const qrId = currentQrScanId;
            const provider = getWeb3Provider();
            const modalStatus = document.getElementById('modal-status');
            const resultDiv = document.getElementById('qr-scan-result');

            if (modalStatus) {
                modalStatus.textContent = "";
                modalStatus.classList.remove('hidden', 'text-red-500', 'text-green-500');
                modalStatus.textContent = "Connecting to MetaMask...";
            }

            if (!provider) {
                if (modalStatus) {
                    modalStatus.textContent = "MetaMask not detected. Please install it and try again.";
                    modalStatus.classList.add('text-red-500');
                }
                return;
            }

            if (!qrId) {
                if (modalStatus) {
                    modalStatus.textContent = "Error: Document ID missing. Please re-scan the QR code.";
                    modalStatus.classList.add('text-red-500');
                }
                return;
            }

            try {
                const accounts = await provider.request({ method: 'eth_requestAccounts' });
                const walletAddress = accounts[0];

                const message = `Verify ownership of document ID: ${qrId}. Timestamp: ${Date.now()}`;

                if (modalStatus) modalStatus.textContent = "Waiting for signature in MetaMask...";

                const signature = await provider.request({
                    method: 'personal_sign',
                    params: [message, walletAddress],
                });

                if (modalStatus) modalStatus.textContent = "Signature received. Verifying ownership...";

                const response = await fetch(`${API_URL}/qr-verify-signature`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ qrId, walletAddress, signature, message })
                });
                const data = await response.json();

                if (response.ok) {
                    window.hideAuthModal();

                    const documentCID = data.documentCID;
                    const viewUrl = documentCID ? `https://gateway.pinata.cloud/ipfs/${documentCID}` : '#';

                    const linkBaseClass = "px-4 py-2 bg-green-600 text-white font-semibold rounded-md shadow-md hover:bg-green-700 inline-block";
                    let viewLinkHtml;
                    if (documentCID) {
                        viewLinkHtml = `<a href="${viewUrl}" target="_blank" class="${linkBaseClass}">View Document</a>`;
                    } else {
                        viewLinkHtml = `<a href="#" onclick="event.preventDefault(); alert('Document file not found on IPFS.');" class="${linkBaseClass} opacity-50 cursor-not-allowed">View Document</a>`;
                    }

                    const qrDetailedInfoEl = document.getElementById('qr-detailed-info');
                    if (qrDetailedInfoEl) {
                        qrDetailedInfoEl.innerHTML = `
                            <p class="text-md font-bold text-green-700 mb-2">✅ ${data.message}</p>
                            <p class="text-sm text-gray-600"><strong>Document Type:</strong> ${data.docType}</p>
                            <p class="text-sm text-gray-600"><strong>Document Number:</strong> ${data.docNumber}</p>

                            <div class="mt-4">
                                ${viewLinkHtml}
                            </div>

                            <p class="text-sm text-gray-600 mt-3 break-all"><strong>File Hash (SHA3):</strong> ${data.fileHash}</p>
                            <p class="text-sm text-gray-600 break-all"><strong>Blockchain TX Hash:</strong> <a href="https://sepolia.etherscan.io/tx/${data.transactionHash}" target="_blank" class="text-blue-500 hover:underline">${data.transactionHash}</a></p>
                        `;
                        qrDetailedInfoEl.classList.remove('hidden');
                    }

                    const unlockBtn = document.getElementById('unlock-details-btn');
                    if (unlockBtn) unlockBtn.classList.add('hidden');

                    if (resultDiv) resultDiv.classList.remove('hidden');
                } else {
                    if (modalStatus) {
                        modalStatus.textContent = data.message || "Signature Verification Failed on Server.";
                        modalStatus.classList.add('text-red-500');
                    }
                }
            } catch (error) {
                if (modalStatus) {
                    modalStatus.textContent = "Authentication failed (User rejected or network error).";
                    modalStatus.classList.add('text-red-500');
                }
            }
        });
    }

    // --- Signup/Signin/Profile Handlers ---
    if (forms.signup) {
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
    }

    if (forms.signin) {
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
                localStorage.setItem('isLoggedInClient', 'true');
                showPage('dashboard');
                setTimeout(() => {
                    fetchStats();
                    fetchProfile();
                }, 50);
            }
        });
    }

    if (forms.userLogin) {
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
                localStorage.setItem('isLoggedInClient', 'true');
                showPage('dashboard');
                setTimeout(() => {
                    fetchStats();
                    fetchProfile();
                }, 50);
            }
        });
    }

    if (forms.profile) {
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
    }

    if (forms.verify) {
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
                    resultDiv.textContent = data.message || `Document Found and Verified!`;
                    fetchStats();

                    const qrDisplayArea = document.getElementById('qr-code-display-area');
                    const generatedQrCodeImg = document.getElementById('generated-qr-code');
                    const qrCodeLinkText = document.getElementById('qr-code-link-text');
                    const qrHeader = document.querySelector('#qr-code-display-area h3');
                    const qrParagraph = document.querySelector('#qr-code-display-area p');

                    if (qrDisplayArea) qrDisplayArea.classList.remove('hidden');

                    if (data.qrCodeDataUrl) {
                        if (generatedQrCodeImg) generatedQrCodeImg.src = data.qrCodeDataUrl;
                        if (qrHeader) qrHeader.textContent = "Verification Complete!";
                        if (qrParagraph) qrParagraph.textContent = "Your document has been verified. Use this QR code for quick re-verification.";

                        if (qrCodeLinkText) {
                            qrCodeLinkText.href = data.qrCodeLink;
                            qrCodeLinkText.textContent = data.qrCodeLink;
                        }
                    } else if (data.qrCodeLink) {
                        if (generatedQrCodeImg) generatedQrCodeImg.src = '';
                        if (qrHeader) qrHeader.textContent = "Document Already Verified";
                        if (qrParagraph) qrParagraph.textContent = "Permanent link available below. Scan it using your QR app.";

                        if (qrCodeLinkText) {
                            qrCodeLinkText.href = data.qrCodeLink;
                            qrCodeLinkText.textContent = data.qrCodeLink;
                        }
                    } else {
                        if (qrDisplayArea) qrDisplayArea.classList.add('hidden');
                        console.warn("No QR Code link or data received from server.");
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
    }

    if (forms.contact) {
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
    }

    if (settingsToggles.email) {
        settingsToggles.email.addEventListener('change', async (e) => {
            const response = await fetch(`${API_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailNotifications: e.target.checked })
            });
            if (!response.ok) { console.error('Failed to update settings'); }
        });
    }

    if (settingsToggles.sms) {
        settingsToggles.sms.addEventListener('change', async (e) => {
            const response = await fetch(`${API_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smsNotifications: e.target.checked })
            });
            if (!response.ok) { console.error('Failed to update settings'); }
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
            if (signupTab) signupTab.classList.add('bg-blue-600', 'text-white');
            if (signupTab) signupTab.classList.remove('text-gray-600');
            if (signinTab) signinTab.classList.remove('bg-blue-600', 'text-white');
            if (signinTab) signinTab.classList.add('text-gray-600');
            if (signupForm) signupForm.classList.remove('hidden');
            if (signinForm) signinForm.classList.add('hidden');
        } else {
            if (signinTab) signinTab.classList.add('bg-blue-600', 'text-white');
            if (signinTab) signinTab.classList.remove('text-gray-600');
            if (signupTab) signupTab.classList.remove('bg-blue-600', 'text-white');
            if (signupTab) signupTab.classList.add('text-gray-600');
            if (signinForm) signinForm.classList.remove('hidden');
            if (signupForm) signupForm.classList.add('hidden');
        }
    };
});

// ===== CRITICAL FIX: Ensure functions are available globally =====
window.showGuestAuth = showGuestAuth;
window.showUserLogin = showUserLogin;
