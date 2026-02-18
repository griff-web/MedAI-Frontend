/**
 * MEDAI ENTERPRISE ENGINE v2.2 (Performance Optimized)
 * - Added: Mode Switching Logic
 * - Added: UI State Management
 * - Improved: Camera Readiness Checks
 */

(() => {
    "use strict";

    /* =========================================================
       CONFIGURATION & UTILITIES
    ========================================================= */
    class Config {
        static API_BASE = window.ENV_API_BASE || "https://ai-p17b.onrender.com";
        static ENDPOINTS = { ANALYZE: "/diagnostics/process" };
        static TIMEOUT = 60000;
        static RETRY_ATTEMPTS = 3;
        static RETRY_BASE_DELAY = 1000;
    }

    class Utils {
        static sleep = ms => new Promise(r => setTimeout(r, ms));
        
        static backoffDelay(attempt) {
            return (Config.RETRY_BASE_DELAY * Math.pow(2, attempt)) + (Math.random() * 300);
        }

        static clamp = (num, min, max) => Math.min(Math.max(num, min), max);

        static notify(el, message, type = "info") {
            if (!el) return;
            el.textContent = message;
            el.className = `notification ${type} visible`;
            setTimeout(() => el.classList.remove("visible"), 4000);
        }
    }

    /* =========================================================
       CORE SERVICES
    ========================================================= */
    class HttpClient {
        static async post(url, body, headers = {}, attempt = 0) {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), Config.TIMEOUT);

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers,
                    body,
                    signal: controller.signal
                });

                if (!response.ok) {
                    if (response.status >= 500 && attempt < Config.RETRY_ATTEMPTS) {
                        await Utils.sleep(Utils.backoffDelay(attempt));
                        return this.post(url, body, headers, attempt + 1);
                    }
                    throw new Error(`Server Error: ${response.status}`);
                }
                return await response.json();
            } catch (err) {
                if (attempt < Config.RETRY_ATTEMPTS && (err.name === "AbortError" || err instanceof TypeError)) {
                    await Utils.sleep(Utils.backoffDelay(attempt));
                    return this.post(url, body, headers, attempt + 1);
                }
                throw err;
            } finally {
                clearTimeout(tid);
            }
        }
    }

    class CameraService {
        constructor(videoEl) {
            this.video = videoEl;
            this.stream = null;
        }

        async init() {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            this.video.srcObject = this.stream;
            // Ensure video metadata is loaded before allowing capture
            return new Promise(resolve => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
        }

        async capture() {
            if (!this.video.videoWidth) throw new Error("Camera not ready");
            
            const canvas = document.createElement("canvas");
            canvas.width = this.video.videoWidth;
            canvas.height = this.video.videoHeight;
            canvas.getContext("2d").drawImage(this.video, 0, 0);
            
            return new Promise(resolve => {
                canvas.toBlob(b => resolve(b), "image/jpeg", 0.9);
            });
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
                user: JSON.parse(localStorage.getItem("medai_user") || '{"name":"Practitioner"}')
            };
            this.dom = {};
        }

        init() {
            this.cacheDOM();
            this.bindEvents();
            this.initCamera();
            this.renderUser();
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
                notification: $("notification"),
                // Select all mode buttons (assumes class 'mode-btn')
                modeButtons: document.querySelectorAll(".mode-btn")
            };
        }

        bindEvents() {
            // 1. Mode Switching Logic
            this.dom.modeButtons.forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const mode = e.currentTarget.dataset.mode;
                    if (mode) this.switchMode(mode, e.currentTarget);
                });
            });

            // 2. Capture Logic
            this.dom.captureBtn?.addEventListener("click", () => this.handleCapture());

            // 3. PDF Logic
            this.dom.downloadPdf?.addEventListener("click", () => this.handleDownload());
        }

        switchMode(mode, targetEl) {
            this.state.activeMode = mode;
            // UI Update
            this.dom.modeButtons.forEach(b => b.classList.remove("active"));
            targetEl.classList.add("active");
            console.log(`Switched to: ${mode}`);
        }

        async initCamera() {
            try {
                this.camera = new CameraService(this.dom.video);
                await this.camera.init();
            } catch (err) {
                Utils.notify(this.dom.notification, "Camera Access Denied", "error");
            }
        }

        async handleCapture() {
            if (this.state.isProcessing) return;
            
            this.setLoading(true);
            try {
                const blob = await this.camera.capture();
                const fd = new FormData();
                fd.append("file", blob, "scan.jpg");
                fd.append("type", this.state.activeMode);

                const result = await HttpClient.post(
                    `${Config.API_BASE}${Config.ENDPOINTS.ANALYZE}`, 
                    fd, 
                    { Authorization: `Bearer ${localStorage.getItem("medai_token") || ""}` }
                );

                this.displayResults(result);
            } catch (err) {
                Utils.notify(this.dom.notification, err.message, "error");
            } finally {
                this.setLoading(false);
            }
        }

        displayResults(data) {
            this.state.lastResult = data;
            const score = Utils.clamp(data?.confidence ?? 0, 0, 100);

            if(this.dom.resultTitle) this.dom.resultTitle.textContent = data?.diagnosis || "Complete";
            if(this.dom.resultDescription) this.dom.resultDescription.textContent = data?.description || "";
            if(this.dom.confidenceText) this.dom.confidenceText.textContent = `${score}%`;
            
            if (this.dom.findingsList) {
                this.dom.findingsList.innerHTML = (data?.findings || [])
                    .map(f => `<li>${f}</li>`).join("");
            }

            this.dom.resultsPanel?.classList.remove("hidden");
            this.dom.resultsPanel?.scrollIntoView({ behavior: 'smooth' });
        }

        async handleDownload() {
            if (!this.state.lastResult) return;
            try {
                // Dynamic import logic (assumes PDFService is available)
                await PDFService.generate(this.state.lastResult, this.state.user.name);
            } catch (err) {
                Utils.notify(this.dom.notification, "PDF Generation Failed", "error");
            }
        }

        setLoading(state) {
            this.state.isProcessing = state;
            if (this.dom.captureBtn) {
                this.dom.captureBtn.disabled = state;
                this.dom.captureBtn.innerHTML = state ? 
                    '<span class="spinner"></span> Processing...' : 
                    'Analyze Scan';
            }
        }

        renderUser() {
            if (this.dom.displayName) {
                this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
            }
        }
    }

    // Launch
    document.addEventListener("DOMContentLoaded", () => {
        window.App = new MedAIApp();
        window.App.init();
    });
})();
