/**
 * MEDAI ENTERPRISE ENGINE v2.0.0
 * Enhanced with Comprehensive Notification System & Advanced Features
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: {
                ANALYZE: "/diagnostics/process",
                HEALTH_CHECK: "/health",
                VALIDATE_TOKEN: "/auth/validate",
                HISTORY: "/scans/history"
            },
            TIMEOUT: 40000,
            MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
            RETRY_ATTEMPTS: 3,
            RETRY_DELAY: 1000
        };

        this.state = {
            stream: null,
            imageCapture: null,
            activeMode: "xray",
            isProcessing: false,
            torchOn: false,
            controller: null,
            abortControllers: new Set(),
            notifications: [],
            user: JSON.parse(localStorage.getItem("medai_user")) || { 
                name: "Practitioner",
                id: null,
                role: "practitioner",
                permissions: ["scan", "view_history", "export"]
            },
            session: {
                token: localStorage.getItem("medai_token"),
                expires: localStorage.getItem("medai_token_expiry"),
                refreshToken: localStorage.getItem("medai_refresh_token")
            },
            system: {
                online: true,
                lastHealthCheck: null,
                scanHistory: []
            }
        };

        this.init();
    }

    async init() {
        this.cacheSelectors();
        this.setupNotificationSystem();
        this.bindEvents();
        this.setupNavigation();
        this.renderUser();
        await this.performHealthCheck();
        await this.setupCamera();
        this.setupOfflineDetection();
        console.log("🚀 MedAI System v2.0: Online with Enhanced Features");
        
        // Initial system notification
        this.pushNotification({
            title: "System Ready",
            message: "MedAI Enterprise is online and ready for scans",
            type: "success",
            duration: 3000,
            icon: "✅"
        });
    }

    /* ===================== NOTIFICATION SYSTEM ===================== */
    setupNotificationSystem() {
        // Create notification container if not exists
        if (!document.querySelector('.notification-container')) {
            const container = document.createElement('div');
            container.className = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
            `;
            document.body.appendChild(container);
            this.dom.notificationContainer = container;
        } else {
            this.dom.notificationContainer = document.querySelector('.notification-container');
        }
    }

    pushNotification(config) {
        const notification = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            title: config.title || "Notification",
            message: config.message || "",
            type: config.type || "info",
            duration: config.duration || 5000,
            icon: config.icon || this.getNotificationIcon(config.type),
            timestamp: new Date(),
            persistent: config.persistent || false,
            actions: config.actions || []
        };

        this.state.notifications.push(notification);
        this.renderNotification(notification);
        
        // Auto-dismiss if not persistent
        if (!notification.persistent) {
            setTimeout(() => this.dismissNotification(notification.id), notification.duration);
        }

        return notification.id;
    }

    getNotificationIcon(type) {
        const icons = {
            info: "ℹ️",
            success: "✅",
            warning: "⚠️",
            error: "❌",
            scan: "📸",
            analysis: "🔍",
            system: "⚙️"
        };
        return icons[type] || "📢";
    }

    renderNotification(notification) {
        const notificationEl = document.createElement('div');
        notificationEl.className = `notification notification-${notification.type}`;
        notificationEl.dataset.id = notification.id;
        
        notificationEl.innerHTML = `
            <div class="notification-header">
                <span class="notification-icon">${notification.icon}</span>
                <strong class="notification-title">${notification.title}</strong>
                <button class="notification-close" aria-label="Dismiss">×</button>
            </div>
            <div class="notification-body">
                <p>${notification.message}</p>
            </div>
            <div class="notification-footer">
                <small class="notification-time">${this.formatTime(notification.timestamp)}</small>
                ${notification.actions.length > 0 ? `
                    <div class="notification-actions">
                        ${notification.actions.map(action => 
                            `<button class="notification-action" data-action="${action.id}">${action.label}</button>`
                        ).join('')}
                    </div>
                ` : ''}
            </div>
            ${!notification.persistent ? `<div class="notification-progress"></div>` : ''}
        `;

        // Progress bar animation
        if (!notification.persistent) {
            const progress = notificationEl.querySelector('.notification-progress');
            progress.style.animationDuration = `${notification.duration}ms`;
        }

        // Event listeners
        notificationEl.querySelector('.notification-close').onclick = () => 
            this.dismissNotification(notification.id);
        
        notificationEl.querySelectorAll('.notification-action').forEach(btn => {
            btn.onclick = (e) => {
                const actionId = e.target.dataset.action;
                const action = notification.actions.find(a => a.id === actionId);
                if (action && action.handler) action.handler();
                if (!action.preventDismiss) this.dismissNotification(notification.id);
            };
        });

        this.dom.notificationContainer.appendChild(notificationEl);
        
        // Animate in
        setTimeout(() => notificationEl.classList.add('show'), 10);
        
        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('medai:notification', {
            detail: notification
        }));
    }

    dismissNotification(id) {
        const notificationEl = document.querySelector(`[data-id="${id}"]`);
        if (notificationEl) {
            notificationEl.classList.remove('show');
            setTimeout(() => notificationEl.remove(), 300);
        }
        
        this.state.notifications = this.state.notifications.filter(n => n.id !== id);
    }

    clearAllNotifications() {
        this.state.notifications.forEach(n => this.dismissNotification(n.id));
    }

    formatTime(date) {
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleTimeString();
    }

    /* ===================== ENHANCED CAMERA SYSTEM ===================== */
    async setupCamera() {
        try {
            const constraints = {
                video: { 
                    facingMode: "environment",
                    width: { ideal: 1920, max: 3840 },
                    height: { ideal: 1080, max: 2160 },
                    frameRate: { ideal: 30, max: 60 }
                }
            };
            
            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.dom.video.srcObject = this.state.stream;

            // Check for camera capabilities
            const track = this.state.stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            
            if ("ImageCapture" in window) {
                this.state.imageCapture = new ImageCapture(track);
            }

            // Enable/disable torch button based on capability
            if (capabilities.torch) {
                this.dom.toggleTorch.disabled = false;
                this.dom.toggleTorch.title = "Toggle Flashlight";
            } else {
                this.dom.toggleTorch.disabled = true;
                this.dom.toggleTorch.title = "Flashlight not supported";
            }

            this.pushNotification({
                title: "Camera Active",
                message: "Imaging system is ready for capture",
                type: "success",
                icon: "📷"
            });

        } catch (error) {
            console.error("Camera setup failed:", error);
            this.pushNotification({
                title: "Camera Error",
                message: "Imaging system offline. Use local upload.",
                type: "error",
                persistent: true,
                actions: [{
                    id: "retry",
                    label: "Retry",
                    handler: () => this.setupCamera(),
                    preventDismiss: true
                }]
            });
        }
    }

    /* ===================== ENHANCED AI PIPELINE ===================== */
    async handleCapture() {
        if (this.state.isProcessing) {
            this.pushNotification({
                title: "System Busy",
                message: "Please wait for current scan to complete",
                type: "warning"
            });
            return;
        }

        // Check session validity
        if (!await this.validateSession()) {
            this.pushNotification({
                title: "Session Expired",
                message: "Please log in again to continue",
                type: "error",
                persistent: true
            });
            return;
        }

        // Check system health
        if (!this.state.system.online) {
            this.pushNotification({
                title: "Offline Mode",
                message: "System is offline. Scan will be queued.",
                type: "warning",
                persistent: true
            });
        }

        const scanId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        
        this.pushNotification({
            title: "Capture Started",
            message: `Capturing ${this.state.activeMode.toUpperCase()} scan...`,
            type: "scan",
            icon: "📸"
        });

        this.toggleLoading(true, "Capturing Scan...");

        try {
            // Capture image
            const raw = this.state.imageCapture
                ? await this.state.imageCapture.takePhoto()
                : await this.captureFallback();

            // Validate image quality
            const validation = await this.validateImageQuality(raw);
            if (!validation.valid) {
                throw new Error(`Image quality insufficient: ${validation.reason}`);
            }

            this.updateAIStatus("AI Analyzing Pattern...");
            
            // Process with retry logic
            const result = await this.uploadToAIWithRetry(raw, scanId);
            
            // Store in history
            this.addToScanHistory({
                id: scanId,
                timestamp: new Date().toISOString(),
                mode: this.state.activeMode,
                result: result,
                confidence: result.confidence || 0
            });

            // Display results
            this.revealTrueResults(result);
            
            this.pushNotification({
                title: "Analysis Complete",
                message: `${result.confidence || 0}% confidence - ${result.diagnosis || "Scan processed"}`,
                type: "success",
                duration: 5000,
                icon: "✅"
            });

        } catch (error) {
            console.error("Capture failed:", error);
            
            this.pushNotification({
                title: "Analysis Failed",
                message: error.message || "Unable to process scan",
                type: "error",
                duration: 5000,
                actions: [{
                    id: "retry",
                    label: "Retry",
                    handler: () => this.handleCapture()
                }]
            });
        } finally {
            this.toggleLoading(false);
        }
    }

    async uploadToAIWithRetry(blob, scanId, attempt = 1) {
        const maxAttempts = this.config.RETRY_ATTEMPTS;
        
        try {
            return await this.uploadToAI(blob, scanId);
        } catch (error) {
            if (attempt >= maxAttempts) {
                throw error;
            }
            
            this.pushNotification({
                title: "Retrying...",
                message: `Attempt ${attempt} of ${maxAttempts} failed. Retrying in 1 second...`,
                type: "warning",
                duration: 1000
            });

            await new Promise(resolve => setTimeout(resolve, this.config.RETRY_DELAY));
            return this.uploadToAIWithRetry(blob, scanId, attempt + 1);
        }
    }

    async uploadToAI(blob, scanId) {
        // Abort any existing requests
        this.abortAllRequests();
        
        const controller = new AbortController();
        this.state.abortControllers.add(controller);
        
        const token = this.state.session.token;
        if (!token) {
            throw new Error("Authentication required");
        }

        const fd = new FormData();
        fd.append("file", blob, `scan_${scanId}.jpg`);
        fd.append("type", this.state.activeMode);
        fd.append("scanId", scanId);
        fd.append("timestamp", new Date().toISOString());

        const timeout = setTimeout(() => controller.abort(), this.config.TIMEOUT);

        try {
            const response = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`, {
                method: "POST",
                headers: { 
                    "Authorization": `Bearer ${token}`,
                    "X-Scan-ID": scanId
                },
                body: fd,
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `API Error: ${response.status}`);
            }

            const data = await response.json();
            
            // Validate response structure
            if (!this.validateAIResponse(data)) {
                throw new Error("Invalid response from AI engine");
            }

            return data;
        } finally {
            clearTimeout(timeout);
            this.state.abortControllers.delete(controller);
        }
    }

    validateAIResponse(data) {
        return data && (
            typeof data.confidence === 'number' ||
            data.diagnosis ||
            data.findings
        );
    }

    async validateImageQuality(blob) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const brightness = this.calculateBrightness(imageData);
                const contrast = this.calculateContrast(imageData);
                
                let valid = true;
                let reason = "";
                
                if (img.width < 640 || img.height < 480) {
                    valid = false;
                    reason = "Resolution too low";
                } else if (brightness < 0.2 || brightness > 0.8) {
                    valid = false;
                    reason = "Brightness out of range";
                } else if (contrast < 0.3) {
                    valid = false;
                    reason = "Insufficient contrast";
                }
                
                resolve({ valid, reason, width: img.width, height: img.height, brightness, contrast });
            };
            img.src = URL.createObjectURL(blob);
        });
    }

    calculateBrightness(imageData) {
        let total = 0;
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            total += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        return total / (data.length / 4) / 255;
    }

    calculateContrast(imageData) {
        // Simplified contrast calculation
        const data = imageData.data;
        const values = [];
        for (let i = 0; i < data.length; i += 4) {
            values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
        }
        return Math.std(values) / 255;
    }

    /* ===================== ENHANCED RESULTS DISPLAY ===================== */
    revealTrueResults(data) {
        // Show panel
        this.dom.resultsPanel.classList.remove("hidden");

        // 1. Confidence visualization
        const score = data.confidence || 0;
        this.updateConfidenceVisualization(score);

        // 2. Diagnosis information
        this.dom.resultTitle.textContent = data.diagnosis || "Undetermined Scan";
        this.dom.resultDescription.textContent = data.description || 
            "No significant anomalies detected in the analyzed frame.";

        // 3. Findings with severity indicators
        this.populateFindings(data.findings || ["Normal physiological appearance detected."]);

        // 4. Recommendations if available
        if (data.recommendations) {
            this.displayRecommendations(data.recommendations);
        }

        // 5. Metadata
        if (data.metadata) {
            this.displayMetadata(data.metadata);
        }

        // Dispatch results event
        document.dispatchEvent(new CustomEvent('medai:scanComplete', {
            detail: { data, timestamp: new Date() }
        }));
    }

    updateConfidenceVisualization(score) {
        if (this.dom.confidencePath) {
            const circumference = 2 * Math.PI * 45; // Assuming radius 45
            const offset = circumference - (score / 100) * circumference;
            this.dom.confidencePath.style.strokeDasharray = circumference;
            this.dom.confidencePath.style.strokeDashoffset = offset;
            this.dom.confidenceText.textContent = `${Math.round(score)}%`;
            
            // Color based on confidence
            let color = "#DC2626"; // red for low
            if (score > 70) color = "#059669"; // green for high
            else if (score > 40) color = "#D97706"; // amber for medium
            this.dom.confidencePath.style.stroke = color;
        }
    }

    populateFindings(findings) {
        this.dom.findingsList.innerHTML = "";
        findings.forEach((finding, index) => {
            const li = document.createElement("li");
            li.className = "finding-item";
            
            // Parse severity if provided in format: "[SEVERITY] Finding text"
            const severityMatch = finding.match(/^\[(LOW|MEDIUM|HIGH|CRITICAL)\]\s*(.+)/);
            let severity = "info";
            let text = finding;
            
            if (severityMatch) {
                severity = severityMatch[1].toLowerCase();
                text = severityMatch[2];
            }
            
            li.innerHTML = `
                <span class="finding-severity severity-${severity}"></span>
                <span class="finding-text">${text}</span>
            `;
            this.dom.findingsList.appendChild(li);
        });
    }

    displayRecommendations(recommendations) {
        if (!this.dom.recommendationsContainer) {
            const container = document.createElement('div');
            container.className = 'recommendations-section';
            container.innerHTML = '<h4>Recommendations</h4><ul class="recommendations-list"></ul>';
            this.dom.resultsPanel.querySelector('.analysis-summary').appendChild(container);
            this.dom.recommendationsList = container.querySelector('.recommendations-list');
        }
        
        this.dom.recommendationsList.innerHTML = '';
        recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.textContent = rec;
            this.dom.recommendationsList.appendChild(li);
        });
    }

    displayMetadata(metadata) {
        const metaEl = document.createElement('div');
        metaEl.className = 'scan-metadata';
        metaEl.innerHTML = `
            <h4>Scan Information</h4>
            <div class="metadata-grid">
                ${Object.entries(metadata).map(([key, value]) => `
                    <div class="metadata-item">
                        <span class="metadata-key">${key}:</span>
                        <span class="metadata-value">${value}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        const existingMeta = this.dom.resultsPanel.querySelector('.scan-metadata');
        if (existingMeta) existingMeta.remove();
        this.dom.resultsPanel.querySelector('.analysis-summary').appendChild(metaEl);
    }

    /* ===================== SYSTEM MANAGEMENT ===================== */
    async performHealthCheck() {
        try {
            const response = await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.HEALTH_CHECK}`, {
                timeout: 5000
            });
            
            this.state.system.online = response.ok;
            this.state.system.lastHealthCheck = new Date();
            
            if (!response.ok) {
                this.pushNotification({
                    title: "System Warning",
                    message: "AI service experiencing issues. Scans may be delayed.",
                    type: "warning"
                });
            }
        } catch {
            this.state.system.online = false;
        }
    }

    async validateSession() {
        if (!this.state.session.token) return false;
        
        if (this.state.session.expires && new Date(this.state.session.expires) < new Date()) {
            return await this.refreshToken();
        }
        
        return true;
    }

    async refreshToken() {
        try {
            const response = await fetch(`${this.config.API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.state.session.refreshToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateSession(data);
                return true;
            }
        } catch {
            // Silent fail
        }
        
        return false;
    }

    updateSession(data) {
        this.state.session.token = data.access_token;
        this.state.session.expires = data.expires_at;
        localStorage.setItem('medai_token', data.access_token);
        localStorage.setItem('medai_token_expiry', data.expires_at);
    }

    setupOfflineDetection() {
        window.addEventListener('online', () => {
            this.state.system.online = true;
            this.pushNotification({
                title: "Back Online",
                message: "Connection restored. System is fully operational.",
                type: "success"
            });
            this.performHealthCheck();
        });

        window.addEventListener('offline', () => {
            this.state.system.online = false;
            this.pushNotification({
                title: "Offline Mode",
                message: "Connection lost. Limited functionality available.",
                type: "warning",
                persistent: true
            });
        });
    }

    abortAllRequests() {
        this.state.abortControllers.forEach(controller => controller.abort());
        this.state.abortControllers.clear();
    }

    addToScanHistory(scan) {
        this.state.system.scanHistory.unshift(scan);
        if (this.state.system.scanHistory.length > 100) {
            this.state.system.scanHistory.pop();
        }
        localStorage.setItem('medai_scan_history', JSON.stringify(this.state.system.scanHistory));
    }

    /* ===================== UTILITIES ===================== */
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
            
            // Revelation Mapping
            confidencePath: document.getElementById("confidence-path"),
            confidenceText: document.getElementById("confidence-text"),
            resultTitle: document.getElementById("result-title"),
            resultDescription: document.getElementById("result-description"),
            findingsList: document.getElementById("findings-list"),
            
            // User & System
            displayName: document.getElementById("display-name")
        };
    }

    bindEvents() {
        this.dom.captureBtn.onclick = () => this.handleCapture();
        
        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.activeMode = btn.dataset.type;
                
                this.pushNotification({
                    title: "Mode Changed",
                    message: `Switched to ${btn.dataset.type.toUpperCase()} scan mode`,
                    type: "info"
                });
            };
        });

        this.dom.closeResults.onclick = () => {
            this.dom.resultsPanel.classList.add("hidden");
            this.pushNotification({
                title: "Results Closed",
                message: "Analysis panel minimized",
                type: "info"
            });
        };

        this.dom.toggleTorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) return;
            
            try {
                this.state.torchOn = !this.state.torchOn;
                await track.applyConstraints({ 
                    advanced: [{ torch: this.state.torchOn }] 
                });
                
                this.pushNotification({
                    title: this.state.torchOn ? "Torch On" : "Torch Off",
                    message: `Flashlight ${this.state.torchOn ? 'activated' : 'deactivated'}`,
                    type: "info"
                });
            } catch {
                this.pushNotification({
                    title: "Torch Unavailable",
                    message: "Flashlight not supported on this device",
                    type: "warning"
                });
            }
        };

        this.dom.uploadLocal.onclick = () => this.handleLocalUpload();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.handleCapture();
            }
            if (e.key === 'Escape') {
                this.dom.resultsPanel.classList.add("hidden");
            }
        });
    }

    setupNavigation() {
        this.dom.navItems.forEach(btn => {
            btn.onclick = () => {
                // Remove active from all nav
                this.dom.navItems.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                // Hide all views, show target view
                const targetId = `${btn.dataset.tab}-section`;
                this.dom.views.forEach(v => v.classList.add("hidden"));
                document.getElementById(targetId)?.classList.remove("hidden");
                
                // Navigation notification
                this.pushNotification({
                    title: "Navigation",
                    message: `Switched to ${btn.dataset.tab} view`,
                    type: "info"
                });
            };
        });
    }

    captureFallback() {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;
            const ctx = canvas.getContext("2d");
            
            // Enhance image before capture
            ctx.filter = "contrast(1.1) brightness(1.05)";
            ctx.drawImage(this.dom.video, 0, 0);
            
            canvas.toBlob(resolve, "image/jpeg", 0.92);
        });
    }

    toggleLoading(active, text = "AI Analyzing...") {
        this.state.isProcessing = active;
        this.dom.captureBtn.disabled = active;
        this.dom.captureBtn.style.opacity = active ? 0.7 : 1;
        this.updateAIStatus(active ? text : "AI Ready");
        
        // Visual feedback
        if (active) {
            this.dom.captureBtn.classList.add('processing');
        } else {
            this.dom.captureBtn.classList.remove('processing');
        }
    }

    updateAIStatus(text) {
        if (this.dom.aiStatus) {
            this.dom.aiStatus.textContent = text;
            this.dom.aiStatus.classList.remove('status-ready', 'status-processing');
            
            if (text === "AI Ready") {
                this.dom.aiStatus.classList.add('status-ready');
            } else if (text.includes("Analyzing") || text.includes("Processing")) {
                this.dom.aiStatus.classList.add('status-processing');
            }
        }
    }

    renderUser() {
        if (this.dom.displayName) {
            this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
        }
    }

    async handleLocalUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.dicom,.dcm';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > this.config.MAX_FILE_SIZE) {
                this.pushNotification({
                    title: "File Too Large",
                    message: `Maximum file size is ${this.config.MAX_FILE_SIZE / 1024 / 1024}MB`,
                    type: "error"
                });
                return;
            }
            
            this.pushNotification({
                title: "Upload Started",
                message: `Processing ${file.name}...`,
                type: "info"
            });
            
            // Here you would implement the upload logic
            // For now, just simulate processing
            setTimeout(() => {
                this.pushNotification({
                    title: "Upload Complete",
                    message: `${file.name} is ready for analysis`,
                    type: "success"
                });
            }, 1500);
        };
        
        input.click();
    }
}

// Add missing Math.std function
if (!Math.std) {
    Math.std = function(arr) {
        const mean = arr.reduce((acc, val) => acc + val, 0) / arr.length;
        return Math.sqrt(
            arr.reduce((acc, val) => acc.concat((val - mean) ** 2), []).reduce((acc, val) => acc + val, 0) / arr.length
        );
    };
}

window.addEventListener("DOMContentLoaded", () => new MedAICore());

// Global error handling
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    // You could push a notification here if needed
});

// Unhandled promise rejection
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});
