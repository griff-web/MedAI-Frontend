(() => {
"use strict";

/*
 * MEDAI ENTERPRISE ENGINE v3.2 (Stability + Security Hardened)
 * Integrated with MedAI Authentication System
 */

class Config {
    // Use the same API base as auth.js
    static API_BASE = window.ENV_API_BASE || "https://medai-backend-j9i6.onrender.com";
    static ENDPOINT = "/diagnostics/process";
    static REQUEST_TIMEOUT = 30000;
    static MAX_RETRIES = 2;
    static MAX_FILE_SIZE = 50 * 1024 * 1024;
    static COOLDOWN_MS = 3000;
    static RETRYABLE_STATUS = [502, 503, 504];
}

class MedAIApp {

    constructor() {
        this.state = {
            isProcessing: false,
            lastRequestTime: 0,
            isOnline: navigator.onLine,
            isAuthenticated: false,
            currentUser: null,
            activeTab: 'scanner'
        };

        this.dom = {};
        this.cameraStream = null;
        this.fileInput = null;
    }

    /* ---------------- INIT ---------------- */

    async init() {
        // Check authentication first
        if (!this.checkAuthentication()) {
            return; // redirect happens in checkAuthentication
        }

        this.cacheDOM();
        this.bindEvents();
        this.bindNetworkEvents();
        this.initCamera();
        this.createFileInput();
        this.injectDisclaimer();
        this.setupAuthListener();
        this.updateUserInfo();
        
        // Initialize tab navigation
        this.initTabNavigation();
    }

    checkAuthentication() {
        // Check if MedAI global object exists (from auth.js)
        if (window.MedAI && window.MedAI.isAuthenticated()) {
            this.state.isAuthenticated = true;
            this.state.currentUser = window.MedAI.getUser();
            return true;
        }
        
        // Fallback: check localStorage directly
        const token = localStorage.getItem("medai_token");
        if (token) {
            // Validate token with server
            this.validateToken(token);
            return true;
        }
        
        // Not authenticated, redirect to login
        window.location.href = '/login.html';
        return false;
    }

    async validateToken(token) {
        try {
            const response = await fetch(`${Config.API_BASE}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.state.isAuthenticated = true;
                this.state.currentUser = data.user;
            } else {
                // Token invalid
                this.logout();
            }
        } catch (error) {
            console.error("Token validation failed:", error);
            // Don't logout on network error, assume still authenticated
        }
    }

    logout() {
        if (window.MedAI) {
            window.MedAI.logout();
        } else {
            // Fallback logout
            localStorage.removeItem("medai_token");
            localStorage.removeItem("medai_user");
            sessionStorage.removeItem("medai_token");
            sessionStorage.removeItem("medai_user");
            window.location.href = '/login.html';
        }
    }

    setupAuthListener() {
        // Listen for auth changes from auth.js
        if (window.MedAI) {
            window.MedAI.onAuthChange(({ authenticated, user }) => {
                this.state.isAuthenticated = authenticated;
                this.state.currentUser = user;
                
                if (!authenticated) {
                    window.location.href = '/login.html';
                } else {
                    this.updateUserInfo();
                }
            });
        }
    }

    updateUserInfo() {
        const user = this.state.currentUser || (window.MedAI && window.MedAI.getUser());
        
        if (user) {
            // Update user name in navigation
            const displayNameEl = document.getElementById('display-name');
            if (displayNameEl) {
                displayNameEl.textContent = user.name || 'Medical Practitioner';
            }
            
            // Update user role
            const userRoleEl = document.querySelector('.user-role');
            if (userRoleEl) {
                userRoleEl.textContent = this.formatRole(user.role || 'user');
            }
            
            // Update avatar with initials
            const avatarEl = document.getElementById('avatar-circle');
            if (avatarEl && user.name) {
                const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                avatarEl.textContent = initials || 'MD';
            }
        }
    }

    formatRole(role) {
        const roles = {
            'user': 'General Practitioner',
            'doctor': 'Radiologist',
            'admin': 'Administrator'
        };
        return roles[role] || role;
    }

    cacheDOM() {
        const $ = id => document.getElementById(id);
        this.dom = {
            // Navigation elements
            navItems: document.querySelectorAll('.nav-item'),
            logoutBtn: document.querySelector('.logout-trigger'),
            
            // Scanner elements
            video: $("camera-stream"),
            captureBtn: $("capture-trigger"),
            uploadLocal: $("upload-local"),
            torchBtn: $("toggle-torch"),
            closeResultsBtn: $("close-results"),
            medBotBtn: $("MedBot-btn"),
            
            // Sections
            scannerSection: $("scanner-section"),
            historySection: $("history-section"),
            analyticsSection: $("analytics-section"),
            
            // Results panel
            resultsPanel: $("results-panel"),
            resultTitle: $("result-title"),
            resultDescription: $("result-description"),
            findingsList: $("findings-list"),
            confidenceText: $("confidence-text"),
            confidencePath: $("confidence-path"),
            
            // Notification
            notification: $("notification"),
            
            // History elements
            historyList: $("history-list"),
            searchInput: document.querySelector('.search-input'),
            
            // Scan type buttons
            scanTypeBtns: document.querySelectorAll('.type-btn')
        };
    }

    bindEvents() {
        // Capture and upload events
        this.dom.captureBtn?.addEventListener("click", () => this.safeCapture());
        this.dom.uploadLocal?.addEventListener("click", () => this.fileInput?.click());
        
        // Torch toggle (if supported)
        this.dom.torchBtn?.addEventListener("click", () => this.toggleTorch());
        
        // Close results panel
        this.dom.closeResultsBtn?.addEventListener("click", () => {
            this.dom.resultsPanel?.classList.add("hidden");
        });
        
        // MedBot button
        this.dom.medBotBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            window.open('MedBot.html', '_blank');
        });
        
        // Logout button
        this.dom.logoutBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            this.logout();
        });
        
        // Scan type selection
        this.dom.scanTypeBtns?.forEach(btn => {
            btn.addEventListener("click", (e) => {
                this.dom.scanTypeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                // Update scan type in state
                this.state.scanType = btn.dataset.type;
            });
        });
        
        // History search
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener("input", (e) => {
                this.filterHistory(e.target.value);
            });
        }
    }

    initTabNavigation() {
        this.dom.navItems?.forEach(item => {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                
                // Don't trigger for logout button
                if (item.classList.contains('logout-trigger')) return;
                
                const tab = item.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tab) {
        // Update active state in navigation
        this.dom.navItems?.forEach(item => {
            if (!item.classList.contains('logout-trigger')) {
                item.classList.remove('active');
                if (item.dataset.tab === tab) {
                    item.classList.add('active');
                }
            }
        });
        
        // Show/hide sections
        this.dom.scannerSection?.classList.add('hidden');
        this.dom.historySection?.classList.add('hidden');
        this.dom.analyticsSection?.classList.add('hidden');
        
        switch(tab) {
            case 'scanner':
                this.dom.scannerSection?.classList.remove('hidden');
                break;
            case 'history':
                this.dom.historySection?.classList.remove('hidden');
                this.loadHistory();
                break;
            case 'analytics':
                this.dom.analyticsSection?.classList.remove('hidden');
                this.loadAnalytics();
                break;
        }
        
        this.state.activeTab = tab;
    }

    bindNetworkEvents() {
        window.addEventListener("online", () => {
            this.state.isOnline = true;
            this.updateAIStatus("AI READY", "online");
        });
        
        window.addEventListener("offline", () => {
            this.state.isOnline = false;
            this.updateAIStatus("OFFLINE", "offline");
            this.notify("You are offline. Network required for analysis.", "warning");
        });
    }

    updateAIStatus(text, status) {
        const statusEl = document.getElementById('ai-status');
        const container = document.getElementById('ai-status-container');
        
        if (statusEl) statusEl.textContent = text;
        if (container) {
            container.className = `ai-status-badge ${status}`;
        }
    }

    /* ---------------- SECURITY CORE ---------------- */

    async fetchSecure(url, options = {}) {
        // Get token from auth.js first, then fallback to localStorage
        let token = '';
        if (window.MedAI) {
            token = window.MedAI.getToken() || '';
        } else {
            token = localStorage.getItem("medai_token") || "";
        }

        for (let attempt = 0; attempt <= Config.MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT);

            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'Authorization': token ? `Bearer ${token}` : '',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    signal: controller.signal,
                    credentials: 'include'
                });

                clearTimeout(timeout);

                // Handle unauthorized - token expired
                if (response.status === 401) {
                    this.notify("Session expired. Please login again.", "error");
                    setTimeout(() => this.logout(), 2000);
                    throw new Error("Unauthorized");
                }

                if (!response.ok) {
                    if (
                        Config.RETRYABLE_STATUS.includes(response.status) &&
                        attempt < Config.MAX_RETRIES
                    ) {
                        await this.sleep(1000 * (attempt + 1));
                        continue;
                    }
                    throw new Error(`Server error ${response.status}`);
                }

                return response;

            } catch (err) {
                clearTimeout(timeout);
                if (err.name === 'AbortError') {
                    throw new Error('Request timeout');
                }
                if (attempt >= Config.MAX_RETRIES) throw err;
                await this.sleep(1000 * (attempt + 1));
            }
        }
    }

    validateResponseSchema(data) {
        return (
            data &&
            typeof data === "object" &&
            typeof data.diagnosis === "string" &&
            Array.isArray(data.findings) &&
            typeof data.confidence === "number"
        );
    }

    async validateFileSignature(file) {
        const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());

        if (header[0] === 0xFF && header[1] === 0xD8) return true; // JPEG
        if (header[0] === 0x89 && header[1] === 0x50) return true; // PNG
        if (header[0] === 0x52 && header[1] === 0x49) return true; // WEBP
        if ((header[0] === 0x49 && header[1] === 0x49) ||
            (header[0] === 0x4D && header[1] === 0x4D)) return true; // TIFF

        // DICOM check
        try {
            const dicomCheck = new TextDecoder().decode(
                new Uint8Array(await file.slice(128, 132).arrayBuffer())
            );
            return dicomCheck === "DICM";
        } catch {
            return false;
        }
    }

    rateLimitCheck() {
        const now = Date.now();
        if (now - this.state.lastRequestTime < Config.COOLDOWN_MS) {
            this.notify("Please wait before next request.", "warning");
            return false;
        }
        this.state.lastRequestTime = now;
        return true;
    }

    /* ---------------- TORCH CONTROL ---------------- */

    async toggleTorch() {
        if (!this.cameraStream) {
            this.notify("Camera not initialized", "error");
            return;
        }

        const track = this.cameraStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities && track.getCapabilities();
        
        if (!capabilities || !capabilities.torch) {
            this.notify("Torch not supported on this device", "warning");
            return;
        }

        try {
            const currentTorch = track.getConstraints().torch || false;
            await track.applyConstraints({ 
                advanced: [{ torch: !currentTorch }] 
            });
            this.dom.torchBtn.textContent = !currentTorch ? '🔆' : '🔦';
        } catch (err) {
            console.error("Torch toggle failed:", err);
            this.notify("Could not toggle flash", "error");
        }
    }

    /* ---------------- ANALYSIS ---------------- */

    async safeCapture() {
        if (this.state.isProcessing || !this.state.isOnline) return;
        if (!this.rateLimitCheck()) return;

        try {
            this.updateAIStatus("PROCESSING", "processing");
            const blob = await this.captureFrame();
            await this.sendForAnalysis(blob, "capture.jpg");
            this.updateAIStatus("AI READY", "ready");
        } catch (error) {
            console.error("Capture failed:", error);
            this.updateAIStatus("ERROR", "error");
            this.notify("Capture failed. Please try again.", "error");
        }
    }

    async sendForAnalysis(file, filename) {
        if (this.state.isProcessing) return;
        this.setLoading(true);

        try {
            const fd = new FormData();
            fd.append("file", file, filename);
            
            // Add scan type to request
            if (this.state.scanType) {
                fd.append("type", this.state.scanType);
            }

            const response = await this.fetchSecure(
                `${Config.API_BASE}${Config.ENDPOINT}`,
                { method: "POST", body: fd }
            );

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("Invalid JSON response from server");
            }

            if (!this.validateResponseSchema(data)) {
                throw new Error("Invalid response schema");
            }

            this.displayResults(data);
            
            // Save to history (local storage for demo)
            this.saveToHistory(data);

        } catch (err) {
            console.error("Analysis error:", err);
            this.notify(err.message || "Analysis failed. Please try again.", "error");
        } finally {
            this.setLoading(false);
        }
    }

    async processLocalFile(file) {
        if (file.size > Config.MAX_FILE_SIZE) {
            this.notify("File too large. Maximum size is 50MB.", "error");
            return;
        }

        if (!(await this.validateFileSignature(file))) {
            this.notify("Unsupported or invalid file format.", "error");
            return;
        }

        await this.sendForAnalysis(file, file.name);
        this.fileInput.value = ""; // allow re-upload of same file
    }

    /* ---------------- HISTORY MANAGEMENT ---------------- */

    saveToHistory(result) {
        let history = JSON.parse(localStorage.getItem('medai_history') || '[]');
        
        const historyItem = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            diagnosis: result.diagnosis,
            confidence: result.confidence,
            findings: result.findings,
            scanType: this.state.scanType || 'xray',
            patientId: this.generatePatientId()
        };
        
        history.unshift(historyItem);
        
        // Keep only last 50 items
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        
        localStorage.setItem('medai_history', JSON.stringify(history));
    }

    generatePatientId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let id = 'PT-';
        for (let i = 0; i < 6; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    async loadHistory() {
        if (!this.dom.historyList) return;
        
        const history = JSON.parse(localStorage.getItem('medai_history') || '[]');
        
        if (history.length === 0) {
            this.dom.historyList.innerHTML = '<div class="empty-state">No recent scans found. Start by capturing an image.</div>';
            return;
        }
        
        this.dom.historyList.innerHTML = history.map(item => `
            <div class="history-card" data-id="${item.id}">
                <div class="history-header">
                    <span class="history-type">${item.scanType.toUpperCase()}</span>
                    <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                </div>
                <div class="history-body">
                    <h4>${item.diagnosis}</h4>
                    <p>Patient: ${item.patientId}</p>
                    <div class="history-confidence">
                        <div class="confidence-bar" style="width: ${item.confidence}%"></div>
                        <span>${item.confidence}% confidence</span>
                    </div>
                </div>
                <button class="history-view-btn" onclick="viewHistoryItem('${item.id}')">View Details</button>
            </div>
        `).join('');
    }

    filterHistory(searchTerm) {
        const history = JSON.parse(localStorage.getItem('medai_history') || '[]');
        const filtered = history.filter(item => 
            item.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.diagnosis.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        // Re-render filtered results
        // ... implementation
    }

    async loadAnalytics() {
        // Placeholder for analytics
        const analyticsEl = document.querySelector('.analytics-placeholder');
        if (analyticsEl) {
            analyticsEl.innerHTML = `
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <h3>Total Scans</h3>
                        <p class="stat-large">${this.getTotalScans()}</p>
                    </div>
                    <div class="analytics-card">
                        <h3>Avg Confidence</h3>
                        <p class="stat-large">${this.getAverageConfidence()}%</p>
                    </div>
                </div>
            `;
        }
    }

    getTotalScans() {
        const history = JSON.parse(localStorage.getItem('medai_history') || '[]');
        return history.length;
    }

    getAverageConfidence() {
        const history = JSON.parse(localStorage.getItem('medai_history') || '[]');
        if (history.length === 0) return 0;
        const sum = history.reduce((acc, item) => acc + item.confidence, 0);
        return Math.round(sum / history.length);
    }

    /* ---------------- SAFE DOM RENDERING ---------------- */

    displayResults(data) {
        this.dom.resultsPanel?.classList.remove("hidden");

        // Update diagnosis
        if (this.dom.resultTitle) {
            this.dom.resultTitle.textContent = data.diagnosis || "Analysis Complete";
        }
        
        if (this.dom.resultDescription) {
            this.dom.resultDescription.textContent =
                data.description || "AI-assisted interpretation provided. Clinical correlation recommended.";
        }

        this.updateConfidence(data.confidence);

        // Update findings list
        if (this.dom.findingsList) {
            this.dom.findingsList.innerHTML = "";
            
            if (data.findings && data.findings.length > 0) {
                data.findings.forEach(item => {
                    const li = document.createElement("li");
                    li.className = "finding-item";
                    li.innerHTML = `<span class="finding-bullet">•</span> ${String(item)}`;
                    this.dom.findingsList.appendChild(li);
                });
            } else {
                const li = document.createElement("li");
                li.className = "finding-item empty";
                li.textContent = "No specific findings detected";
                this.dom.findingsList.appendChild(li);
            }
        }

        // Scroll to results on mobile
        if (window.innerWidth <= 768) {
            this.dom.resultsPanel?.scrollIntoView({ behavior: 'smooth' });
        }
    }

    updateConfidence(score) {
        const value = Math.max(0, Math.min(100, Number(score) || 0));
        
        if (this.dom.confidenceText) {
            this.dom.confidenceText.textContent = `${value}%`;
        }

        if (this.dom.confidencePath) {
            this.dom.confidencePath.style.strokeDasharray = `${value},100`;
            
            // Update color based on confidence
            if (value >= 80) {
                this.dom.confidencePath.style.stroke = 'var(--kenya-green)';
            } else if (value >= 60) {
                this.dom.confidencePath.style.stroke = 'var(--warning)';
            } else {
                this.dom.confidencePath.style.stroke = 'var(--kenya-red)';
            }
        }
    }

    /* ---------------- CAMERA ---------------- */

    async initCamera() {
        try {
            // Check if media devices are supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.notify("Camera not supported on this device", "error");
                return;
            }

            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };

            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

            if (this.dom.video) {
                this.dom.video.srcObject = this.cameraStream;
                this.dom.video.setAttribute("playsinline", true);
                
                try {
                    await this.dom.video.play();
                } catch (playError) {
                    console.warn("Auto-play failed:", playError);
                }
                
                this.updateAIStatus("AI READY", "ready");
            }

        } catch (error) {
            console.error("Camera initialization failed:", error);
            
            let errorMessage = "Camera unavailable.";
            if (error.name === 'NotAllowedError') {
                errorMessage = "Camera access denied. Please grant permission.";
            } else if (error.name === 'NotFoundError') {
                errorMessage = "No camera found on this device.";
            } else if (error.name === 'NotReadableError') {
                errorMessage = "Camera is already in use by another application.";
            }
            
            this.notify(errorMessage, "error");
            this.updateAIStatus("CAMERA ERROR", "error");
        }
    }

    captureFrame() {
        return new Promise((resolve, reject) => {
            if (!this.dom.video || !this.dom.video.videoWidth) {
                reject(new Error("Video not ready"));
                return;
            }

            const canvas = document.createElement("canvas");
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            ctx.drawImage(this.dom.video, 0, 0);

            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Failed to capture image"));
                }
            }, "image/jpeg", 0.95);
        });
    }

    /* ---------------- UI HELPERS ---------------- */

    setLoading(state) {
        this.state.isProcessing = state;
        if (this.dom.captureBtn) {
            this.dom.captureBtn.disabled = state;
            this.dom.captureBtn.classList.toggle('processing', state);
        }
    }

    notify(msg, type) {
        if (!this.dom.notification) return;
        
        this.dom.notification.textContent = msg;
        this.dom.notification.className = `notification-toast visible ${type}`;

        setTimeout(() => {
            this.dom.notification?.classList.remove("visible");
        }, 4000);
    }

    injectDisclaimer() {
        // Check if disclaimer already exists
        if (document.querySelector('.medical-disclaimer')) return;
        
        const disclaimer = document.createElement("div");
        disclaimer.className = "medical-disclaimer";
        disclaimer.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 11px;
            color: var(--text-tertiary);
            background: rgba(255,255,255,0.9);
            padding: 8px;
            z-index: 40;
            backdrop-filter: blur(5px);
            border-top: 1px solid var(--border);
        `;
        disclaimer.textContent =
            "AI-assisted analysis only. Not a medical diagnosis. Always consult with qualified healthcare providers.";
        document.body.appendChild(disclaimer);
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    createFileInput() {
        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = "image/*,.dcm,.dicom";
        this.fileInput.multiple = false;
        this.fileInput.style.display = "none";
        document.body.appendChild(this.fileInput);

        this.fileInput.addEventListener("change", e => {
            const file = e.target.files?.[0];
            if (file) {
                this.processLocalFile(file);
            }
        });
    }

    // Clean up resources
    destroy() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        if (this.fileInput && this.fileInput.parentNode) {
            this.fileInput.parentNode.removeChild(this.fileInput);
        }
    }
}

// Global function for history view (called from HTML)
window.viewHistoryItem = function(id) {
    const history = JSON.parse(localStorage.getItem('medai_history') || '[]');
    const item = history.find(i => i.id === id);
    
    if (item && window.medAIApp) {
        window.medAIApp.displayResults(item);
    }
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    // Create and store app instance globally
    window.medAIApp = new MedAIApp();
    window.medAIApp.init();
});

// Clean up on page unload
window.addEventListener("beforeunload", () => {
    if (window.medAIApp) {
        window.medAIApp.destroy();
    }
});

})();
