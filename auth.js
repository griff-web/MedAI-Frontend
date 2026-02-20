/**
 * MedAI Authentication Module
 * Handles login, registration, password reset, and token management
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
    API_BASE: window.ENV_API_BASE || "https://m-backend-n2pd.onrender.com",
    GOOGLE_CLIENT_ID: window.ENV_GOOGLE_CLIENT_ID,
    TOKEN_KEY: "medai_token",
    USER_KEY: "medai_user",
    REMEMBER_KEY: "medai_remember",
    AUTH_EVENT: "medai-auth-changed",
    ROUTES: {
        DASHBOARD: "/dash.html",
        LOGIN: "/login.html",
        REGISTER: "/reg.html",
        FORGOT_PASSWORD: "/forgot-password.html"
    }
};

// ==================== STATE MANAGEMENT ====================
const AuthState = {
    currentUser: null,
    token: null,
    isAuthenticated: false,

    init() {
        this.loadFromStorage();
        this.setupAuthListener();
        return this;
    },

    loadFromStorage() {
        try {
            // Check for remembered session first
            const remember = localStorage.getItem(CONFIG.REMEMBER_KEY) === 'true';
            const storage = remember ? localStorage : sessionStorage;
            
            this.token = storage.getItem(CONFIG.TOKEN_KEY);
            const userJson = storage.getItem(CONFIG.USER_KEY);
            
            if (this.token && userJson) {
                this.currentUser = JSON.parse(userJson);
                this.isAuthenticated = true;
                
                // Validate token with server (silent)
                this.validateToken().catch(() => {
                    // Token invalid, clear storage
                    this.clear();
                });
            }
        } catch (error) {
            console.error("Failed to load auth state:", error);
            this.clear();
        }
    },

    async validateToken() {
        if (!this.token) return false;
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                this.clear();
                return false;
            }
            
            const data = await response.json();
            this.currentUser = data.user;
            return true;
        } catch (error) {
            console.error("Token validation failed:", error);
            return false;
        }
    },

    save(remember = false) {
        try {
            const storage = remember ? localStorage : sessionStorage;
            storage.setItem(CONFIG.TOKEN_KEY, this.token);
            storage.setItem(CONFIG.USER_KEY, JSON.stringify(this.currentUser));
            storage.setItem(CONFIG.REMEMBER_KEY, remember);
            
            // Dispatch auth event
            window.dispatchEvent(new CustomEvent(CONFIG.AUTH_EVENT, {
                detail: { authenticated: true, user: this.currentUser }
            }));
        } catch (error) {
            console.error("Failed to save auth state:", error);
        }
    },

    clear() {
        // Clear all storages
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
        localStorage.removeItem(CONFIG.REMEMBER_KEY);
        sessionStorage.removeItem(CONFIG.TOKEN_KEY);
        sessionStorage.removeItem(CONFIG.USER_KEY);
        
        this.currentUser = null;
        this.token = null;
        this.isAuthenticated = false;
        
        // Dispatch auth event
        window.dispatchEvent(new CustomEvent(CONFIG.AUTH_EVENT, {
            detail: { authenticated: false }
        }));
    },

    setupAuthListener() {
        window.addEventListener('storage', (event) => {
            if (event.key === CONFIG.TOKEN_KEY || event.key === CONFIG.USER_KEY) {
                this.loadFromStorage();
            }
        });
    }
};

// ==================== UI NOTIFICATION SYSTEM ====================
const Notification = {
    element: null,
    timeout: null,

    init() {
        this.element = document.getElementById('notification');
        return this;
    },

    show(message, type = 'info', duration = 5000) {
        if (!this.element) {
            console.warn("Notification element not found");
            return;
        }

        // Clear existing timeout
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        // Set message and class
        this.element.textContent = message;
        this.element.className = `notification visible ${type}`;
        
        // Auto-hide
        this.timeout = setTimeout(() => {
            this.element.classList.remove('visible');
        }, duration);
    },

    hide() {
        if (this.element) {
            this.element.classList.remove('visible');
        }
    }
};

// ==================== FORM VALIDATION ====================
const Validators = {
    email(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    },

    password(password) {
        return {
            valid: password.length >= 8,
            message: "Password must be at least 8 characters"
        };
    },

    name(name) {
        return {
            valid: name.length >= 2 && name.length <= 50,
            message: "Name must be between 2 and 50 characters"
        };
    },

    match(password, confirm) {
        return {
            valid: password === confirm,
            message: "Passwords do not match"
        };
    }
};

// ==================== API CLIENT ====================
const API = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE}${endpoint}`;
        
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Add auth token if available
        if (AuthState.token) {
            defaultHeaders['Authorization'] = `Bearer ${AuthState.token}`;
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw {
                    status: response.status,
                    message: data.message || 'Request failed',
                    code: data.code,
                    data
                };
            }

            return data;
        } catch (error) {
            if (error.status === 401) {
                // Token expired or invalid
                AuthState.clear();
                redirectToLogin();
            }
            throw error;
        }
    },

    // Auth endpoints
    auth: {
        async login(email, password) {
            return API.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
        },

        async register(userData) {
            return API.request('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        },

        async forgotPassword(email) {
            return API.request('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
        },

        async resetPassword(token, newPassword) {
            return API.request('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, newPassword })
            });
        },

        async getProfile() {
            return API.request('/auth/me');
        }
    }
};

// ==================== GOOGLE SIGN-IN ====================
const GoogleAuth = {
    initialized: false,

    init() {
        if (!CONFIG.GOOGLE_CLIENT_ID || typeof google === 'undefined') {
            console.warn("Google Sign-In not available");
            return;
        }

        if (this.initialized) return;

        google.accounts.id.initialize({
            client_id: CONFIG.GOOGLE_CLIENT_ID,
            callback: this.handleCredentialResponse.bind(this),
            auto_select: false,
            cancel_on_tap_outside: true
        });

        this.initialized = true;
    },

    renderButton(elementId) {
        if (!this.initialized) this.init();
        
        google.accounts.id.renderButton(
            document.getElementById(elementId),
            {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left'
            }
        );
    },

    async handleCredentialResponse(response) {
        try {
            Notification.show('Authenticating with Google...', 'info');
            
            // Decode JWT to get user info
            const userInfo = this.parseJwt(response.credential);
            
            // Send to your backend
            const result = await API.request('/auth/google', {
                method: 'POST',
                body: JSON.stringify({
                    token: response.credential,
                    email: userInfo.email,
                    name: userInfo.name
                })
            });

            // Save auth state
            AuthState.token = result.token;
            AuthState.currentUser = result.user;
            AuthState.save(document.getElementById('remember')?.checked || false);
            
            Notification.show('Login successful! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = CONFIG.ROUTES.DASHBOARD;
            }, 1000);
            
        } catch (error) {
            console.error("Google auth failed:", error);
            Notification.show(
                error.message || 'Google authentication failed',
                'error'
            );
        }
    },

    parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error("Failed to parse JWT:", e);
            return {};
        }
    }
};

// ==================== PASSWORD VISIBILITY TOGGLE ====================
function setupPasswordToggle() {
    const toggleButtons = document.querySelectorAll('.toggle-password');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', function() {
            const wrapper = this.closest('.password-wrapper');
            const input = wrapper?.querySelector('input');
            
            if (input) {
                const type = input.type === 'password' ? 'text' : 'password';
                input.type = type;
                
                // Update icon/text
                const icon = this.querySelector('i');
                if (icon) {
                    icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
                } else {
                    this.textContent = type === 'password' ? 'Show' : 'Hide';
                }
            }
        });
    });
}

// ==================== REDIRECTION HELPER ====================
function redirectToDashboard() {
    window.location.href = CONFIG.ROUTES.DASHBOARD;
}

function redirectToLogin() {
    window.location.href = CONFIG.ROUTES.LOGIN;
}

function redirectToForgotPassword() {
    window.location.href = CONFIG.ROUTES.FORGOT_PASSWORD;
}

// ==================== LOGIN PAGE HANDLER ====================
function initLoginPage() {
    const form = document.getElementById('form-login');
    if (!form) return;

    // Check if already authenticated
    if (AuthState.isAuthenticated) {
        redirectToDashboard();
        return;
    }

    // Initialize Google Sign-In
    if (document.getElementById('google-signin-btn')) {
        GoogleAuth.renderButton('google-signin-btn');
    }

    // Password toggle
    setupPasswordToggle();

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember')?.checked || false;

        // Validate inputs
        if (!Validators.email(email)) {
            Notification.show('Please enter a valid email address', 'error');
            return;
        }

        if (!password) {
            Notification.show('Please enter your password', 'error');
            return;
        }

        // Show loading state
        const submitBtn = document.getElementById('loginBtn');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
        Notification.show('Authenticating...', 'info');

        try {
            const result = await API.auth.login(email, password);
            
            // Save auth state
            AuthState.token = result.token;
            AuthState.currentUser = result.user;
            AuthState.save(remember);
            
            Notification.show('Login successful! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = CONFIG.ROUTES.DASHBOARD;
            }, 1000);
            
        } catch (error) {
            console.error("Login failed:", error);
            
            let errorMessage = 'Login failed. Please try again.';
            
            if (error.code === 'INVALID_CREDENTIALS') {
                errorMessage = 'Invalid email or password';
            } else if (error.code === 'ACCOUNT_DEACTIVATED') {
                errorMessage = 'Your account has been deactivated';
            } else if (error.code === 'VALIDATION_ERROR') {
                errorMessage = 'Please check your inputs';
            }
            
            Notification.show(errorMessage, 'error');
            
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// ==================== REGISTRATION PAGE HANDLER ====================
function initRegisterPage() {
    const form = document.getElementById('form-register');
    if (!form) return;

    // Initialize Google Sign-In
    if (document.getElementById('google-signin-btn')) {
        GoogleAuth.renderButton('google-signin-btn');
    }

    // Password toggle
    setupPasswordToggle();

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullname = document.getElementById('fullname')?.value.trim();
        const email = document.getElementById('email')?.value.trim();
        const role = document.getElementById('role')?.value || 'user';
        const password = document.getElementById('password')?.value;
        const terms = document.getElementById('terms')?.checked;

        // Validate inputs
        const nameValidation = Validators.name(fullname);
        if (!nameValidation.valid) {
            Notification.show(nameValidation.message, 'error');
            return;
        }

        if (!Validators.email(email)) {
            Notification.show('Please enter a valid email address', 'error');
            return;
        }

        const passwordValidation = Validators.password(password);
        if (!passwordValidation.valid) {
            Notification.show(passwordValidation.message, 'error');
            return;
        }

        if (!terms) {
            Notification.show('You must agree to the Terms and Privacy Policy', 'error');
            return;
        }

        // Show loading state
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';
        Notification.show('Creating your account...', 'info');

        try {
            const result = await API.auth.register({
                name: fullname,
                email,
                password,
                role
            });
            
            // Save auth state
            AuthState.token = result.token;
            AuthState.currentUser = result.user;
            AuthState.save(false); // Don't remember by default for new accounts
            
            Notification.show('Account created successfully! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = CONFIG.ROUTES.DASHBOARD;
            }, 1000);
            
        } catch (error) {
            console.error("Registration failed:", error);
            
            let errorMessage = 'Registration failed. Please try again.';
            
            if (error.code === 'USER_EXISTS' || error.code === 'DUPLICATE_EMAIL') {
                errorMessage = 'An account with this email already exists';
            } else if (error.code === 'PASSWORD_TOO_SHORT') {
                errorMessage = 'Password must be at least 8 characters';
            } else if (error.code === 'VALIDATION_ERROR') {
                errorMessage = 'Please check your inputs';
            }
            
            Notification.show(errorMessage, 'error');
            
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// ==================== FORGOT PASSWORD PAGE HANDLER ====================
function initForgotPasswordPage() {
    const form = document.getElementById('passwordResetForm');
    const successState = document.getElementById('success-state');
    
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email')?.value.trim();

        if (!Validators.email(email)) {
            Notification.show('Please enter a valid email address', 'error');
            return;
        }

        // Show loading state
        const submitBtn = document.getElementById('resetBtn');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        Notification.show('Sending reset link...', 'info');

        try {
            const result = await API.auth.forgotPassword(email);
            
            // Show success state
            if (successState) {
                const emailDisplay = document.getElementById('user-email-display');
                if (emailDisplay) {
                    emailDisplay.textContent = email;
                }
                
                form.closest('.auth-card').classList.add('hidden');
                successState.classList.remove('hidden');
            }
            
            Notification.show('Reset link sent! Check your email.', 'success');
            
        } catch (error) {
            console.error("Password reset request failed:", error);
            
            // Always show success for security (don't reveal if email exists)
            if (successState) {
                const emailDisplay = document.getElementById('user-email-display');
                if (emailDisplay) {
                    emailDisplay.textContent = email;
                }
                
                form.closest('.auth-card').classList.add('hidden');
                successState.classList.remove('hidden');
            }
            
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// ==================== PROTECTED ROUTES CHECK ====================
function checkProtectedRoute() {
    const currentPath = window.location.pathname;
    const protectedRoutes = [CONFIG.ROUTES.DASHBOARD];
    
    // Check if current path is protected
    const isProtected = protectedRoutes.some(route => 
        currentPath.endsWith(route)
    );
    
    if (isProtected && !AuthState.isAuthenticated) {
        // Store intended destination
        sessionStorage.setItem('redirectAfterLogin', currentPath);
        redirectToLogin();
        return false;
    }
    
    return true;
}

// ==================== DASHBOARD INTEGRATION ====================
// This function will be called from dash.js to get the token
window.MedAI = {
    getToken: () => AuthState.token,
    getUser: () => AuthState.currentUser,
    isAuthenticated: () => AuthState.isAuthenticated,
    logout: () => {
        AuthState.clear();
        redirectToLogin();
    },
    onAuthChange: (callback) => {
        window.addEventListener(CONFIG.AUTH_EVENT, (e) => callback(e.detail));
    },
    api: API
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize core modules
    AuthState.init();
    Notification.init();
    
    // Check protected routes
    checkProtectedRoute();
    
    // Initialize appropriate page handler based on current page
    const path = window.location.pathname;
    
    if (path.includes('login.html')) {
        initLoginPage();
    } else if (path.includes('reg.html')) {
        initRegisterPage();
    } else if (path.includes('forgot-password.html')) {
        initForgotPasswordPage();
    }
    
    // Setup global error handler for unhandled promises
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        Notification.show('An unexpected error occurred', 'error');
    });
});

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthState, API, Notification };
}
