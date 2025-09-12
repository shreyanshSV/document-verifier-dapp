// Base URL for API calls
const API_URL = '/api'; // Changed to a relative path


// --- Global UI State ---
const state = {
    user: null,
    isAuthenticated: false
};


// --- DOM Elements ---
const pages = {
    guestPage: document.getElementById('guestPage'),
    guestAuthPage: document.getElementById('guestAuthPage'),
    userLoginPage: document.getElementById('userLoginPage'),
    dashboard: document.getElementById('dashboard')
};


const forms = {
    signup: document.getElementById('signup-form'),
    signin: document.getElementById('signin-form'),
    userLogin: document.getElementById('user-login-form'),
    profile: document.getElementById('profile-form'),
    verify: document.getElementById('verify-form'),
    contact: document.getElementById('contact-form')
};


const messages = {
    signup: document.getElementById('signup-message'),
    signin: document.getElementById('signin-message'),
    userLogin: document.getElementById('user-login-message'),
    profile: document.getElementById('profile-message'),
    contact: document.getElementById('contact-message-status')
};


const profileInputs = {
    fullName: document.getElementById('profile-edit-fullname'),
    email: document.getElementById('profile-edit-email'),
    phone: document.getElementById('profile-edit-phone')
};


const statsElements = {
    totalVerified: document.getElementById('total-verified'),
    successfulVerifications: document.getElementById('successful-verifications'),
    pendingRequests: document.getElementById('pending-requests')
};


const settingsToggles = {
    email: document.getElementById('email-toggle'),
    sms: document.getElementById('sms-toggle')
};




// --- UI Navigation Functions ---


function hideAllPages() {
    Object.values(pages).forEach(page => page.classList.add('hidden'));
}


function showPage(pageId) {
    hideAllPages();
    pages[pageId].classList.remove('hidden');
    pages[pageId].classList.add('fade-in');
}


function showDashboardSection(section) {
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach(s => s.classList.add('hidden'));
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
}


// --- General Utility Functions ---


function showMessage(element, message, type = 'success') {
    element.textContent = message;
    element.className = `mt-4 text-center font-medium ${type === 'success' ? 'text-green-600' : 'text-red-600'}`;
}


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
        if (response.ok) {
            const user = await response.json();
            state.user = user;
            document.getElementById('welcome-message').textContent = `Welcome, ${user.fullName}`;
            profileInputs.fullName.value = user.fullName || '';
            profileInputs.email.value = user.email || '';
            profileInputs.phone.value = user.phone || ''; // This will now work
            document.getElementById('profile-fullname').textContent = user.fullName;
            document.getElementById('profile-email').textContent = user.email;
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


// --- Form and Button Handlers ---


forms.signup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-fullname').value;
    const email = document.getElementById('signup-email').value;
    const phone = document.getElementById('signup-phone').value;
    const password = document.getElementById('signup-password').value;


    const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, password }) // Phone is now correctly sent
    });


    const data = await response.json();
    showMessage(messages.signup, data.message, response.ok ? 'success' : 'error');
    if (response.ok) {
        setTimeout(() => switchGuestTab('signin'), 1000);
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
        showPage('dashboard');
        fetchStats();
        fetchProfile();
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
        showPage('dashboard');
        fetchStats();
        fetchProfile();
    }
});


forms.profile.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = profileInputs.fullName.value;
    const email = profileInputs.email.value;
    const phone = profileInputs.phone.value; // This is now correctly handled by the server


    const response = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone })
    });


    const data = await response.json();
    showMessage(messages.profile, data.message, response.ok ? 'success' : 'error');
    if (response.ok) {
        fetchProfile(); // Refresh profile data
    }
});


forms.verify.addEventListener('submit', async (e) => {
    e.preventDefault();
    const docType = document.getElementById('doc-type').value;
    const docNumber = document.getElementById('doc-number').value;
    const fileInput = document.getElementById('document-file');
    const resultDiv = document.getElementById('result');


    const file = fileInput.files[0];
    if (!file) {
        resultDiv.className = 'mt-6 p-4 text-center text-red-600 bg-red-100 rounded-lg font-semibold';
        resultDiv.textContent = 'Please select a file to upload.';
        return;
    }


    resultDiv.className = 'mt-6 p-4 text-center text-gray-500 bg-gray-100 rounded-lg font-semibold';
    resultDiv.textContent = 'Verifying...';


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
            resultDiv.textContent = `Document Found! Status: ${data.verificationStatus}`;
            fetchStats();
        } else {
            resultDiv.className = 'mt-6 p-4 text-center text-red-600 bg-red-100 rounded-lg font-semibold';
            resultDiv.textContent = data.message || 'Document not found.';
            fetchStats();
        }
    } catch (error) {
        console.error('Error during verification:', error);
        resultDiv.className = 'mt-6 p-4 text-center text-red-600 bg-red-100 rounded-lg font-semibold';
        resultDiv.textContent = 'Could not connect to the server. Please check the console.';
    }
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




// ✅ **FIXED**: Replaced the old function with this new async version
async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            // Call the server to destroy the session
            const response = await fetch(`${API_URL}/auth/logout`, { method: 'POST' });
            const data = await response.json();


            if (response.ok) {
                state.isAuthenticated = false;
                state.user = null;
                showPage('guestPage'); // Redirect to home
                // Optional: alert the user
                // alert(data.message || 'Logged out successfully!');
            } else {
                alert('Logout failed. Please try again.');
            }
        } catch (error) {
            console.error('Logout error:', error);
            alert('Could not connect to server to log out.');
        }
    }
}


// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', function() {
    const fileDropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('document-file');


    fileDropArea.addEventListener('click', () => {
        fileInput.click();
    });


    // Check if user is already authenticated (in case of page refresh)
    // This is a simple check; a real app would have more robust session validation
    if (state.isAuthenticated) {
        showPage('dashboard');
        fetchStats();
        fetchProfile();
    } else {
        showPage('guestPage');
    }


    // Set up navigation for the guest and user login pages
    window.showGuestPage = () => showPage('guestPage');
    window.showGuestAuth = () => showPage('guestAuthPage');
    window.showUserLogin = () => showPage('userLoginPage');
    window.showDashboard = () => {
        showPage('dashboard');
        fetchStats();
        fetchProfile();
    };
    window.handleLogout = handleLogout;
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
    window.showDashboardSection = showDashboardSection;
});
