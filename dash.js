/**
 * MEDAI ENTERPRISE ENGINE v2.1 (Hardened Single File Architecture)
 * - Strict Defensive Programming
 * - Exponential Backoff + Jitter
 * - Proper Timeout Cleanup
 * - Network vs 4xx Retry Control
 * - Blob Safety
 * - DOM Guards
 * - Structured Error Normalization
 * - Memory Safe
 */

(() => {
"use strict";

/* =========================================================
   CONFIGURATION LAYER
========================================================= */
class Config {
    static API_BASE = window.ENV_API_BASE || "https://ai-p17b.onrender.com";
    static ENDPOINTS = { ANALYZE: "/diagnostics/process" };

    static TIMEOUT = 60000;

    static RETRY_ATTEMPTS = 3;
    static RETRY_BASE_DELAY = 1000; // ms
}

/* =========================================================
   UTILITY LAYER
========================================================= */
class Utils {

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static safeJSONParse(value, fallback = {}) {
        if (!value || typeof value !== "string") return fallback;
        try { return JSON.parse(value); }
        catch { return fallback; }
    }

    static clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    }

    static backoffDelay(attempt) {
        const base = Config.RETRY_BASE_DELAY * Math.pow(2, attempt);
        const jitter = Math.random() * 300;
        return base + jitter;
    }

    static normalizeError(err) {
        if (!err) return new Error("Unknown error");
        if (err.name === "AbortError") return new Error("Request timeout");
        if (err instanceof Error) return err;
        return new Error(String(err));
    }
}

/* =========================================================
   HTTP SERVICE LAYER
========================================================= */
class HttpClient {

    static async post(url, body, headers = {}, attempt = 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            Config.TIMEOUT
        );

        try {
            const response = await fetch(url, {
                method: "POST",
                headers,
                body,
                signal: controller.signal
            });

            if (!response.ok) {

                // Retry only for 5xx errors
                if (response.status >= 500 &&
                    attempt < Config.RETRY_ATTEMPTS) {

                    await Utils.sleep(Utils.backoffDelay(attempt));
                    return this.post(url, body, headers, attempt + 1);
                }

                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`
                );
            }

            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error("Invalid server response format");
            }

            return await response.json();

        } catch (err) {

            if (attempt < Config.RETRY_ATTEMPTS &&
                (err.name === "AbortError" || err instanceof TypeError)) {

                await Utils.sleep(Utils.backoffDelay(attempt));
                return this.post(url, body, headers, attempt + 1);
            }

            throw Utils.normalizeError(err);

        } finally {
            clearTimeout(timeoutId);
        }
    }
}

/* =========================================================
   AI SERVICE
========================================================= */
class AIService {

    static async analyze(blob, type) {

        if (!(blob instanceof Blob)) {
            throw new Error("Invalid image data");
        }

        const fd = new FormData();
        fd.append("file", blob, "scan.jpg");
        fd.append("type", type);

        const token = localStorage.getItem("medai_token");
        const headers = token
            ? { Authorization: `Bearer ${token}` }
            : {};

        return HttpClient.post(
            `${Config.API_BASE}${Config.ENDPOINTS.ANALYZE}`,
            fd,
            headers
        );
    }
}

/* =========================================================
   CAMERA SERVICE
========================================================= */
class CameraService {

    constructor(videoEl) {
        if (!videoEl) throw new Error("Video element missing");
        this.video = videoEl;
        this.stream = null;
        this.imageCapture = null;
    }

    async init() {

        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });

        this.video.srcObject = this.stream;

        const tracks = this.stream.getVideoTracks();
        if (!tracks.length) {
            throw new Error("No video track available");
        }

        if ("ImageCapture" in window) {
            this.imageCapture = new ImageCapture(tracks[0]);
        }
    }

    async capture() {

        if (!this.stream) {
            throw new Error("Camera not initialized");
        }

        if (this.imageCapture) {
            return await this.imageCapture.takePhoto();
        }

        const canvas = document.createElement("canvas");
        canvas.width = this.video.videoWidth || 640;
        canvas.height = this.video.videoHeight || 480;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");

        ctx.drawImage(this.video, 0, 0);

        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error("Image capture failed"));
                } else {
                    resolve(blob);
                }
            }, "image/jpeg", 0.95);
        });
    }
}

/* =========================================================
   PDF SERVICE
========================================================= */
class PDFService {

    static async ensureLoaded() {

        if (window.jspdf?.jsPDF) return;

        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src =
                "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            script.onload = resolve;
            script.onerror = () =>
                reject(new Error("PDF engine failed to load"));
            document.head.appendChild(script);
        });

        if (!window.jspdf?.jsPDF) {
            throw new Error("PDF engine unavailable");
        }
    }

    static async generate(report, practitioner) {

        await this.ensureLoaded();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const diagnosis = report?.diagnosis || "N/A";
        const confidence = Utils.clamp(report?.confidence ?? 0, 0, 100);
        const description =
            report?.description || "No description provided.";

        doc.setFontSize(20);
        doc.text("MedAI Diagnostic Report", 20, 20);

        doc.setFontSize(12);
        doc.text(`Practitioner: Dr. ${practitioner}`, 20, 35);
        doc.text(`Diagnosis: ${diagnosis}`, 20, 45);
        doc.text(`Confidence: ${confidence}%`, 20, 55);

        const split = doc.splitTextToSize(description, 170);
        doc.text(split, 20, 70);

        doc.save(`MedAI_Report_${Date.now()}.pdf`);
    }
}

/* =========================================================
   APPLICATION CONTROLLER
========================================================= */
class MedAIApp {

    constructor() {

        this.state = {
            activeMode: "xray",
            isProcessing: false,
            lastResult: null,
            user: Utils.safeJSONParse(
                localStorage.getItem("medai_user"),
                { name: "Practitioner" }
            )
        };

        this.dom = {};
        this.camera = null;
    }

    async init() {

        this.cacheDOM();
        this.bindEvents();

        if (!this.dom.video) {
            this.notify("Camera element missing", "error");
            return;
        }

        try {
            this.camera = new CameraService(this.dom.video);
            await this.camera.init();
        } catch (err) {
            this.notify(err.message, "warning");
        }

        this.renderUser();
        console.log("🚀 MedAI Enterprise v2.1 Ready");
    }

    cacheDOM() {
        const $ = id => document.getElementById(id);

        this.dom = {
            video: $("camera-stream"),
            captureBtn: $("capture-trigger"),
            resultsPanel: $("results-panel"),
            resultTitle: $("result-title"),
            resultDescription: $("result-description"),
            findingsList: $("findings-list"),
            confidenceText: $("confidence-text"),
            downloadPdf: $("download-pdf"),
            displayName: $("display-name"),
            notification: $("notification")
        };
    }

    bindEvents() {

        this.dom.captureBtn?.addEventListener("click", () =>
            this.handleCapture()
        );

        this.dom.downloadPdf?.addEventListener("click", () => {
            if (this.state.lastResult) {
                PDFService.generate(
                    this.state.lastResult,
                    this.state.user.name
                ).catch(err =>
                    this.notify(err.message, "error")
                );
            }
        });
    }

    async handleCapture() {

        if (this.state.isProcessing || !this.camera) return;

        this.setLoading(true);

        try {
            const blob = await this.camera.capture();
            const result = await AIService.analyze(
                blob,
                this.state.activeMode
            );

            this.displayResults(result);

        } catch (err) {
            this.notify(err.message, "error");
        } finally {
            this.setLoading(false);
        }
    }

    displayResults(data) {

        this.state.lastResult = data;

        const score = Utils.clamp(data?.confidence ?? 0, 0, 100);

        this.dom.resultTitle &&
            (this.dom.resultTitle.textContent =
                data?.diagnosis || "Analysis Complete");

        this.dom.resultDescription &&
            (this.dom.resultDescription.textContent =
                data?.description || "No description provided.");

        this.dom.confidenceText &&
            (this.dom.confidenceText.textContent = `${score}%`);

        if (this.dom.findingsList) {
            this.dom.findingsList.innerHTML = "";
            (data?.findings || []).forEach(f => {
                const li = document.createElement("li");
                li.textContent = f;
                this.dom.findingsList.appendChild(li);
            });
        }

        this.dom.resultsPanel?.classList.remove("hidden");
    }

    setLoading(state) {
        this.state.isProcessing = state;
        if (this.dom.captureBtn) {
            this.dom.captureBtn.disabled = state;
        }
    }

    notify(message, type = "info") {

        if (!this.dom.notification) return;

        this.dom.notification.textContent = message;
        this.dom.notification.className =
            `notification ${type} visible`;

        setTimeout(() =>
            this.dom.notification?.classList.remove("visible"),
            4000
        );
    }

    renderUser() {
        if (this.dom.displayName) {
            this.dom.displayName.textContent =
                `Dr. ${this.state.user?.name || "Practitioner"}`;
        }
    }
}

/* =========================================================
   BOOTSTRAP
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
    const app = new MedAIApp();
    app.init();
    window.App = app;
});

})();
