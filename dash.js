now enhance this js to be extremely good plus i want you to make it to reveal the true results from the backend  /**
 * MEDAI ENTERPRISE ENGINE v1.0.0
 * Optimized for Seamless Backend Connectivity
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: {
                ANALYZE: "/diagnostics/process"
            },
            TIMEOUT: 30000 // Extended timeout for Render spin-up
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

    async init() {
        this.cacheSelectors();
        this.bindEvents();
        this.setupNavigation();
        this.renderUser();
        
        // Connect to camera immediately without blocking logic
        await this.setupCamera();
        console.log("🚀 MedAI Core: Ready & Connected");
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
       CAMERA SYSTEM
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
        } catch (e) {
            this.notify("Imaging system offline. Use local upload.", "warning");
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
       AI PIPELINE (AUTO-CONNECT)
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) return;

        // Ensure token exists before attempting upload
        const token = localStorage.getItem("medai_token");
        if (!token) {
            this.notify("Session expired. Please log in.", "error");
            setTimeout(() => window.location.href = 'index.html', 1500);
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
            const errorMsg = e.name === 'AbortError' 
                ? "Server is warming up. Retrying in 3s..." 
                : (e.message || "Analysis failed.");
            this.notify(errorMsg, "error");
        } finally {
            this.toggleLoading(false);
        }
    }

    async uploadToAI(blob) {
        this.state.controller?.abort();
        this.state.controller = new AbortController();
        const timeoutId = setTimeout(() => this.state.controller.abort(), this.config.TIMEOUT);

        const fd = new FormData();
        fd.append("file", blob, "scan.jpg"); // Note: Changed 'image' to 'file' to match standard FastAPI UploadFile
        fd.append("type", this.state.activeMode);

        const res = await fetch(
            `${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("medai_token")}`
                },
                body: fd,
                signal: this.state.controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (res.status === 401 || res.status === 403) {
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
        this.dom.resultsPanel.classList.remove("hidden");

        const score = Math.min(100, Math.max(0, data.confidence || 85));
        if (this.dom.confidencePath) {
            this.dom.confidencePath.style.strokeDasharray = `${score}, 100`;
            this.dom.confidenceText.textContent = `${score}%`;
        }

        this.dom.resultTitle.textContent = data.diagnosis || "Clear Scan";
        this.dom.resultDescription.textContent = data.description || "No abnormalities detected in the current view.";

        this.dom.findingsList.innerHTML = "";
        const findings = data.findings || ["Normal physiological appearance"];
        findings.forEach(f => {
            const li = document.createElement("li");
            li.textContent = f;
            this.dom.findingsList.appendChild(li);
        });
    }

    bindEvents() {
        this.dom.captureBtn.onclick = () => this.handleCapture();

        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
            };
        });

        this.dom.closeResults.onclick = () => this.dom.resultsPanel.classList.add("hidden");

        this.dom.toggleTorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) return;
            try {
                this.state.torchOn = !this.state.torchOn;
                await track.applyConstraints({ advanced: [{ torch: this.state.torchOn }] });
            } catch {
                this.notify("Torch not available on this device.", "info");
            }
        };

        this.dom.uploadLocal.onclick = () => this.handleLocalUpload();
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
            };
        });
    }

    toggleLoading(active, text = "AI Analyzing...") {
        this.state.isProcessing = active;
        this.dom.captureBtn.disabled = active;
        this.updateAIStatus(active ? text : "AI Ready");
        if (active) this.notify(text, "info");
    }

    updateAIStatus(text) {
        if (this.dom.aiStatus) {
            this.dom.aiStatus.textContent = text;
        }
    }

    notify(message, type = "info") {
        if (!this.dom.notif) return;
        this.dom.notif.textContent = message;
        this.dom.notif.className = `notification ${type}`;
        this.dom.notif.classList.remove("hidden");
        clearTimeout(this.notifTimer);
        this.notifTimer = setTimeout(() => this.dom.notif.classList.add("hidden"), 4000);
    }

    renderUser() {
        if (this.dom.displayName) {
            this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
        }
    }
}

// Bootstrap
window.addEventListener("DOMContentLoaded", () => new MedAICore());
