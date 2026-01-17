/**
 * MEDAI ENTERPRISE ENGINE v1.0
 * Features: Backend Sync, Keyboard Nav, PDF Export
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
            lastResult: null, // Stores data for PDF generation
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
            downloadPdf: document.getElementById("download-pdf"), // New Selector
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
       PDF GENERATION SYSTEM
    ===================================================== */
    async generateReport() {
        if (!this.state.lastResult) return;
        const data = this.state.lastResult;
        
        // Ensure jspdf is loaded (loads from CDN if not present)
        if (typeof jspdf === "undefined") {
            this.notify("Loading PDF Engine...", "info");
            await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const timestamp = new Date().toLocaleString();

        // Styles & Content
        doc.setFontSize(22);
        doc.text("MedAI Diagnostic Report", 20, 20);
        doc.setFontSize(12);
        doc.text(`Generated: ${timestamp}`, 20, 30);
        doc.text(`Practitioner: Dr. ${this.state.user.name}`, 20, 37);
        doc.line(20, 45, 190, 45);

        doc.setFontSize(16);
        doc.text(`Diagnosis: ${data.diagnosis}`, 20, 55);
        doc.setFontSize(12);
        doc.text(`Confidence: ${data.confidence}%`, 20, 63);
        
        doc.text("Description:", 20, 75);
        doc.setFont("helvetica", "italic");
        doc.text(doc.splitTextToSize(data.description, 160), 20, 82);

        doc.setFont("helvetica", "normal");
        doc.text("Key Findings:", 20, 110);
        data.findings.forEach((f, i) => {
            doc.text(`- ${f}`, 25, 118 + (i * 7));
        });

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Disclaimer: This is an AI-generated analysis. Verify with clinical correlation.", 20, 280);

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
       UI & KEYBOARD NAVIGATION
    ===================================================== */
    setupKeyboardListeners() {
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !this.dom.resultsPanel.classList.contains("hidden")) {
                this.dom.closeResults.click();
            }
            if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !this.state.isProcessing) {
                const activeIndex = this.dom.navItems.findIndex(item => item.classList.contains("active"));
                let nextIndex = e.key === "ArrowRight" ? activeIndex + 1 : activeIndex - 1;
                if (nextIndex >= 0 && nextIndex < this.dom.navItems.length) {
                    this.dom.navItems[nextIndex].click();
                }
            }
        });
    }

    displayDiagnosis(data) {
        this.state.lastResult = data; // Cache for PDF
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
       CORE PIPELINE
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
            if (attempt < this.config.RETRY_ATTEMPTS) {
                return this.uploadWithRetry(blob, attempt + 1);
            }
            throw new Error("Cloud Engine Unreachable");
        }
        return await res.json();
    }

    bindEvents() {
        this.dom.captureBtn.onclick = () => this.handleCapture();
        this.dom.closeResults.onclick = () => this.dom.resultsPanel.classList.add("hidden");
        this.dom.downloadPdf.onclick = () => this.generateReport(); // Link PDF button
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

    // Helper functions
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

    renderUser() {
        if (this.dom.displayName) this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
    }
}

window.addEventListener("DOMContentLoaded", () => { window.App = new MedAICore(); });
