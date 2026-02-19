(() => {
"use strict";

/*
 * MEDAI ENTERPRISE ENGINE v3.0 (Security Hardened Edition)
 * - Eliminated XSS vectors
 * - Removed localStorage token usage
 * - Added strict schema validation
 * - Added file signature validation
 * - Implemented safe retry logic
 * - Removed medical certainty language
 * - Added mandatory disclaimer
 */

class Config {
    static API_BASE = "https://ai-p17b.onrender.com";
    static ENDPOINTS = { ANALYZE: "/diagnostics/process" };
    static REQUEST_TIMEOUT = 30000;
    static MAX_RETRIES = 2;
    static MAX_FILE_SIZE = 50 * 1024 * 1024;
    static COOLDOWN_MS = 3000;
    static RETRYABLE_STATUS = [502, 503, 504];
}

class MedAIApp {

    constructor() {
        this.state = {
            activeMode: "xray",
            isProcessing: false,
            lastRequestTime: 0,
            isOnline: navigator.onLine
        };

        this.dom = {};
        this.cameraStream = null;
        this.abortController = null;
        this.fileInput = null;
    }

    /* ---------------- INIT ---------------- */

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.bindNetworkEvents();
        this.initCamera();
        this.createFileInput();
        this.injectDisclaimer();
    }

    cacheDOM() {
        const $ = id => document.getElementById(id);
        this.dom = {
            video: $("camera-stream"),
            captureBtn: $("capture-trigger"),
            notification: $("notification"),
            aiStatus: $("ai-status"),
            resultsPanel: $("results-panel"),
            resultTitle: $("result-title"),
            resultDescription: $("result-description"),
            findingsList: $("findings-list"),
            confidenceText: $("confidence-text"),
            confidencePath: $("confidence-path"),
            uploadLocal: $("upload-local")
        };
    }

    bindEvents() {
        this.dom.captureBtn?.addEventListener("click", () => this.safeCapture());
        this.dom.uploadLocal?.addEventListener("click", () => this.fileInput.click());
    }

    bindNetworkEvents() {
        window.addEventListener("online", () => this.state.isOnline = true);
        window.addEventListener("offline", () => {
            this.state.isOnline = false;
            this.notify("Offline. Network required.", "error");
        });
    }

    /* ---------------- SECURITY UTILITIES ---------------- */

    async fetchSecure(url, options = {}, retries = Config.MAX_RETRIES) {
        for (let i = 0; i <= retries; i++) {
            try {
                this.abortController = new AbortController();
                const timeout = setTimeout(() => this.abortController.abort(), Config.REQUEST_TIMEOUT);

                const response = await fetch(url, {
                    ...options,
                    credentials: "include", // secure cookies
                    signal: this.abortController.signal
                });

                clearTimeout(timeout);

                if (!response.ok) {
                    if (Config.RETRYABLE_STATUS.includes(response.status) && i < retries) {
                        await this.sleep(1000 * (i + 1));
                        continue;
                    }
                    throw new Error(`Server Error (${response.status})`);
                }

                return response;

            } catch (err) {
                if (i === retries) throw err;
                await this.sleep(1000 * (i + 1));
            }
        }
    }

    validateResponseSchema(data) {
        if (typeof data !== "object" || data === null) return false;
        if (typeof data.diagnosis !== "string") return false;
        if (!Array.isArray(data.findings)) return false;
        if (typeof data.confidence !== "number") return false;
        return true;
    }

    async validateFileSignature(file) {
        const buffer = await file.slice(0, 12).arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // JPEG
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) return true;

        // PNG
        if (bytes[0] === 0x89 && bytes[1] === 0x50) return true;

        // WEBP (RIFF)
        if (bytes[0] === 0x52 && bytes[1] === 0x49) return true;

        // TIFF
        if ((bytes[0] === 0x49 && bytes[1] === 0x49) ||
            (bytes[0] === 0x4D && bytes[1] === 0x4D)) return true;

        // DICOM (DICM at byte 128)
        const dicomHeader = new TextDecoder().decode(
            new Uint8Array(await file.slice(128, 132).arrayBuffer())
        );
        if (dicomHeader === "DICM") return true;

        return false;
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

    /* ---------------- CORE LOGIC ---------------- */

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

    async sendForAnalysis(file, filename) {
        this.setLoading(true);

        try {
            const fd = new FormData();
            fd.append("file", file, filename);

            const response = await this.fetchSecure(
                `${Config.API_BASE}${Config.ENDPOINTS.ANALYZE}`,
                { method: "POST", body: fd }
            );

            const data = await response.json();

            if (!this.validateResponseSchema(data)) {
                throw new Error("Invalid response structure");
            }

            this.displayResults(data);

        } catch (err) {
            this.notify("Analysis failed.", "error");
        } finally {
            this.setLoading(false);
        }
    }

    async processLocalFile(file) {
        if (file.size > Config.MAX_FILE_SIZE) {
            this.notify("File too large.", "error");
            return;
        }

        if (!(await this.validateFileSignature(file))) {
            this.notify("Invalid or unsafe file.", "error");
            return;
        }

        await this.sendForAnalysis(file, file.name);
    }

    /* ---------------- SAFE RENDERING ---------------- */

    displayResults(data) {
        this.dom.resultsPanel?.classList.remove("hidden");

        this.dom.resultTitle.textContent = data.diagnosis;
        this.dom.resultDescription.textContent =
            data.description || "AI-assisted interpretation provided.";

        this.updateConfidence(data.confidence);

        this.dom.findingsList.textContent = "";

        data.findings.forEach(finding => {
            const li = document.createElement("li");
            li.textContent = `• ${finding}`;
            this.dom.findingsList.appendChild(li);
        });
    }

    updateConfidence(score) {
        const value = Math.max(0, Math.min(100, score));
        this.dom.confidenceText.textContent =
            `Model Confidence Estimate: ${value}%`;
        this.dom.confidencePath.style.strokeDasharray = `${value},100`;
    }

    /* ---------------- CAMERA ---------------- */

    async initCamera() {
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
            if (this.dom.video)
                this.dom.video.srcObject = this.cameraStream;
        } catch {
            this.notify("Camera unavailable.", "error");
        }
    }

    captureFrame() {
        return new Promise((resolve, reject) => {
            if (!this.dom.video?.videoWidth) {
                reject();
                return;
            }
            const canvas = document.createElement("canvas");
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;
            canvas.getContext("2d").drawImage(this.dom.video, 0, 0);
            canvas.toBlob(blob => blob ? resolve(blob) : reject(), "image/jpeg");
        });
    }

    /* ---------------- UI HELPERS ---------------- */

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
            this.dom.notification.classList.remove("visible"), 4000);
    }

    injectDisclaimer() {
        const disclaimer = document.createElement("div");
        disclaimer.style.fontSize = "12px";
        disclaimer.style.marginTop = "10px";
        disclaimer.style.opacity = "0.8";
        disclaimer.textContent =
            "AI-assisted analysis only. Not a medical diagnosis. " +
            "Clinical decisions must be made by licensed professionals.";
        document.body.appendChild(disclaimer);
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    createFileInput() {
        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.style.display = "none";
        document.body.appendChild(this.fileInput);

        this.fileInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (file) this.processLocalFile(file);
        });
    }
}

/* ---------------- START ---------------- */

document.addEventListener("DOMContentLoaded", () => {
    const app = new MedAIApp();
    app.init();
});

})();
