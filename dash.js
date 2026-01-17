/**
 * MEDAI ENTERPRISE ENGINE v1.0
 * Features: Backend Sync, Multi-Axis Keyboard Nav, PDF Export
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: { ANALYZE: "/diagnostics/process" },
            TIMEOUT: 60000,
            RETRY_ATTEMPTS: 3
        };

        this.state = {
            stream: null,
            imageCapture: null,
            activeMode: "xray",
            isProcessing: false,
            torchOn: false,
            lastResult: null,
            user: JSON.parse(localStorage.getItem("medai_user")) || { name: "Practitioner" }
        };

        this.init();
    }

    async init() {
        this.cacheSelectors();
        this.bindEvents();
        this.setupNavigation();
        this.setupKeyboardListeners();
        this.renderUser();
        
        await this.setupCamera();
        console.log("🚀 MedAI Core: Ready & Connected");
    }

    cacheSelectors() {
        this.dom = {
            video: document.getElementById("camera-stream"),
            captureBtn: document.getElementById("capture-trigger"),
            toggleTorch: document.getElementById("toggle-torch"),
            uploadLocal: document.getElementById("upload-local"),
            typeBtns: Array.from(document.querySelectorAll(".type-btn")),
            navItems: Array.from(document.querySelectorAll(".nav-item")),
            views: document.querySelectorAll(".content-view"),
            resultsPanel: document.getElementById("results-panel"),
            closeResults: document.getElementById("close-results"),
            downloadPdf: document.getElementById("download-pdf"),
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
       UI & KEYBOARD NAVIGATION (Updated with Up/Down)
    ===================================================== */
    setupKeyboardListeners() {
        window.addEventListener("keydown", (e) => {
            const isResultsOpen = !this.dom.resultsPanel.classList.contains("hidden");

            // 1. ESC: Close results panel
            if (e.key === "Escape" && isResultsOpen) {
                this.dom.closeResults.click();
            }

            // 2. Left/Right: Navigate Main Tabs
            if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !this.state.isProcessing) {
                const activeIndex = this.dom.navItems.findIndex(item => item.classList.contains("active"));
                let nextIndex = e.key === "ArrowRight" ? activeIndex + 1 : activeIndex - 1;
                if (nextIndex >= 0 && nextIndex < this.dom.navItems.length) {
                    this.dom.navItems[nextIndex].click();
                }
            }

            // 3. Up/Down: Scroll Results OR Change Diagnostic Mode
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                if (isResultsOpen) {
                    // Scroll the panel if it's open
                    const scrollAmt = e.key === "ArrowDown" ? 100 : -100;
                    this.dom.resultsPanel.scrollBy({ top: scrollAmt, behavior: 'smooth' });
                } else {
                    // Change Diagnostic Mode (Xray, MRI, etc) if panel is closed
                    const activeModeIdx = this.dom.typeBtns.findIndex(btn => btn.classList.contains("active"));
                    let nextModeIdx = e.key === "ArrowDown" ? activeModeIdx + 1 : activeModeIdx - 1;
                    
                    if (nextModeIdx >= 0 && nextModeIdx < this.dom.typeBtns.length) {
                        e.preventDefault(); // Prevent page scroll while switching modes
                        this.dom.typeBtns[nextModeIdx].click();
                    }
                }
            }
        });
    }

    displayDiagnosis(data) {
        this.state.lastResult = data;
        this.dom.resultsPanel.classList.remove("hidden");
        this.dom.resultsPanel.scrollTo({ top: 0, behavior: 'smooth' });

        const score = Math.min(100, Math.max(0, data.confidence || 0));
        if (this.dom.confidencePath) {
            this.dom.confidencePath.style.strokeDasharray = `${score}, 100`;
            this.dom.confidenceText.textContent = `${score}%`;
        }

        this.dom.resultTitle.textContent = data.diagnosis || "Analysis Complete";
        this.dom.resultDescription.textContent = data.description || "No description provided.";

        this.dom.findingsList.innerHTML = "";
        (data.findings || []).forEach((finding, index) => {
            const li = document.createElement("li");
            li.className = "animate-slide-in";
            li.style.animationDelay = `${index * 0.1}s`;
            li.innerHTML = `<span class="bullet">•</span> ${finding}`;
            this.dom.findingsList.appendChild(li);
        });

        this.notify("Results Synchronized", "success");
    }

    /* =====================================================
       PDF GENERATION SYSTEM
    ===================================================== */
    async generateReport() {
        if (!this.state.lastResult) return;
        const data = this.state.lastResult;
        
        if (typeof jspdf === "undefined") {
            this.notify("Loading PDF Engine...", "info");
            await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(22);
        doc.text("MedAI Diagnostic Report", 20, 20);
        doc.setFontSize(12);
        doc.text(`Practitioner: Dr. ${this.state.user.name}`, 20, 37);
        doc.line(20, 45, 190, 45);

        doc.setFontSize(16);
        doc.text(`Diagnosis: ${data.diagnosis}`, 20, 55);
        doc.text(`Confidence: ${data.confidence}%`, 20, 65);
        
        doc.text("Description:", 20, 80);
        doc.setFontSize(11);
        const splitDesc = doc.splitTextToSize(data.description, 165);
        doc.text(splitDesc, 20, 87);

        doc.save(`MedAI_Report_${Date.now()}.pdf`);
        this.notify("Report Downloaded", "success");
    }

    loadScript(src) {
        return new Promise((resolve) => {
            const script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    /* =====================================================
       CORE PIPELINE & EVENTS
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) return;
        this.toggleLoading(true, "Analyzing...");
        try {
            const blob = this.state.imageCapture 
                ? await this.state.imageCapture.takePhoto() 
                : await this.captureFallback();
            
            const result = await this.uploadWithRetry(blob);
            this.displayDiagnosis(result);
        } catch (e) {
            this.notify(e.message, "error");
        } finally {
            this.toggleLoading(false);
        }
    }

    async uploadWithRetry(blob, attempt = 0) {
        const fd = new FormData();
        fd.append("file", blob, `scan.jpg`);
        fd.append("type", this.state.activeMode);

        const res = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("medai_token")}` },
            body: fd
        });

        if (!res.ok) {
            if (attempt < this.config.RETRY_ATTEMPTS) return this.uploadWithRetry(blob, attempt + 1);
            throw new Error("Cloud Engine Unreachable");
        }
        return await res.json();
    }

    bindEvents() {
        this.dom.captureBtn.onclick = () => this.handleCapture();
        this.dom.closeResults.onclick = () => this.dom.resultsPanel.classList.add("hidden");
        this.dom.downloadPdf.onclick = () => this.generateReport();
        this.dom.uploadLocal.onclick = () => this.handleLocalUpload();
        
        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
            };
        });

        this.dom.toggleTorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) return;
            this.state.torchOn = !this.state.torchOn;
            await track.applyConstraints({ advanced: [{ torch: this.state.torchOn }] });
            this.dom.toggleTorch.classList.toggle("active", this.state.torchOn);
        };
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

    toggleLoading(active, text) {
        this.state.isProcessing = active;
        this.dom.captureBtn.disabled = active;
        if (this.dom.aiStatus) this.dom.aiStatus.textContent = active ? text : "AI Ready";
    }

    notify(msg, type) {
        if (!this.dom.notif) return;
        this.dom.notif.textContent = msg;
        this.dom.notif.className = `notification ${type} visible`;
        setTimeout(() => this.dom.notif.classList.remove("visible"), 4000);
    }

    async setupCamera() {
        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            this.dom.video.srcObject = this.state.stream;
            if ("ImageCapture" in window) this.state.imageCapture = new ImageCapture(this.state.stream.getVideoTracks()[0]);
        } catch (e) { this.notify("Camera offline", "warning"); }
    }

    async captureFallback() {
        const canvas = document.createElement("canvas");
        canvas.width = this.dom.video.videoWidth;
        canvas.height = this.dom.video.videoHeight;
        canvas.getContext("2d").drawImage(this.dom.video, 0, 0);
        return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.95));
    }

    async handleLocalUpload() {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "image/*";
        input.onchange = async () => {
            if (!input.files[0]) return;
            this.toggleLoading(true, "Analyzing...");
            try {
                const res = await this.uploadWithRetry(input.files[0]);
                this.displayDiagnosis(res);
            } catch (e) { this.notify("Upload failed", "error"); }
            finally { this.toggleLoading(false); }
        };
        input.click();
    }

    renderUser() {
        if (this.dom.displayName) this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
    }
}

window.addEventListener("DOMContentLoaded", () => { window.App = new MedAICore(); });
