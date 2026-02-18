/**
 * MEDAI ENTERPRISE ENGINE v2.4 (Intelligence & Feedback Edition)
 * - Added: Real-time Status Sequencer
 * - Added: Staggered Results Injection (Visual "Thinking")
 * - Added: Auto-saving UI State
 * - Added: Vibration/Haptic Feedback (Mobile)
 */

(() => {
    "use strict";

    class Config {
        static API_BASE = "https://ai-p17b.onrender.com";
        static ENDPOINTS = { ANALYZE: "/diagnostics/process" };
        static STATUS_MESSAGES = [
            "Initializing Neural Network...",
            "Enhancing Contrast Markers...",
            "Detecting Pathological Anomalies...",
            "Cross-referencing Medical Database...",
            "Finalizing Diagnostic Report..."
        ];
    }

    class MedAIApp {
        constructor() {
            this.state = {
                activeMode: localStorage.getItem("medai_pref_mode") || "xray",
                isProcessing: false,
                lastResult: null,
                user: JSON.parse(localStorage.getItem("medai_user") || '{"name":"Practitioner"}')
            };
            this.dom = {};
            this.camera = null;
        }

        init() {
            this.cacheDOM();
            this.bindEvents();
            this.initCamera();
            this.renderUser();
            this.applySavedState();
        }

        cacheDOM() {
            const $ = id => document.getElementById(id);
            this.dom = {
                video: $("camera-stream"),
                captureBtn: $("capture-trigger"),
                notification: $("notification"),
                aiStatus: $("ai-status"),
                modeButtons: document.querySelectorAll(".type-btn"),
                navItems: document.querySelectorAll(".nav-item"),
                sections: document.querySelectorAll(".content-view"),
                resultsPanel: $("results-panel"),
                closeResults: $("close-results"),
                resultTitle: $("result-title"),
                resultDescription: $("result-description"),
                findingsList: $("findings-list"),
                confidenceText: $("confidence-text"),
                confidencePath: $("confidence-path"),
                downloadPdf: $("download-pdf"),
                displayName: $("display-name")
            };
        }

        applySavedState() {
            // Restore last used mode (X-ray, CT, etc.)
            const savedMode = this.state.activeMode;
            this.dom.modeButtons.forEach(btn => {
                if (btn.dataset.type === savedMode) btn.classList.add("active");
                else btn.classList.remove("active");
            });
        }

        bindEvents() {
            // Mode Selectors
            this.dom.modeButtons.forEach(btn => {
                btn.addEventListener("click", (e) => {
                    this.hapticFeedback(10);
                    this.dom.modeButtons.forEach(b => b.classList.remove("active"));
                    e.currentTarget.classList.add("active");
                    this.state.activeMode = e.currentTarget.dataset.type;
                    localStorage.setItem("medai_pref_mode", this.state.activeMode);
                });
            });

            // Tab Navigation
            this.dom.navItems.forEach(nav => {
                nav.addEventListener("click", (e) => {
                    this.hapticFeedback(5);
                    const targetTab = e.currentTarget.dataset.tab;
                    if(targetTab === "log-out") return;
                    this.dom.navItems.forEach(n => n.classList.remove("active"));
                    e.currentTarget.classList.add("active");
                    this.dom.sections.forEach(sec => {
                        sec.classList.toggle("hidden", sec.id !== `${targetTab}-section`);
                    });
                });
            });

            this.dom.captureBtn?.addEventListener("click", () => this.handleCapture());
            this.dom.closeResults?.addEventListener("click", () => {
                this.dom.resultsPanel.classList.add("hidden");
            });
        }

        hapticFeedback(ms) {
            if ("vibrate" in navigator) navigator.vibrate(ms);
        }

        async handleCapture() {
            if (this.state.isProcessing) return;
            this.hapticFeedback([20, 50, 20]);
            this.setLoading(true);
            
            // Start AI Status Sequencer
            let statusIdx = 0;
            const statusInterval = setInterval(() => {
                if (statusIdx < Config.STATUS_MESSAGES.length) {
                    this.dom.aiStatus.textContent = Config.STATUS_MESSAGES[statusIdx++];
                }
            }, 1200);

            try {
                const blob = await this.captureFrame();
                const fd = new FormData();
                fd.append("file", blob, "scan.jpg");
                fd.append("type", this.state.activeMode);

                const response = await fetch(`${Config.API_BASE}${Config.ENDPOINTS.ANALYZE}`, {
                    method: "POST",
                    body: fd,
                    headers: { 'Authorization': `Bearer ${localStorage.getItem("medai_token") || ""}` }
                });

                if (!response.ok) throw new Error("Network Response Error");
                
                const data = await response.json();
                clearInterval(statusInterval);
                this.displayResults(data);

            } catch (err) {
                clearInterval(statusInterval);
                this.notify("Analysis Failed: Check Connection", "error");
            } finally {
                this.setLoading(false);
            }
        }

        async displayResults(data) {
            this.state.lastResult = data;
            this.dom.resultsPanel.classList.remove("hidden");
            
            // Reset UI for animation
            this.dom.resultTitle.textContent = "Synthesizing...";
            this.dom.findingsList.innerHTML = "";
            this.updateConfidence(0);

            // Staggered Reveal Animation
            await this.sleep(600);
            this.dom.resultTitle.textContent = data.diagnosis;
            this.dom.resultDescription.textContent = data.description;
            this.updateConfidence(data.confidence || 0);

            // Staggered list items
            for (const finding of (data.findings || [])) {
                await this.sleep(300);
                const li = document.createElement("li");
                li.className = "animate-fade-in";
                li.innerHTML = `<i class="icon">🔹</i> ${finding}`;
                this.dom.findingsList.appendChild(li);
                this.hapticFeedback(5);
            }
        }

        updateConfidence(score) {
            this.dom.confidenceText.textContent = `${score}%`;
            this.dom.confidencePath.style.strokeDasharray = `${score}, 100`;
            // Color shift based on confidence
            const color = score > 80 ? "#10b981" : score > 50 ? "#f59e0b" : "#ef4444";
            this.dom.confidencePath.style.stroke = color;
        }

        captureFrame() {
            const canvas = document.createElement("canvas");
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;
            canvas.getContext("2d").drawImage(this.dom.video, 0, 0);
            return new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
        }

        setLoading(isLoading) {
            this.state.isProcessing = isLoading;
            this.dom.captureBtn.disabled = isLoading;
            this.dom.captureBtn.classList.toggle("pulse-animation", isLoading);
            if (!isLoading) this.dom.aiStatus.textContent = "AI READY";
        }

        sleep = ms => new Promise(r => setTimeout(r, ms));

        notify(msg, type) {
            this.dom.notification.textContent = msg;
            this.dom.notification.className = `notification-toast visible ${type}`;
            setTimeout(() => this.dom.notification.classList.remove("visible"), 4000);
        }

        renderUser() {
            if(this.dom.displayName) this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
        }

        async initCamera() {
            try {
                this.cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment", focusMode: "continuous" }
                });
                this.dom.video.srcObject = this.cameraStream;
            } catch (e) {
                this.notify("Camera Access Required", "error");
            }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        window.App = new MedAIApp();
        window.App.init();
    });
})();
