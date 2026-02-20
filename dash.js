(() => {
"use strict";

/*
 * MEDAI ENTERPRISE ENGINE v3.2 (Stability + Security Hardened)
 */

class Config {
    static API_BASE = "https://ai-p17b.onrender.com";
    static ENDPOINT = "/diagnostics/process";
    static REQUEST_TIMEOUT = 30000;
    static MAX_RETRIES = 2;
    static MAX_FILE_SIZE = 50 * 1024 * 1024;
    static COOLDOWN_MS = 3000;
    static RETRYABLE_STATUS = [502, 503, 504];
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
            uploadLocal: $("upload-local"),
            notification: $("notification"),
            resultsPanel: $("results-panel"),
            resultTitle: $("result-title"),
            resultDescription: $("result-description"),
            findingsList: $("findings-list"),
            confidenceText: $("confidence-text"),
            confidencePath: $("confidence-path")
        };
    }

    bindEvents() {
        this.dom.captureBtn?.addEventListener("click", () => this.safeCapture());
        this.dom.uploadLocal?.addEventListener("click", () => this.fileInput?.click());
    }

    bindNetworkEvents() {
        window.addEventListener("online", () => this.state.isOnline = true);
        window.addEventListener("offline", () => {
            this.state.isOnline = false;
            this.notify("Offline. Network required.", "error");
        });
    }

    /* ---------------- SECURITY CORE ---------------- */

    async fetchSecure(url, options = {}) {
        const token = localStorage.getItem("medai_token") || "";

        for (let attempt = 0; attempt <= Config.MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT);

            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        Authorization: token ? `Bearer ${token}` : undefined
                    },
                    signal: controller.signal
                });

                clearTimeout(timeout);

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

    validateResponseSchema(data) {
        return (
            data &&
            typeof data === "object" &&
            typeof data.diagnosis === "string" &&
            Array.isArray(data.findings) &&
            typeof data.confidence === "number"
        );
    }

    async validateFileSignature(file) {
        const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());

        if (header[0] === 0xFF && header[1] === 0xD8) return true; // JPEG
        if (header[0] === 0x89 && header[1] === 0x50) return true; // PNG
        if (header[0] === 0x52 && header[1] === 0x49) return true; // WEBP
        if ((header[0] === 0x49 && header[1] === 0x49) ||
            (header[0] === 0x4D && header[1] === 0x4D)) return true; // TIFF

        const dicomCheck = new TextDecoder().decode(
            new Uint8Array(await file.slice(128, 132).arrayBuffer())
        );
        return dicomCheck === "DICM";
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

    /* ---------------- ANALYSIS ---------------- */

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
        if (this.state.isProcessing) return;
        this.setLoading(true);

        try {
            const fd = new FormData();
            fd.append("file", file, filename);

            const response = await this.fetchSecure(
                `${Config.API_BASE}${Config.ENDPOINT}`,
                { method: "POST", body: fd }
            );

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("Invalid JSON");
            }

            if (!this.validateResponseSchema(data))
                throw new Error("Invalid schema");

            this.displayResults(data);

        } catch (err) {
            console.error(err);
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
            this.notify("Unsafe or invalid file.", "error");
            return;
        }

        await this.sendForAnalysis(file, file.name);
        this.fileInput.value = ""; // allow re-upload of same file
    }

    /* ---------------- SAFE DOM RENDERING ---------------- */

    displayResults(data) {
        this.dom.resultsPanel?.classList.remove("hidden");

        this.dom.resultTitle && (this.dom.resultTitle.textContent = data.diagnosis);
        this.dom.resultDescription &&
            (this.dom.resultDescription.textContent =
                data.description || "AI-assisted interpretation provided.");

        this.updateConfidence(data.confidence);

        if (this.dom.findingsList) {
            this.dom.findingsList.textContent = "";
            data.findings.forEach(item => {
                const li = document.createElement("li");
                li.textContent = `• ${String(item)}`;
                this.dom.findingsList.appendChild(li);
            });
        }
    }

    updateConfidence(score) {
        const value = Math.max(0, Math.min(100, Number(score) || 0));
        this.dom.confidenceText &&
            (this.dom.confidenceText.textContent =
                `Model Confidence Estimate: ${value}%`);

        if (this.dom.confidencePath)
            this.dom.confidencePath.style.strokeDasharray = `${value},100`;
    }

    /* ---------------- CAMERA ---------------- */

    async initCamera() {
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });

            if (this.dom.video) {
                this.dom.video.srcObject = this.cameraStream;
                this.dom.video.setAttribute("playsinline", true);
                await this.dom.video.play().catch(() => {});
            }

        } catch {
            this.notify("Camera unavailable.", "error");
        }
    }

    captureFrame() {
        return new Promise((resolve, reject) => {
            if (!this.dom.video || !this.dom.video.videoWidth) {
                reject();
                return;
            }

            const canvas = document.createElement("canvas");
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) return reject();

            ctx.drawImage(this.dom.video, 0, 0);

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

    createFileInput() {
        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = "image/*,.dcm";
        this.fileInput.style.display = "none";
        document.body.appendChild(this.fileInput);

        this.fileInput.addEventListener("change", e => {
            const file = e.target.files?.[0];
            if (file) this.processLocalFile(file);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new MedAIApp().init();
});

})();
