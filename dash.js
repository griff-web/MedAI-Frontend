/**
 * MEDAI ENTERPRISE ENGINE v2.0 (Single File Enterprise Architecture)
 * - Layered Architecture
 * - Service Abstraction
 * - Timeout + AbortController
 * - Exponential Retry
 * - Defensive Guards
 * - Clean Separation of Concerns
 */

(() => {
    "use strict";

    /* =========================================================
       CONFIGURATION LAYER
    ========================================================== */
    class Config {
        static API_BASE = window.ENV_API_BASE || "https://ai-p17b.onrender.com";
        static ENDPOINTS = { ANALYZE: "/diagnostics/process" };
        static TIMEOUT = 60000;
        static RETRY_ATTEMPTS = 3;
        static RETRY_DELAY = 1000;
    }

    /* =========================================================
       UTILITY LAYER
    ========================================================== */
    class Utils {
        static sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        static safeJSONParse(value, fallback = {}) {
            try { return JSON.parse(value) || fallback; }
            catch { return fallback; }
        }

        static clamp(num, min, max) {
            return Math.min(Math.max(num, min), max);
        }
    }

    /* =========================================================
       HTTP SERVICE LAYER
    ========================================================== */
    class HttpClient {
        static async post(url, body, headers = {}, attempt = 0) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), Config.TIMEOUT);

            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers,
                    body,
                    signal: controller.signal
                });

                clearTimeout(timeout);

                if (!res.ok) {
                    if (attempt < Config.RETRY_ATTEMPTS) {
                        await Utils.sleep(Config.RETRY_DELAY * (attempt + 1));
                        return this.post(url, body, headers, attempt + 1);
                    }
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }

                return await res.json();
            } catch (err) {
                if (attempt < Config.RETRY_ATTEMPTS) {
                    await Utils.sleep(Config.RETRY_DELAY * (attempt + 1));
                    return this.post(url, body, headers, attempt + 1);
                }
                throw err.name === "AbortError"
                    ? new Error("Request Timeout")
                    : err;
            }
        }
    }

    /* =========================================================
       AI SERVICE LAYER
    ========================================================== */
    class AIService {
        static async analyze(blob, type) {
            const fd = new FormData();
            fd.append("file", blob, "scan.jpg");
            fd.append("type", type);

            return HttpClient.post(
                `${Config.API_BASE}${Config.ENDPOINTS.ANALYZE}`,
                fd,
                { Authorization: `Bearer ${localStorage.getItem("medai_token")}` }
            );
        }
    }

    /* =========================================================
       CAMERA SERVICE
    ========================================================== */
    class CameraService {
        constructor(videoEl) {
            this.video = videoEl;
            this.stream = null;
            this.imageCapture = null;
        }

        async init() {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment" }
                });

                this.video.srcObject = this.stream;

                if ("ImageCapture" in window) {
                    this.imageCapture = new ImageCapture(
                        this.stream.getVideoTracks()[0]
                    );
                }
            } catch {
                throw new Error("Camera unavailable");
            }
        }

        async capture() {
            if (this.imageCapture) {
                return this.imageCapture.takePhoto();
            }

            const canvas = document.createElement("canvas");
            canvas.width = this.video.videoWidth || 640;
            canvas.height = this.video.videoHeight || 480;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(this.video, 0, 0);

            return new Promise(res =>
                canvas.toBlob(res, "image/jpeg", 0.95)
            );
        }
    }

    /* =========================================================
       PDF SERVICE
    ========================================================== */
    class PDFService {
        static async ensureLoaded() {
            if (window.jspdf) return;

            await new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src =
                    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
                script.onload = resolve;
                script.onerror = () => reject(new Error("PDF Engine failed"));
                document.head.appendChild(script);
            });
        }

        static async generate(report, practitioner) {
            await this.ensureLoaded();

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const diagnosis = report.diagnosis || "N/A";
            const confidence = report.confidence ?? 0;
            const description = report.description || "No description provided.";

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
    ========================================================== */
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
        }

        async init() {
            this.cacheDOM();
            this.bindEvents();
            this.camera = new CameraService(this.dom.video);

            try {
                await this.camera.init();
            } catch (e) {
                this.notify(e.message, "warning");
            }

            this.renderUser();
            console.log("🚀 MedAI Enterprise Ready");
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
                if (this.state.lastResult)
                    PDFService.generate(
                        this.state.lastResult,
                        this.state.user.name
                    );
            });
        }

        async handleCapture() {
            if (this.state.isProcessing) return;

            this.setLoading(true);

            try {
                const blob = await this.camera.capture();
                const result = await AIService.analyze(
                    blob,
                    this.state.activeMode
                );

                this.displayResults(result);
            } catch (e) {
                this.notify(e.message, "error");
            } finally {
                this.setLoading(false);
            }
        }

        displayResults(data) {
            this.state.lastResult = data;

            const score = Utils.clamp(data.confidence ?? 0, 0, 100);

            this.dom.resultTitle.textContent =
                data.diagnosis || "Analysis Complete";
            this.dom.resultDescription.textContent =
                data.description || "No description provided.";
            this.dom.confidenceText.textContent = `${score}%`;

            this.dom.findingsList.innerHTML = "";
            (data.findings || []).forEach(f => {
                const li = document.createElement("li");
                li.textContent = f;
                this.dom.findingsList.appendChild(li);
            });

            this.dom.resultsPanel.classList.remove("hidden");
        }

        setLoading(state) {
            this.state.isProcessing = state;
            if (this.dom.captureBtn)
                this.dom.captureBtn.disabled = state;
        }

        notify(msg, type) {
            if (!this.dom.notification) return;
            this.dom.notification.textContent = msg;
            this.dom.notification.className = `notification ${type} visible`;
            setTimeout(() =>
                this.dom.notification.classList.remove("visible"),
                4000
            );
        }

        renderUser() {
            if (this.dom.displayName)
                this.dom.displayName.textContent =
                    `Dr. ${this.state.user.name}`;
        }
    }

    /* =========================================================
       BOOTSTRAP
    ========================================================== */
    document.addEventListener("DOMContentLoaded", () => {
        const app = new MedAIApp();
        app.init();
        window.App = app;
    });

})();
