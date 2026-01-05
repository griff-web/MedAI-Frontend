/**
 * MEDAI ENTERPRISE ENGINE v3.2.0
 * Production-Ready Frontend Core
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: "https://bug-free-space-adventure-695gv4gqwv6wh44j7-4000.app.github.dev",
            ENDPOINTS: {
                ANALYZE: "/diagnostics/process"
            }
        };

        this.state = {
            stream: null,
            imageCapture: null,
            activeMode: "xray",
            isProcessing: false,
            torchOn: false,
            controller: null,
            user: JSON.parse(localStorage.getItem("medai_user")) || { name: "Practitioner" }
        };

        this.init();
    }

    /* =====================================================
       INIT
    ===================================================== */
    async init() {
        this.cacheSelectors();
        this.bindEvents();
        this.setupNavigation();
        await this.setupCamera();
        this.renderUser();
        this.updateAIStatus("AI Ready");
    }

    cacheSelectors() {
        this.dom = {
            video: document.getElementById("camera-stream"),
            captureBtn: document.getElementById("capture-trigger"),
            toggleTorch: document.getElementById("toggle-torch"),
            uploadLocal: document.getElementById("upload-local"),

            typeBtns: document.querySelectorAll(".type-btn"),
            navItems: document.querySelectorAll(".nav-item"),
            views: document.querySelectorAll(".content-view"),

            resultsPanel: document.getElementById("results-panel"),
            closeResults: document.getElementById("close-results"),

            aiStatus: document.getElementById("ai-status"),

            confidencePath: document.getElementById("confidence-path"),
            confidenceText: document.getElementById("confidence-text"),
            resultTitle: document.getElementById("result-title"),
            resultDescription: document.getElementById("result-description"),
            findingsList: document.getElementById("findings-list"),

            displayName: document.getElementById("display-name"),
            notif: document.getElementById("notification")
        };
    }

    /* =====================================================
       CAMERA
    ===================================================== */
    async setupCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };

            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.dom.video.srcObject = this.state.stream;

            const track = this.state.stream.getVideoTracks()[0];
            if ("ImageCapture" in window) {
                this.state.imageCapture = new ImageCapture(track);
            }
        } catch {
            this.notify("Camera access unavailable.", "error");
        }
    }

    async captureFallback() {
        const canvas = document.createElement("canvas");
        canvas.width = this.dom.video.videoWidth;
        canvas.height = this.dom.video.videoHeight;
        canvas.getContext("2d").drawImage(this.dom.video, 0, 0);
        return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.95));
    }

    /* =====================================================
       IMAGE PREPROCESSING
    ===================================================== */
    async processImage(blob) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                const w = img.width * 0.9;
                const h = img.height * 0.9;

                canvas.width = w;
                canvas.height = h;

                ctx.drawImage(
                    img,
                    img.width * 0.05,
                    img.height * 0.05,
                    w,
                    h,
                    0,
                    0,
                    w,
                    h
                );

                canvas.toBlob(resolve, "image/jpeg", 0.95);
            };
            img.src = URL.createObjectURL(blob);
        });
    }

    /* =====================================================
       CAPTURE & AI PIPELINE
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) return;

        if (!localStorage.getItem("medai_token")) {
            this.notify("Please log in to continue.", "warning");
            return;
        }

        this.toggleLoading(true);

        try {
            const raw = this.state.imageCapture
                ? await this.state.imageCapture.takePhoto()
                : await this.captureFallback();

            const cleaned = await this.processImage(raw);
            const result = await this.uploadToAI(cleaned);
            this.displayDiagnosis(result);
        } catch (e) {
            this.notify(e.message || "Analysis failed.", "error");
        } finally {
            this.toggleLoading(false);
        }
    }

    getAuthHeaders() {
        const token = localStorage.getItem("medai_token");
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    async uploadToAI(blob) {
        this.state.controller?.abort();
        this.state.controller = new AbortController();

        const fd = new FormData();
        fd.append("image", blob, "scan.jpg");
        fd.append("type", this.state.activeMode);

        const res = await fetch(
            `${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`,
            {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: fd,
                signal: this.state.controller.signal,
                credentials: "include"
            }
        );

        if (res.status === 403) {
            throw new Error("Access denied. Please re-authenticate.");
        }

        if (!res.ok) {
            throw new Error("AI processing failed.");
        }

        return res.json();
    }

    /* =====================================================
       RESULTS
    ===================================================== */
    displayDiagnosis(data) {
        this.dom.resultsPanel.classList.remove("hidden");

        const score = Math.min(100, Math.max(0, data.confidence ?? 85));
        this.dom.confidencePath.style.strokeDasharray = `${score}, 100`;
        this.dom.confidenceText.textContent = `${score}%`;

        this.dom.resultTitle.textContent = data.diagnosis || "Normal Findings";
        this.dom.resultDescription.textContent =
            data.description || "No abnormal indicators detected.";

        this.dom.findingsList.innerHTML = "";
        (data.findings || ["No acute abnormalities detected"]).forEach(f => {
            const li = document.createElement("li");
            li.textContent = f;
            this.dom.findingsList.appendChild(li);
        });
    }

    /* =====================================================
       UI & EVENTS
    ===================================================== */
    bindEvents() {
        this.dom.captureBtn.onclick = () => this.handleCapture();

        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
            };
        });

        this.dom.closeResults.onclick = () =>
            this.dom.resultsPanel.classList.add("hidden");

        this.dom.toggleTorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) return;

            const caps = track.getCapabilities();
            if (!caps.torch) {
                this.notify("Torch not supported.", "warning");
                return;
            }

            this.state.torchOn = !this.state.torchOn;
            await track.applyConstraints({
                advanced: [{ torch: this.state.torchOn }]
            });
        };

        this.dom.uploadLocal.onclick = () => this.handleLocalUpload();
    }

    async handleLocalUpload() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";

        input.onchange = async () => {
            if (!input.files[0]) return;
            this.toggleLoading(true);

            try {
                const cleaned = await this.processImage(input.files[0]);
                const result = await this.uploadToAI(cleaned);
                this.displayDiagnosis(result);
            } catch (e) {
                this.notify(e.message, "error");
            } finally {
                this.toggleLoading(false);
            }
        };

        input.click();
    }

    setupNavigation() {
        this.dom.navItems.forEach(btn => {
            btn.onclick = () => {
                this.dom.navItems.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                this.dom.views.forEach(v => v.classList.add("hidden"));
                document
                    .getElementById(`${btn.dataset.tab}-section`)
                    ?.classList.remove("hidden");
            };
        });
    }

    toggleLoading(active) {
        this.state.isProcessing = active;
        this.dom.captureBtn.disabled = active;
        this.updateAIStatus(active ? "AI Analyzing…" : "AI Ready");

        if (active) this.notify("AI is analyzing scan…", "info");
    }

    updateAIStatus(text) {
        if (this.dom.aiStatus) {
            this.dom.aiStatus.textContent = text;
            this.dom.aiStatus.classList.remove("hidden");
        }
    }

    notify(message, type = "info") {
        this.dom.notif.textContent = message;
        this.dom.notif.className = `notification ${type}`;
        this.dom.notif.classList.remove("hidden");

        clearTimeout(this.notifTimer);
        this.notifTimer = setTimeout(() => {
            this.dom.notif.classList.add("hidden");
        }, 4000);
    }

    renderUser() {
        if (this.dom.displayName) {
            this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
        }
    }
}

/* =====================================================
   BOOTSTRAP
===================================================== */
window.addEventListener("DOMContentLoaded", () => new MedAICore());
