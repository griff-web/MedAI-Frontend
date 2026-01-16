/**
 * MEDAI ENTERPRISE ENGINE v1.2.0
 * Features: Cold-start mitigation, Haptic Feedback, Enhanced UI Mapping
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: { ANALYZE: "/diagnostics/process" },
            TIMEOUT: 45000, // Increased for deep analysis
            RETRIES: 2
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
        await this.setupCamera();
        
        // Visual indicator of system health
        console.log("%c 🚀 MedAI Core: System Nominal ", "background: #006600; color: white; font-weight: bold;");
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
       CAMERA & HAPTICS
    ===================================================== */
    async setupCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 3840 }, // Aim for 4K if hardware allows
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
            this.notify("Hardware access denied. Check permissions.", "error");
        }
    }

    vibrate(pattern = 50) {
        if ("vibrate" in navigator) navigator.vibrate(pattern);
    }

    /* =====================================================
       AI PIPELINE (WITH REAL BACKEND MAPPING)
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) return;
        
        this.vibrate([30, 50, 30]); // Interaction feedback
        
        const token = localStorage.getItem("medai_token");
        if (!token) {
            this.notify("Auth Required: Redirecting...", "warning");
            setTimeout(() => window.location.href = 'login.html', 2000);
            return;
        }

        this.toggleLoading(true, "Processing high-res scan...");

        try {
            const raw = this.state.imageCapture
                ? await this.state.imageCapture.takePhoto()
                : await this.captureFallback();

            // Real backend call
            const result = await this.uploadWithRetry(raw);
            this.displayDiagnosis(result);
            this.vibrate(100); // Success pulse
            
        } catch (e) {
            console.error("Pipeline Error:", e);
            this.notify(e.message || "Engine timeout. Check connection.", "error");
        } finally {
            this.toggleLoading(false);
        }
    }

    async uploadWithRetry(blob, attempt = 1) {
        try {
            return await this.uploadToAI(blob);
        } catch (e) {
            if (attempt <= this.config.RETRIES) {
                this.updateAIStatus(`Retrying (${attempt}/${this.config.RETRIES})...`);
                await new Promise(r => setTimeout(r, 2000));
                return this.uploadWithRetry(blob, attempt + 1);
            }
            throw e;
        }
    }

    async uploadToAI(blob) {
        this.state.controller?.abort();
        this.state.controller = new AbortController();

        const fd = new FormData();
        fd.append("file", blob, "capture.jpg");
        fd.append("type", this.state.activeMode);
        fd.append("timestamp", new Date().toISOString());

        const res = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("medai_token")}` },
            body: fd,
            signal: this.state.controller.signal
        });

        if (res.status === 503) throw new Error("Server warming up...");
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: "Unknown Error" }));
            throw new Error(err.detail || "AI analysis failed.");
        }

        return res.json();
    }

    /* =====================================================
       UI REVELATION (REVEAL TRUE RESULTS)
    ===================================================== */
    displayDiagnosis(data) {
        // Reveal the hidden panel
        this.dom.resultsPanel.classList.remove("hidden");
        this.dom.resultsPanel.style.transform = "translateX(0)";

        // 1. Confidence Score Logic
        const score = Math.round(data.confidence_score || data.confidence || 0);
        if (this.dom.confidencePath) {
            // Mapping to SVG dasharray: (percentage, 100)
            this.dom.confidencePath.style.strokeDasharray = `${score}, 100`;
            this.dom.confidenceText.textContent = `${score}%`;
            
            // Dynamic Color Coding
            const color = score > 80 ? 'var(--kenya-green)' : (score > 50 ? '#f39c12' : 'var(--kenya-red)');
            this.dom.confidencePath.style.stroke = color;
        }

        // 2. Title & Narrative
        this.dom.resultTitle.textContent = data.diagnosis_label || data.diagnosis || "Undetermined";
        this.dom.resultDescription.textContent = data.clinical_narrative || data.description || "Analysis complete. Review findings below.";

        // 3. Detailed Findings Breakdown
        this.dom.findingsList.innerHTML = "";
        const findings = data.findings || ["Primary scan data processed successfully"];
        
        findings.forEach((finding, index) => {
            const li = document.createElement("li");
            li.style.animation = `slideIn 0.3s ease forwards ${index * 0.1}s`;
            li.innerHTML = `<i class="fas fa-check-circle" style="color:var(--kenya-green); margin-right:8px;"></i> ${finding}`;
            this.dom.findingsList.appendChild(li);
        });

        this.notify("Analysis Complete", "success");
    }

    /* =====================================================
       UTILITIES
    ===================================================== */
    bindEvents() {
        this.dom.captureBtn.onclick = () => this.handleCapture();
        this.dom.closeResults.onclick = () => this.dom.resultsPanel.classList.add("hidden");

        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.vibrate(20);
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
            };
        });

        this.dom.toggleTorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) return;
            try {
                this.state.torchOn = !this.state.torchOn;
                await track.applyConstraints({ advanced: [{ torch: this.state.torchOn }] });
                this.vibrate(30);
            } catch {
                this.notify("Torch hardware not found", "info");
            }
        };
    }

    toggleLoading(active, text) {
        this.state.isProcessing = active;
        this.dom.captureBtn.disabled = active;
        this.dom.captureBtn.style.opacity = active ? "0.5" : "1";
        this.updateAIStatus(active ? text : "Ready for next scan");
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
