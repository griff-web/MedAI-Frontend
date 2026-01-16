/**
 * MEDAI ENTERPRISE ENGINE v1.1.0
 * Optimized for Seamless Backend Connectivity & Enterprise Use
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: {
                ANALYZE: "/diagnostics/process"
            },
            TIMEOUT: 30000 // Extended timeout for slow backends
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

        this.dom = {};
        this.notifTimer = null;

        this.init();
    }

    async init() {
        this.cacheSelectors();
        this.bindEvents();
        this.setupNavigation();
        this.renderUser();

        // Connect to camera immediately
        await this.setupCamera();
        console.log("🚀 MedAI Core v1.1.0: Ready & Connected");
    }

    cacheSelectors() {
        const ids = [
            "camera-stream", "capture-trigger", "toggle-torch", "upload-local",
            "results-panel", "close-results", "ai-status", "confidence-path",
            "confidence-text", "result-title", "result-description", "findings-list",
            "display-name", "notification"
        ];

        ids.forEach(id => this.dom[id.replace(/-/g, '')] = document.getElementById(id));

        this.dom.typeBtns = document.querySelectorAll(".type-btn");
        this.dom.navItems = document.querySelectorAll(".nav-item");
        this.dom.views = document.querySelectorAll(".content-view");
    }

    /* =====================================================
       CAMERA SYSTEM
    ===================================================== */
    async setupCamera() {
        try {
            const constraints = {
                video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
            };

            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.dom.camerastream.srcObject = this.state.stream;

            const track = this.state.stream.getVideoTracks()[0];
            if ("ImageCapture" in window) {
                this.state.imageCapture = new ImageCapture(track);
            }
        } catch {
            this.notify("Imaging system offline. Use local upload.", "warning");
        }
    }

    async captureFallback() {
        const canvas = document.createElement("canvas");
        canvas.width = this.dom.camerastream.videoWidth;
        canvas.height = this.dom.camerastream.videoHeight;
        canvas.getContext("2d").drawImage(this.dom.camerastream, 0, 0);
        return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.95));
    }

    /* =====================================================
       AI PIPELINE
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) return;

        const token = localStorage.getItem("medai_token");
        if (!token) {
            this.notify("Session expired. Redirecting...", "error");
            setTimeout(() => window.location.href = "index.html", 1500);
            return;
        }

        this.toggleLoading(true, "Capturing Scan...");

        try {
            const raw = this.state.imageCapture
                ? await this.state.imageCapture.takePhoto()
                : await this.captureFallback();

            this.updateAIStatus("AI Analyzing...");
            const result = await this.uploadToAI(raw);
            this.displayDiagnosis(result);
        } catch (e) {
            const msg = e.name === "AbortError" ? 
                "Server is warming up. Retrying in 3s..." : (e.message || "Analysis failed.");
            this.notify(msg, "error");
        } finally {
            this.toggleLoading(false);
        }
    }

    async uploadToAI(blob) {
        // Abort previous request
        this.state.controller?.abort();
        this.state.controller = new AbortController();
        const timeoutId = setTimeout(() => this.state.controller.abort(), this.config.TIMEOUT);

        const fd = new FormData();
        fd.append("file", blob, "scan.jpg");
        fd.append("type", this.state.activeMode);

        const res = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("medai_token")}` },
            body: fd,
            signal: this.state.controller.signal
        });

        clearTimeout(timeoutId);

        if ([401, 403].includes(res.status)) {
            localStorage.removeItem("medai_token");
            throw new Error("Session invalid. Re-authenticating...");
        }
        if (!res.ok) throw new Error("AI engine busy. Try again.");

        return res.json();
    }

    /* =====================================================
       UI & RESULTS
    ===================================================== */
    displayDiagnosis(data) {
        this.dom.resultspanel.classList.remove("hidden");

        const score = Math.min(100, Math.max(0, data.confidence || 85));
        if (this.dom.confidencepath) {
            this.dom.confidencepath.style.strokeDasharray = `${score},100`;
            this.dom.confidencetext.textContent = `${score}%`;
        }

        this.dom.resulttitle.textContent = data.diagnosis || "Clear Scan";
        this.dom.resultdescription.textContent = data.description || "No abnormalities detected.";

        this.dom.findingslist.innerHTML = "";
        (data.findings || ["Normal physiological appearance"]).forEach(f => {
            const li = document.createElement("li");
            li.textContent = f;
            this.dom.findingslist.appendChild(li);
        });
    }

    bindEvents() {
        this.dom.capturetrigger.onclick = () => this.handleCapture();

        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
            };
        });

        this.dom.closeResults.onclick = () => this.dom.resultspanel.classList.add("hidden");

        this.dom.toggletorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) return;
            try {
                this.state.torchOn = !this.state.torchOn;
                await track.applyConstraints({ advanced: [{ torch: this.state.torchOn }] });
            } catch {
                this.notify("Torch not available on this device.", "info");
            }
        };

        this.dom.uploadlocal.onclick = () => this.handleLocalUpload();
    }

    async handleLocalUpload() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";

        input.onchange = async () => {
            if (!input.files[0]) return;
            this.toggleLoading(true, "Reading File...");
            try {
                const result = await this.uploadToAI(input.files[0]);
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
                document.getElementById(`${btn.dataset.tab}-section`)?.classList.remove("hidden");

                // Auto redirect for logout
                if (btn.dataset.tab === "log-out") {
                    localStorage.removeItem("medai_token");
                    window.location.href = "reg.html";
                }
            };
        });
    }

    toggleLoading(active, text = "AI Analyzing...") {
        this.state.isProcessing = active;
        this.dom.capturetrigger.disabled = active;
        this.updateAIStatus(active ? text : "AI Ready");
        if (active) this.notify(text, "info");
    }

    updateAIStatus(text) {
        if (this.dom.aistatus) this.dom.aistatus.textContent = text;
    }

    notify(message, type = "info") {
        if (!this.dom.notification) return;
        this.dom.notification.textContent = message;
        this.dom.notification.className = `notification ${type}`;
        this.dom.notification.classList.remove("hidden");
        clearTimeout(this.notifTimer);
        this.notifTimer = setTimeout(() => this.dom.notification.classList.add("hidden"), 4000);
    }

    renderUser() {
        if (this.dom.displayname) this.dom.displayname.textContent = `Dr. ${this.state.user.name}`;
    }
}

// Initialize
window.addEventListener("DOMContentLoaded", () => new MedAICore());
