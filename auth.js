/**
 * MedAI Enterprise Authentication Engine v3.3.0
 * Features: Multi-role support, AbortController timeouts, Session persistence
 */
(() => {
    "use strict";

    const CONFIG = {
        API_BASE: "https://bug-free-space-adventure-695gv4gqwv6wh44j7-4000.app.github.dev",
        ENDPOINTS: {
            health: "/health",
            login: "/auth/login",
            register: "/auth/register",
            reset: "/auth/reset"
        },
        REDIRECT_PATH: "dash.html",
        NOTIF_DURATION: 5000,
        REQUEST_TIMEOUT: 12000
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
        isServerOnline: false,

        async init() {
            console.log("🚀 MedAI Engine Online");
            this.handleAutoRedirect();
            this.bindEvents();
            this.initPasswordToggles();
            await this.checkServerHealth();
        },

        // If already logged in, skip the login page
        handleAutoRedirect() {
            const token = localStorage.getItem("medai_token");
            if (token && (window.location.pathname.includes('login') || window.location.pathname === '/')) {
                window.location.href = CONFIG.REDIRECT_PATH;
            }
        },

        async checkServerHealth() {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(`${CONFIG.API_BASE}${CONFIG.ENDPOINTS.health}`, { 
                    method: 'GET',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (response.ok) {
                    this.isServerOnline = true;
                    this.setUIReadyState(true);
                }
            } catch (err) {
                this.isServerOnline = false;
                this.setUIReadyState(false);
                notifier.show("System link failed. Verify Backend visibility on Port 4000.", "error");
            }
        },

        setUIReadyState(isReady) {
            document.querySelectorAll('button[type="submit"]').forEach(btn => {
                btn.disabled = !isReady;
            });
        },

        initPasswordToggles() {
            document.querySelectorAll(".toggle-password").forEach(btn => {
                btn.onclick = (e) => {
                    const input = e.target.closest('.form-group').querySelector('input');
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
                    headers: { 
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(id);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || `Protocol Error: ${response.status}`);
                }

                if (result.token) {
                    localStorage.setItem("medai_token", result.token);
                    localStorage.setItem("medai_user", JSON.stringify(result.user));
                }

                return result;
            } catch (err) {
                if (err.name === 'AbortError') throw new Error("Server took too long to respond.");
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
                    this.toggleLoading(btn, true, "Verifying...");
                    await this.postData(CONFIG.ENDPOINTS.login, payload);
                    notifier.show("Welcome back. Redirecting...", "success");
                    setTimeout(() => window.location.href = CONFIG.REDIRECT_PATH, 1000);
                } catch (err) {
                    notifier.show(err.message, "error");
                    this.toggleLoading(btn, false);
                }
            });

            // REGISTER HANDLER (Synchronized to work like login)
            document.getElementById("form-register")?.addEventListener("submit", async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                
                // CRITICAL: Check your HTML names. Use e.target.name.value
                const payload = {
                    name: (e.target.fullname || e.target.name).value.trim(),
                    email: e.target.email.value.trim().toLowerCase(),
                    password: e.target.password.value,
                    role: e.target.role?.value || "user"
                };

                if (payload.password.length < 6) {
                    return notifier.show("Security requirement: Password must be 6+ characters.", "warning");
                }

                try {
                    this.toggleLoading(btn, true, "Provisioning Account...");
                    await this.postData(CONFIG.ENDPOINTS.register, payload);
                    
                    notifier.show("Account Created. Entering Dashboard...", "success");
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
                btn.innerHTML = btn.dataset.prev || "Confirm";
            }
        }
    };

    document.addEventListener("DOMContentLoaded", () => AuthApp.init());
})();