(() => {
"use strict";

/*
 * MEDAI ENTERPRISE ENGINE v4.0 (Auth Integrated)
 * Fully compatible with MedAI Enterprise Authentication Engine v2.0.0
 */

class Config {
    static API_BASE = window.ENV_API_BASE || "https://m-backend-n2pd.onrender.com";
    static ENDPOINT = "/diagnostics/process";
    static REQUEST_TIMEOUT = 30000;
    static MAX_RETRIES = 2;
    static MAX_FILE_SIZE = 50 * 1024 * 1024;
    static COOLDOWN_MS = 3000;
    static RETRYABLE_STATUS = [502, 503, 504];
    static REDIRECT_LOGIN = "login.html";
}

class MedAIApp {

    constructor() {
        this.state = {
            isProcessing: false,
            lastRequestTime: 0,
            isOnline: navigator.onLine
        };

        this.dom = {};
        this.cameraStream = null;
        this.fileInput = null;
    }

    /* ---------------- INIT ---------------- */

    init() {
        this.enforceAuth();
        this.cacheDOM();
        this.bindEvents();
        this.bindNetworkEvents();
        this.initCamera();
        this.createFileInput();
        this.injectDisclaimer();
    }

    /* ---------------- AUTH INTEGRATION ---------------- */

    getToken() {
        return localStorage.getItem("medai_token");
    }

    getUser() {
        const user = localStorage.getItem("medai_user");
        return user ? JSON.parse(user) : null;
    }

    enforceAuth() {
        const token = this.getToken();
        if (!token) {
            window.location.href = Config.REDIRECT_LOGIN;
        }
    }

    logout() {
        localStorage.removeItem("medai_token");
        localStorage.removeItem("medai_user");
        window.location.href = Config.REDIRECT_LOGIN;
    }

    /* ---------------- DOM ---------------- */

    cacheDOM() {
        const $ = id => document.getElementById(id);
        this.dom = {
            video: $("camera-stream"),
            captureBtn: $("capture-trigger"),
            uploadLocal: $("upload-local"),
            notification: $("notification"),
            resultsPanel: $("results-panel"),
            resultTitle: $("result-title"),
            resultDescription: $("result-description"),
            findingsList: $("findings-list"),
            confidenceText: $("confidence-text"),
            confidencePath: $("confidence-path"),
            logoutBtn: $("logout-btn")
        };
    }

    bindEvents() {
        this.dom.captureBtn?.addEventListener("click", () => this.safeCapture());
        this.dom.uploadLocal?.addEventListener("click", () => this.fileInput?.click());
        this.dom.logoutBtn?.addEventListener("click", () => this.logout());
    }

    bindNetworkEvents() {
        window.addEventListener("online", () => this.state.isOnline = true);
        window.addEventListener("offline", () => {
            this.state.isOnline = false;
            this.notify("Offline. Network required.", "error");
        });
    }

    /* ---------------- SECURE FETCH (TOKEN AWARE) ---------------- */

    async fetchSecure(url, options = {}) {
        const token = this.getToken();
        if (!token) {
            this.logout();
            return;
        }

        for (let attempt = 0; attempt <= Config.MAX_RETRIES; attempt++) {

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT);

            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        Authorization: `Bearer ${token}`
                    },
                    signal: controller.signal
                });

                clearTimeout(timeout);

                // AUTO LOGOUT IF TOKEN INVALID
                if (response.status === 401 || response.status === 403) {
                    this.notify("Session expired. Please login again.", "warning");
                    this.logout();
                    return;
                }

                if (!response.ok) {
                    if (
                        Config.RETRYABLE_STATUS.includes(response.status) &&
                        attempt < Config.MAX_RETRIES
                    ) {
                        await this.sleep(1000 * (attempt + 1));
                        continue;
                    }
                    throw new Error(`Server error ${response.status}`);
                }

                return response;

            } catch (err) {
                clearTimeout(timeout);
                if (attempt >= Config.MAX_RETRIES) throw err;
                await this.sleep(1000 * (attempt + 1));
            }
        }
    }

    /* ---------------- ANALYSIS ---------------- */

    async sendForAnalysis(file, filename) {
        if (this.state.isProcessing) return;
        this.setLoading(true);

        try {
            const fd = new FormData();
            fd.append("file", file, filename);

            const response = await this.fetchSecure(
                `${Config.API_BASE}${Config.ENDPOINT}`,
                { method: "POST", body: fd }
            );

            if (!response) return; // in case logout happened

            const data = await response.json();

            if (!this.validateResponseSchema(data))
                throw new Error("Invalid server response");

            this.displayResults(data);

        } catch (err) {
            console.error(err);
            this.notify("Analysis failed.", "error");
        } finally {
            this.setLoading(false);
        }
    }

    validateResponseSchema(data) {
        return (
            data &&
            typeof data === "object" &&
            typeof data.diagnosis === "string" &&
            Array.isArray(data.findings) &&
            typeof data.confidence === "number"
        );
    }

    /* ---------------- CAMERA + FILE ---------------- */

    async safeCapture() {
        if (this.state.isProcessing || !this.state.isOnline) return;
        if (!this.rateLimitCheck()) return;

        try {
            const blob = await this.captureFrame();
            await this.sendForAnalysis(blob, "capture.jpg");
        } catch {
            this.notify("Capture failed.", "error");
        }
    }

    rateLimitCheck() {
        const now = Date.now();
        if (now - this.state.lastRequestTime < Config.COOLDOWN_MS) {
            this.notify("Please wait before next request.", "warning");
            return false;
        }
        this.state.lastRequestTime = now;
        return true;
    }

    captureFrame() {
        return new Promise((resolve, reject) => {
            if (!this.dom.video || !this.dom.video.videoWidth) return reject();

            const canvas = document.createElement("canvas");
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) return reject();

            ctx.drawImage(this.dom.video, 0, 0);
            canvas.toBlob(blob => blob ? resolve(blob) : reject(), "image/jpeg");
        });
    }

    /* ---------------- UI ---------------- */

    setLoading(state) {
        this.state.isProcessing = state;
        if (this.dom.captureBtn)
            this.dom.captureBtn.disabled = state;
    }

    notify(msg, type) {
        if (!this.dom.notification) return;
        this.dom.notification.textContent = msg;
        this.dom.notification.className =
            `notification-toast visible ${type}`;

        setTimeout(() =>
            this.dom.notification?.classList.remove("visible"), 4000);
    }

    injectDisclaimer() {
        const disclaimer = document.createElement("div");
        disclaimer.style.fontSize = "12px";
        disclaimer.style.marginTop = "10px";
        disclaimer.style.opacity = "0.8";
        disclaimer.textContent =
            "AI-assisted analysis only. Not a medical diagnosis. Clinical decisions must be made by licensed professionals.";
        document.body.appendChild(disclaimer);
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    async initCamera() {
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
            if (this.dom.video) {
                this.dom.video.srcObject = this.cameraStream;
                await this.dom.video.play().catch(() => {});
            }
        } catch {
            this.notify("Camera unavailable.", "error");
        }
    }

    createFileInput() {
        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = "image/*,.dcm";
        this.fileInput.style.display = "none";
        document.body.appendChild(this.fileInput);

        this.fileInput.addEventListener("change", e => {
            const file = e.target.files?.[0];
            if (file) this.sendForAnalysis(file, file.name);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new MedAIApp().init();
});

})();
