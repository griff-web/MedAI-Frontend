/**
 * MEDAI ENTERPRISE ENGINE v1.2.5
 * Restoration of Original Logic + High-Fidelity Result Mapping
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: { ANALYZE: "/diagnostics/process" },
            TIMEOUT: 40000 
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
        this.setupNavigation(); // Restored exact original nav logic
        this.renderUser();
        await this.setupCamera();
        console.log("🚀 MedAI System: Online and Synchronized");
    }

    cacheSelectors() {
        this.dom = {
            // Camera & Controls
            video: document.getElementById("camera-stream"),
            captureBtn: document.getElementById("capture-trigger"),
            toggleTorch: document.getElementById("toggle-torch"),
            uploadLocal: document.getElementById("upload-local"),
            
            // UI Navigation
            typeBtns: document.querySelectorAll(".type-btn"),
            navItems: document.querySelectorAll(".nav-item"),
            views: document.querySelectorAll(".content-view"),
            
            // Results Panel Elements
            resultsPanel: document.getElementById("results-panel"),
            closeResults: document.getElementById("close-results"),
            aiStatus: document.getElementById("ai-status"),
            
            // Revelation Mapping (The "True Results")
            confidencePath: document.getElementById("confidence-path"),
            confidenceText: document.getElementById("confidence-text"),
            resultTitle: document.getElementById("result-title"),
            resultDescription: document.getElementById("result-description"),
            findingsList: document.getElementById("findings-list"),
            
            // User & System
            displayName: document.getElementById("display-name"),
            notif: document.getElementById("notification")
        };
    }

    /* ===================== CAMERA SYSTEM ===================== */
    async setupCamera() {
        try {
            const constraints = {
                video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
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

    /* ===================== AI PIPELINE & REVELATION ===================== */
    async handleCapture() {
        if (this.state.isProcessing) return;

        const token = localStorage.getItem("medai_token");
        if (!token) {
            this.notify("Session expired. Please log in.", "error");
            return;
        }

        this.toggleLoading(true, "Capturing Scan...");

        try {
            const raw = this.state.imageCapture
                ? await this.state.imageCapture.takePhoto()
                : await this.captureFallback();

            this.updateAIStatus("AI Analyzing Pattern...");
            const result = await this.uploadToAI(raw);
            
            // The Revelation
            this.revealTrueResults(result);
            
        } catch (e) {
            this.notify(e.message || "Connection Error", "error");
        } finally {
            this.toggleLoading(false);
        }
    }

    async uploadToAI(blob) {
        this.state.controller?.abort();
        this.state.controller = new AbortController();

        const fd = new FormData();
        fd.append("file", blob, "scan.jpg");
        fd.append("type", this.state.activeMode);

        const res = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
            body: fd,
            signal: this.state.controller.signal
        });

        if (!res.ok) throw new Error("AI Engine Busy. Try again.");
        return res.json();
    }

    revealTrueResults(data) {
        // Show panel with your original .hidden toggle
        this.dom.resultsPanel.classList.remove("hidden");

        // 1. Map Confidence (The Circular Chart)
        const score = data.confidence || 0;
        if (this.dom.confidencePath) {
            this.dom.confidencePath.style.strokeDasharray = `${score}, 100`;
            this.dom.confidenceText.textContent = `${score}%`;
        }

        // 2. Map Diagnosis Labels
        this.dom.resultTitle.textContent = data.diagnosis || "Undetermined Scan";
        this.dom.resultDescription.textContent = data.description || "No anomalies found in the analyzed frame.";

        // 3. Populate Findings List
        this.dom.findingsList.innerHTML = "";
        const findings = data.findings || ["Normal physiological appearance detected."];
        findings.forEach(f => {
            const li = document.createElement("li");
            li.textContent = f;
            this.dom.findingsList.appendChild(li);
        });

        this.notify("Scan Processed Successfully", "success");
    }

    /* ===================== NAVIGATION & EVENTS ===================== */
    setupNavigation() {
        this.dom.navItems.forEach(btn => {
            btn.onclick = () => {
                // Remove active from all nav
                this.dom.navItems.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                // Hide all views, show target view (Original Logic)
                const targetId = `${btn.dataset.tab}-section`;
                this.dom.views.forEach(v => v.classList.add("hidden"));
                document.getElementById(targetId)?.classList.remove("hidden");
            };
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
                this.notify("Torch not supported", "info");
            }
        };

        this.dom.uploadLocal.onclick = () => this.handleLocalUpload();
    }

    /* ===================== UTILS ===================== */
    toggleLoading(active, text = "AI Analyzing...") {
        this.state.isProcessing = active;
        this.dom.captureBtn.disabled = active;
        this.updateAIStatus(active ? text : "AI Ready");
    }

    updateAIStatus(text) {
        if (this.dom.aiStatus) this.dom.aiStatus.textContent = text;
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
        if (this.dom.displayName) this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
    }
}

window.addEventListener("DOMContentLoaded", () => new MedAICore());
