/**
 * MedAI Enterprise Authentication Engine v2.0.0
 * Now with Google OAuth support and enterprise-grade security
 */
(() => {
    "use strict";

    const CONFIG = {
        API_BASE: window.ENV_API_BASE || "https://m-backend-n2pd.onrender.com",
        ENDPOINTS: {
            login: "/auth/login",
            register: "/auth/register",
            google: "/auth/google"
        },
        REDIRECT_PATH: "dash.html",
        NOTIF_DURATION: 5000,
        REQUEST_TIMEOUT: 25000,
        GOOGLE_CLIENT_ID: window.ENV_GOOGLE_CLIENT_ID || "<YOUR_GOOGLE_CLIENT_ID>"
    };

    class NotificationManager {
        constructor(id) {
            this.el = document.getElementById(id);
            this.timer = null;
        }

        show(msg, type = "info") {
            if (!this.el) return;
            clearTimeout(this.timer);

            const styles = {
                success: { icon: "✓", class: "success" },
                error: { icon: "✕", class: "error" },
                warning: { icon: "⚠", class: "warning" },
                info: { icon: "ℹ", class: "info" }
            };

            const style = styles[type] || styles.info;
            this.el.innerHTML = `<span>${style.icon}</span> ${msg}`;
            this.el.className = `notification show ${style.class}`;
            this.el.style.display = "flex";

            if (type !== 'persistent') {
                this.timer = setTimeout(() => this.hide(), CONFIG.NOTIF_DURATION);
            }
        }

        hide() {
            if (!this.el) return;
            this.el.classList.add("fade-out");
            setTimeout(() => {
                this.el.style.display = "none";
                this.el.classList.remove("fade-out", "show");
            }, 500);
        }
    }

    const notifier = new NotificationManager("notification");

    const AuthApp = {
        init() {
            console.log("🚀 MedAI Engine: Auto-Connect Mode Active");
            this.handleAutoRedirect();
            this.bindEvents();
            this.initPasswordToggles();
            this.initGoogleSignIn();
        },

        handleAutoRedirect() {
            const token = localStorage.getItem("medai_token");
            if (token && (window.location.pathname.includes('login') || window.location.pathname === '/')) {
                window.location.href = CONFIG.REDIRECT_PATH;
            }
        },

        initPasswordToggles() {
            document.querySelectorAll(".toggle-password").forEach(btn => {
                btn.onclick = (e) => {
                    const group = e.target.closest('.form-group');
                    if (!group) return;
                    const input = group.querySelector('input');
                    const isPass = input.type === "password";
                    input.type = isPass ? "text" : "password";
                    btn.innerHTML = isPass ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
                };
            });
        },

        async postData(endpoint, payload) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

            try {
                const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(id);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || `System error: ${response.status}`);
                }

                if (result.token) {
                    localStorage.setItem("medai_token", result.token);
                    localStorage.setItem("medai_user", JSON.stringify(result.user));
                }

                return result;
            } catch (err) {
                if (err.name === 'AbortError') {
                    throw new Error("Connection timeout. The secure server is waking up, please try again in 5 seconds.");
                }
                throw err;
            }
        },

        bindEvents() {
            // LOGIN HANDLER
            document.getElementById("form-login")?.addEventListener("submit", async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const payload = {
                    email: e.target.email.value.trim().toLowerCase(),
                    password: e.target.password.value
                };

                try {
                    this.toggleLoading(btn, true, "Authenticating...");
                    await this.postData(CONFIG.ENDPOINTS.login, payload);
                    notifier.show("Access Granted. Synchronizing...", "success");
                    setTimeout(() => window.location.href = CONFIG.REDIRECT_PATH, 1000);
                } catch (err) {
                    notifier.show(err.message, "error");
                    this.toggleLoading(btn, false);
                }
            });

            // REGISTER HANDLER
            document.getElementById("form-register")?.addEventListener("submit", async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');

                const payload = {
                    name: (e.target.fullname || e.target.name).value.trim(),
                    email: e.target.email.value.trim().toLowerCase(),
                    password: e.target.password.value,
                    role: e.target.role?.value || "user"
                };

                if (payload.password.length < 6) {
                    return notifier.show("Password must be at least 6 characters.", "warning");
                }

                try {
                    this.toggleLoading(btn, true, "Initializing Profile...");
                    await this.postData(CONFIG.ENDPOINTS.register, payload);
                    notifier.show("Account Ready. Welcome!", "success");
                    setTimeout(() => window.location.href = CONFIG.REDIRECT_PATH, 1200);
                } catch (err) {
                    notifier.show(err.message, "error");
                    this.toggleLoading(btn, false);
                }
            });
        },

        toggleLoading(btn, isLoading, text = "Processing...") {
            if (!btn) return;
            if (isLoading) {
                btn.disabled = true;
                btn.dataset.prev = btn.innerHTML;
                btn.innerHTML = `<span class="loader"></span> ${text}`;
            } else {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.prev || "Continue";
            }
        },

        // ===== GOOGLE OAUTH =====
        initGoogleSignIn() {
            if (!window.google) {
                console.warn("Google API not loaded. Add <script src='https://accounts.google.com/gsi/client' async defer></script> in HTML.");
                return;
            }

            google.accounts.id.initialize({
                client_id: CONFIG.GOOGLE_CLIENT_ID,
                callback: async (response) => {
                    try {
                        this.toggleLoading(null, true, "Signing in with Google...");
                        await this.postData(CONFIG.ENDPOINTS.google, { idToken: response.credential });
                        notifier.show("Google Sign-In Successful!", "success");
                        setTimeout(() => window.location.href = CONFIG.REDIRECT_PATH, 800);
                    } catch (err) {
                        notifier.show(err.message, "error");
                        this.toggleLoading(null, false);
                    }
                }
            });

            // Render button if container exists
            const btnContainer = document.getElementById("google-signin-btn");
            if (btnContainer) {
                google.accounts.id.renderButton(btnContainer, {
                    theme: "outline",
                    size: "large",
                    width: "100%"
                });
            }

            google.accounts.id.prompt(); // optional auto-popup
        }
    };

    document.addEventListener("DOMContentLoaded", () => AuthApp.init());
})();
