/**
 * MEDAI ENTERPRISE ENGINE v2.5.0
 * Status: Production Ready | Integrated Module
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: { ANALYZE: "/diagnostics/process" },
            TIMEOUT: 60000, // 60s for cold-start tolerance
            RETRY_ATTEMPTS: 3
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
        
        // Connect to hardware
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
            // Results mapping
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
       CAMERA SYSTEM (Refined)
    ===================================================== */
    async setupCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 3840 }, // Target 4K if available
                    height: { ideal: 2160 }
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
        const ctx = canvas.getContext("2d");
        // Slight medical-grade sharpening
        ctx.filter = "contrast(1.1) brightness(1.05)";
        ctx.drawImage(this.dom.video, 0, 0);
        return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.95));
    }

    /* =====================================================
       AI PIPELINE (With Exponential Backoff)
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) return;

        const token = localStorage.getItem("medai_token");
        if (!token) {
            this.notify("Session expired. Please log in.", "error");
            setTimeout(() => window.location.href = 'index.html', 1500);
            return;
        }

        try {
            this.toggleLoading(true, "Capturing Scan...");
            
            const raw = this.state.imageCapture
                ? await this.state.imageCapture.takePhoto()
                : await this.captureFallback();

            // Perform upload with retry logic to handle Render "Cold Starts"
            const result = await this.uploadWithRetry(raw);
            this.displayDiagnosis(result);
            
        } catch (e) {
            this.notify(e.message || "Analysis failed.", "error");
        } finally {
            this.toggleLoading(false);
        }
    }

    async uploadWithRetry(blob, attempt = 0) {
        this.updateAIStatus(`AI Analyzing (Attempt ${attempt + 1})...`);
        
        this.state.controller?.abort();
        this.state.controller = new AbortController();
        const timeoutId = setTimeout(() => this.state.controller.abort(), this.config.TIMEOUT);

        const fd = new FormData();
        fd.append("file", blob, `scan_${Date.now()}.jpg`);
        fd.append("type", this.state.activeMode);

        try {
            const res = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${localStorage.getItem("medai_token")}` },
                body: fd,
                signal: this.state.controller.signal
            });

            clearTimeout(timeoutId);

            if (res.status === 401) throw new Error("Unauthorized. Please log in again.");
            if (!res.ok) throw new Error(`Server error: ${res.status}`);

            return await res.json();

        } catch (err) {
            if (attempt < this.config.RETRY_ATTEMPTS && err.name !== 'AbortError') {
                const delay = 1000 * Math.pow(2, attempt); // Exponential Backoff
                await new Promise(r => setTimeout(r, delay));
                return this.uploadWithRetry(blob, attempt + 1);
            }
            throw new Error("AI Engine unresponsive. Check connection.");
        }
    }

    /* =====================================================
       UI & TRUE RESULTS REVEAL
    ===================================================== */
    displayDiagnosis(data) {
        // Ensure UI is visible
        this.dom.resultsPanel.classList.remove("hidden");
        this.dom.resultsPanel.scrollTo(0,0);

        // 1. Confidence Gauge Update
        const score = Math.min(100, Math.max(0, data.confidence || 0));
        if (this.dom.confidencePath) {
            // formula for SVG circle: dash-offset = 100 - score
            this.dom.confidencePath.style.strokeDasharray = `${score}, 100`;
            this.dom.confidenceText.textContent = `${score}%`;
        }

        // 2. Reveal True Results from Backend
        this.dom.resultTitle.textContent = data.diagnosis || "Undetermined Scan";
        this.dom.resultDescription.textContent = data.description || "The AI could not provide a specific description for this scan.";

        // 3. Dynamic Findings List
        this.dom.findingsList.innerHTML = "";
        const findings = data.findings || ["Inconclusive reading - verify image quality"];
        findings.forEach((finding, index) => {
            const li = document.createElement("li");
            li.style.animationDelay = `${index * 0.1}s`;
            li.className = "animate-slide-in";
            li.innerHTML = `<span class="bullet">•</span> ${finding}`;
            this.dom.findingsList.appendChild(li);
        });

        this.notify("Diagnosis Loaded Successfully", "success");
    }

    bindEvents() {
        this.dom.captureBtn.onclick = () => this.handleCapture();

        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
                this.notify(`Switched to ${this.state.activeMode.toUpperCase()} mode`, "info");
            };
        });

        this.dom.closeResults.onclick = () => this.dom.resultsPanel.classList.add("hidden");

        this.dom.toggleTorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) return;
            try {
                this.state.torchOn = !this.state.torchOn;
                await track.applyConstraints({ advanced: [{ torch: this.state.torchOn }] });
                this.dom.toggleTorch.classList.toggle("active", this.state.torchOn);
            } catch {
                this.notify("Torch hardware not detected.", "info");
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
            this.toggleLoading(true, "Uploading File...");
            try {
                const result = await this.uploadWithRetry(input.files[0]);
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
                const targetView = document.getElementById(`${btn.dataset.tab}-section`);
                if (targetView) targetView.classList.remove("hidden");
            };
        });
    }

    toggleLoading(active, text = "AI Analyzing...") {
        this.state.isProcessing = active;
        this.dom.captureBtn.disabled = active;
        this.dom.captureBtn.classList.toggle("loading-pulse", active);
        this.updateAIStatus(active ? text : "AI Ready");
    }

    updateAIStatus(text) {
        if (this.dom.aiStatus) this.dom.aiStatus.textContent = text;
    }

    notify(message, type = "info") {
        if (!this.dom.notif) return;
        this.dom.notif.textContent = message;
        this.dom.notif.className = `notification ${type} visible`;
        
        clearTimeout(this.notifTimer);
        this.notifTimer = setTimeout(() => {
            this.dom.notif.classList.remove("visible");
        }, 4000);
    }

    renderUser() {
        if (this.dom.displayName) {
            this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
        }
    }
}

// Global Instantation
window.addEventListener("DOMContentLoaded", () => {
    window.App = new MedAICore();
});
