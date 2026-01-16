/**
 * MEDAI ULTIMATE ENGINE v2.0.0
 * Pure Backend Integration & Enterprise Stability
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: {
                ANALYZE: "/diagnostics/process",
                HISTORY: "/diagnostics/history"
            },
            TIMEOUT: 45000 // Higher timeout for deep AI processing
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
        this.init();
    }

    async init() {
        this.cacheSelectors();
        this.bindEvents();
        this.setupNavigation();
        this.renderUser();
        
        // Start camera with high-def constraints
        await this.setupCamera();
        this.notify("MedAI Engine Online", "success");
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
       CAMERA & IMAGE CAPTURE
    ===================================================== */
    async setupCamera() {
        try {
            const constraints = {
                video: { 
                    facingMode: "environment", 
                    width: { ideal: 4096 }, // Target 4K if available
                    height: { ideal: 2160 } 
                }
            };

            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.dom.camerastream.srcObject = this.state.stream;

            const track = this.state.stream.getVideoTracks()[0];
            if ("ImageCapture" in window) {
                this.state.imageCapture = new ImageCapture(track);
            }
        } catch (err) {
            console.error("Camera Error:", err);
            this.notify("Hardware access denied. Use Manual Upload.", "error");
        }
    }

    /* =====================================================
       BACKEND COMMUNICATION (THE CORE)
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) return;

        const token = localStorage.getItem("medai_token");
        if (!token) return this.handleAuthError();

        this.toggleLoading(true, "Capturing High-Res Scan...");

        try {
            // 1. Capture Image
            const blob = this.state.imageCapture 
                ? await this.state.imageCapture.takePhoto() 
                : await this.captureCanvas();

            this.updateAIStatus("Syncing with Cloud AI...");
            
            // 2. Fetch results from Backend
            const result = await this.queryBackend(blob);
            
            // 3. Render pure backend data
            this.displayDiagnosis(result);

        } catch (e) {
            this.handleSystemError(e);
        } finally {
            this.toggleLoading(false);
        }
    }

    async queryBackend(blob) {
        this.state.controller?.abort();
        this.state.controller = new AbortController();
        
        const formData = new FormData();
        formData.append("file", blob, `scan_${Date.now()}.jpg`);
        formData.append("metadata", JSON.stringify({
            type: this.state.activeMode,
            timestamp: new Date().toISOString(),
            practitioner: this.state.user.name
        }));

        const response = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("medai_token")}` },
            body: formData,
            signal: this.state.controller.signal
        });

        if (response.status === 401) throw new Error("AUTH_EXPIRED");
        if (!response.ok) throw new Error("BACKEND_ERROR");

        return await response.json();
    }

    /* =====================================================
       DATA RENDERING (FROM BACKEND)
    ===================================================== */
    displayDiagnosis(data) {
        // 'data' is the pure JSON object from your Python/Node backend
        this.dom.resultspanel.classList.remove("hidden");

        // Update Confidence Gauge
        const confidence = data.confidence || 0;
        this.dom.confidencepath.style.strokeDasharray = `${confidence}, 100`;
        this.dom.confidencetext.textContent = `${confidence}%`;

        // Update Textual Diagnosis
        this.dom.resulttitle.textContent = data.diagnosis_label || "Analysis Complete";
        this.dom.resultdescription.textContent = data.clinical_summary || "No description provided by AI.";

        // Update Findings List (Strictly from backend array)
        this.dom.findingslist.innerHTML = "";
        const findings = data.findings || ["No specific anomalies detected."];
        
        findings.forEach(text => {
            const li = document.createElement("li");
            li.className = "finding-item";
            li.innerHTML = `<span class="bullet"></span> ${text}`;
            this.dom.findingslist.appendChild(li);
        });

        // Add visual flair based on result
        this.dom.resulttitle.style.color = confidence > 80 ? "#006600" : "#BB0631";
    }

    /* =====================================================
       UTILITIES
    ===================================================== */
    async captureCanvas() {
        const canvas = document.createElement("canvas");
        const video = this.dom.camerastream;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.95));
    }

    handleSystemError(err) {
        if (err.name === "AbortError") return;
        
        if (err.message === "AUTH_EXPIRED") {
            this.notify("Session expired. Please log in again.", "error");
            setTimeout(() => window.location.href = "login.html", 2000);
        } else {
            this.notify("AI Engine busy. Retrying connection...", "warning");
            console.error("Backend Error:", err);
        }
    }

    toggleLoading(active, message) {
        this.state.isProcessing = active;
        this.dom.capturetrigger.classList.toggle("processing", active);
        this.updateAIStatus(active ? message : "AI Ready for Scan");
    }

    updateAIStatus(text) {
        if (this.dom.aistatus) this.dom.aistatus.innerHTML = `<span class="pulse"></span> ${text}`;
    }

    notify(msg, type = "info") {
        const n = this.dom.notification;
        n.textContent = msg;
        n.className = `notification ${type} visible`;
        setTimeout(() => n.className = "notification hidden", 4000);
    }

    bindEvents() {
        this.dom.capturetrigger.onclick = () => this.handleCapture();
        this.dom.closeresults.onclick = () => this.dom.resultspanel.classList.add("hidden");
        
        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
            };
        });

        this.dom.uploadlocal.onclick = () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = (e) => this.uploadToAI(e.target.files[0]);
            input.click();
        };
    }

    setupNavigation() {
        this.dom.navItems.forEach(btn => {
            btn.onclick = () => {
                const tab = btn.dataset.tab;
                if (tab === "log-out") {
                    localStorage.clear();
                    window.location.href = "login2.html";
                    return;
                }
                this.dom.navItems.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.dom.views.forEach(v => v.classList.add("hidden"));
                document.getElementById(`${tab}-section`)?.classList.remove("hidden");
            };
        });
    }

    renderUser() {
        this.dom.displayname.textContent = `Dr. ${this.state.user.name.split(' ')[0]}`;
    }
}

// Global initialization
window.addEventListener("DOMContentLoaded", () => {
    window.MedAI = new MedAICore();
});
