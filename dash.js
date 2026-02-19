/**
 * MEDAI ENTERPRISE ENGINE v2.5.0 (Complete Feature Edition)
 * - Added: Camera cleanup on unload
 * - Added: Request timeout and retry logic
 * - Added: Input validation
 * - Added: Offline detection
 * - Added: Performance optimizations
 * - Added: Accessibility improvements
 * - Added: Local file upload with medical imaging support
 * - Added: Torch/Flash toggle functionality
 * - Added: Camera view restoration
 * - Preserved: All original functionality intact
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
        static REQUEST_TIMEOUT = 30000; // 30 seconds
        static MAX_RETRIES = 2;
        static MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        static SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/jpg', 'application/dicom', 'image/dicom'];
    }

    class MedAIApp {
        constructor() {
            this.state = {
                activeMode: localStorage.getItem("medai_pref_mode") || "xray",
                isProcessing: false,
                lastResult: null,
                user: JSON.parse(localStorage.getItem("medai_user") || '{"name":"Practitioner"}'),
                isOnline: navigator.onLine,
                torchEnabled: false
            };
            this.dom = {};
            this.cameraStream = null;
            this.abortController = null;
            this.fileInput = null;
        }

        init() {
            this.cacheDOM();
            this.bindEvents();
            this.bindNetworkEvents();
            this.initCamera();
            this.renderUser();
            this.applySavedState();
            this.setAriaLabels();
            this.createFileInput();
            
            // Cleanup on page unload
            window.addEventListener('beforeunload', () => this.cleanup());
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
                displayName: $("display-name"),
                uploadLocal: $("upload-local"),
                toggleTorch: $("toggle-torch")
            };
        }

        createFileInput() {
            // Create hidden file input if it doesn't exist
            if (!this.fileInput) {
                this.fileInput = document.createElement("input");
                this.fileInput.type = "file";
                this.fileInput.accept = "image/*,.dcm,.dicom"; // Support medical imaging formats
                this.fileInput.style.display = "none";
                document.body.appendChild(this.fileInput);
                
                // Handle file selection
                this.fileInput.addEventListener("change", (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.processLocalFile(file);
                    }
                });
            }
        }

        applySavedState() {
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

            // Main actions
            this.dom.captureBtn?.addEventListener("click", () => this.handleCapture());
            this.dom.closeResults?.addEventListener("click", () => {
                this.dom.resultsPanel.classList.add("hidden");
                this.restoreCameraView(); // Restore camera when closing results
            });
            
            // NEW: Upload local file functionality
            this.dom.uploadLocal?.addEventListener("click", () => this.handleLocalFileUpload());
            
            // NEW: Toggle torch functionality
            this.dom.toggleTorch?.addEventListener("click", () => this.toggleTorch());
        }

        bindNetworkEvents() {
            window.addEventListener('online', () => {
                this.state.isOnline = true;
            });
            
            window.addEventListener('offline', () => {
                this.state.isOnline = false;
                this.notify("You are offline. Please check your connection.", "warning");
            });
        }

        setAriaLabels() {
            // Enhance accessibility without changing functionality
            if (this.dom.captureBtn) {
                this.dom.captureBtn.setAttribute('aria-label', 'Capture and analyze image');
            }
            if (this.dom.closeResults) {
                this.dom.closeResults.setAttribute('aria-label', 'Close results panel');
            }
            if (this.dom.uploadLocal) {
                this.dom.uploadLocal.setAttribute('aria-label', 'Upload local medical image');
            }
            if (this.dom.toggleTorch) {
                this.dom.toggleTorch.setAttribute('aria-label', 'Toggle flashlight');
            }
        }

        cleanup() {
            // Properly stop camera tracks to prevent memory leaks
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => {
                    track.stop();
                });
                this.cameraStream = null;
            }
            
            // Abort any pending requests
            if (this.abortController) {
                this.abortController.abort();
                this.abortController = null;
            }

            // Remove file input
            if (this.fileInput && this.fileInput.parentNode) {
                this.fileInput.parentNode.removeChild(this.fileInput);
                this.fileInput = null;
            }

            // Remove preview if exists
            this.removePreview();
        }

        removePreview() {
            const preview = document.getElementById('upload-preview');
            if (preview && preview.parentNode) {
                preview.parentNode.removeChild(preview);
            }
        }

        hapticFeedback(ms) {
            if ("vibrate" in navigator) navigator.vibrate(ms);
        }

        validateCameraState() {
            if (!this.dom.video) {
                throw new Error("Camera element not found");
            }
            if (!this.cameraStream) {
                throw new Error("Camera not initialized");
            }
            if (this.dom.video.readyState < 2) { // HAVE_CURRENT_DATA
                throw new Error("Camera stream not ready");
            }
            if (!this.dom.video.videoWidth || !this.dom.video.videoHeight) {
                throw new Error("Camera dimensions not available");
            }
            return true;
        }

        async fetchWithTimeout(url, options, timeout = Config.REQUEST_TIMEOUT) {
            this.abortController = new AbortController();
            const timeoutId = setTimeout(() => this.abortController.abort(), timeout);
            
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: this.abortController.signal
                });
                clearTimeout(timeoutId);
                this.abortController = null;
                return response;
            } catch (err) {
                clearTimeout(timeoutId);
                this.abortController = null;
                if (err.name === 'AbortError') {
                    throw new Error('Request timeout - please try again');
                }
                throw err;
            }
        }

        async fetchWithRetry(url, options, retries = Config.MAX_RETRIES) {
            for (let i = 0; i <= retries; i++) {
                try {
                    return await this.fetchWithTimeout(url, options);
                } catch (err) {
                    if (i === retries) throw err;
                    // Exponential backoff: wait longer between retries
                    await this.sleep(1000 * Math.pow(2, i));
                }
            }
        }

        async handleCapture() {
            // Original functionality preserved - just added validation
            if (this.state.isProcessing) return;
            
            // Additional validation without changing behavior
            if (!this.state.isOnline) {
                this.notify("No internet connection", "error");
                return;
            }
            
            try {
                this.validateCameraState();
            } catch (err) {
                this.notify(err.message, "error");
                return;
            }
            
            this.hapticFeedback([20, 50, 20]);
            this.setLoading(true);
            
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

                // Use enhanced fetch with timeout and retry
                const response = await this.fetchWithRetry(
                    `${Config.API_BASE}${Config.ENDPOINTS.ANALYZE}`,
                    {
                        method: "POST",
                        body: fd,
                        headers: { 'Authorization': `Bearer ${localStorage.getItem("medai_token") || ""}` }
                    }
                );

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Validate response data structure
                if (!data || typeof data !== 'object') {
                    throw new Error("Invalid response format");
                }
                
                clearInterval(statusInterval);
                await this.displayResults(data);

            } catch (err) {
                clearInterval(statusInterval);
                const errorMessage = err.message.includes('timeout') 
                    ? "Request timed out. Please try again."
                    : "Analysis Failed: Check Connection";
                this.notify(errorMessage, "error");
                console.error("Capture error:", err);
            } finally {
                this.setLoading(false);
            }
        }

        async handleLocalFileUpload() {
            if (this.state.isProcessing) {
                this.notify("Analysis already in progress", "warning");
                return;
            }
            
            this.hapticFeedback(10);
            this.fileInput.click(); // Trigger file picker
        }

        async processLocalFile(file) {
            // Validate file
            const fileExt = file.name.split('.').pop().toLowerCase();
            const isValidType = Config.SUPPORTED_FORMATS.includes(file.type) || 
                               fileExt.match(/^(jpg|jpeg|png|dcm|dicom)$/i);
            
            if (!isValidType) {
                this.notify("Unsupported file format. Please upload medical images (JPG, PNG, DICOM)", "error");
                return;
            }
            
            if (file.size > Config.MAX_FILE_SIZE) {
                this.notify(`File too large. Maximum size is ${Config.MAX_FILE_SIZE / (1024*1024)}MB`, "error");
                return;
            }
            
            // Show file info
            this.notify(`Processing: ${file.name}`, "info");
            
            // Set processing state
            this.hapticFeedback([20, 50, 20]);
            this.setLoading(true);
            
            // Start AI Status Sequencer (same as camera capture)
            let statusIdx = 0;
            const statusInterval = setInterval(() => {
                if (statusIdx < Config.STATUS_MESSAGES.length) {
                    this.dom.aiStatus.textContent = Config.STATUS_MESSAGES[statusIdx++];
                }
            }, 1200);
            
            try {
                const fd = new FormData();
                fd.append("file", file, file.name);
                fd.append("type", this.state.activeMode);
                fd.append("source", "local"); // Additional metadata

                const response = await this.fetchWithRetry(
                    `${Config.API_BASE}${Config.ENDPOINTS.ANALYZE}`,
                    {
                        method: "POST",
                        body: fd,
                        headers: { 'Authorization': `Bearer ${localStorage.getItem("medai_token") || ""}` }
                    }
                );

                if (!response.ok) throw new Error(`Server error: ${response.status}`);
                
                const data = await response.json();
                clearInterval(statusInterval);
                
                // Display the uploaded image in viewfinder
                this.displayUploadedImage(file);
                
                await this.displayResults(data);
                this.notify("Analysis complete", "success");

            } catch (err) {
                clearInterval(statusInterval);
                const errorMessage = err.message.includes('timeout') 
                    ? "Request timed out. Please try again."
                    : "Analysis Failed: Check Connection";
                this.notify(errorMessage, "error");
                console.error("Upload error:", err);
            } finally {
                this.setLoading(false);
                // Clear file input for future uploads
                if (this.fileInput) {
                    this.fileInput.value = '';
                }
            }
        }

        displayUploadedImage(file) {
            // Show the uploaded image in the camera viewfinder
            if (this.dom.video && this.cameraStream) {
                // Pause camera stream temporarily
                this.cameraStream.getTracks().forEach(track => track.enabled = false);
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Create image element to display in video container
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    
                    // Hide video
                    this.dom.video.style.display = 'none';
                    
                    // Check if preview already exists
                    let preview = document.getElementById('upload-preview');
                    if (!preview) {
                        preview = document.createElement('div');
                        preview.id = 'upload-preview';
                        preview.style.position = 'absolute';
                        preview.style.top = '0';
                        preview.style.left = '0';
                        preview.style.width = '100%';
                        preview.style.height = '100%';
                        preview.style.backgroundColor = '#000';
                        preview.style.display = 'flex';
                        preview.style.alignItems = 'center';
                        preview.style.justifyContent = 'center';
                        preview.style.zIndex = '5';
                        this.dom.video.parentNode.appendChild(preview);
                    }
                    
                    preview.innerHTML = '';
                    preview.appendChild(img);
                    preview.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            }
        }

        restoreCameraView() {
            const preview = document.getElementById('upload-preview');
            if (preview) {
                preview.style.display = 'none';
            }
            if (this.dom.video) {
                this.dom.video.style.display = 'block';
            }
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => track.enabled = true);
            }
        }

        async toggleTorch() {
            if (!this.cameraStream) {
                this.notify("Camera not initialized", "error");
                return;
            }
            
            const track = this.cameraStream.getVideoTracks()[0];
            if (!track) return;
            
            // Check if torch capability exists
            try {
                const capabilities = track.getCapabilities ? track.getCapabilities() : {};
                const settings = track.getSettings();
                
                if (!capabilities.torch && !capabilities.fillLightMode) {
                    this.notify("Flash not available on this device", "warning");
                    return;
                }
                
                // Toggle torch state
                this.state.torchEnabled = !this.state.torchEnabled;
                
                await track.applyConstraints({
                    advanced: [{
                        torch: this.state.torchEnabled,
                        fillLightMode: this.state.torchEnabled ? 'torch' : 'off'
                    }]
                });
                
                // Update UI
                if (this.dom.toggleTorch) {
                    this.dom.toggleTorch.style.opacity = this.state.torchEnabled ? '1' : '0.7';
                    this.dom.toggleTorch.style.background = this.state.torchEnabled ? 'var(--accent-blue)' : '';
                    this.dom.toggleTorch.style.color = this.state.torchEnabled ? 'white' : '';
                }
                
                this.hapticFeedback(10);
                this.notify(this.state.torchEnabled ? "Flash on" : "Flash off", "info");
                
            } catch (err) {
                this.notify("Could not toggle flash", "error");
                console.error("Torch error:", err);
            }
        }

        async displayResults(data) {
            // Original functionality preserved with camera restoration
            this.state.lastResult = data;
            this.dom.resultsPanel.classList.remove("hidden");
            
            // Restore camera view when showing results
            this.restoreCameraView();
            
            this.dom.resultTitle.textContent = "Synthesizing...";
            this.dom.findingsList.innerHTML = "";
            this.updateConfidence(0);

            await this.sleep(600);
            
            // Sanitize data to prevent XSS
            this.dom.resultTitle.textContent = data.diagnosis || "No diagnosis";
            this.dom.resultDescription.textContent = data.description || "No description available";
            this.updateConfidence(typeof data.confidence === 'number' ? data.confidence : 0);

            const findings = Array.isArray(data.findings) ? data.findings : [];
            for (const finding of findings) {
                await this.sleep(300);
                const li = document.createElement("li");
                li.className = "animate-fade-in";
                li.innerHTML = `<i class="icon">🔹</i> ${finding.replace(/[<>]/g, '')}`;
                this.dom.findingsList.appendChild(li);
                this.hapticFeedback(5);
            }
            
            // If no findings, show default
            if (findings.length === 0) {
                const li = document.createElement("li");
                li.className = "animate-fade-in";
                li.innerHTML = `<i class="icon">🔹</i> No significant findings`;
                this.dom.findingsList.appendChild(li);
            }
        }

        updateConfidence(score) {
            // Original functionality preserved
            const validScore = Math.min(100, Math.max(0, score));
            this.dom.confidenceText.textContent = `${validScore}%`;
            this.dom.confidencePath.style.strokeDasharray = `${validScore}, 100`;
            
            const color = validScore > 80 ? "#10b981" : validScore > 50 ? "#f59e0b" : "#ef4444";
            this.dom.confidencePath.style.stroke = color;
        }

        captureFrame() {
            return new Promise((resolve, reject) => {
                try {
                    // Validate before capture
                    if (!this.dom.video.videoWidth || !this.dom.video.videoHeight) {
                        reject(new Error("Camera not ready"));
                        return;
                    }
                    
                    const canvas = document.createElement("canvas");
                    canvas.width = this.dom.video.videoWidth;
                    canvas.height = this.dom.video.videoHeight;
                    
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        reject(new Error("Could not create canvas context"));
                        return;
                    }
                    
                    ctx.drawImage(this.dom.video, 0, 0);
                    
                    canvas.toBlob(blob => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Failed to capture image"));
                        }
                    }, "image/jpeg", 0.9);
                    
                } catch (err) {
                    reject(err);
                }
            });
        }

        setLoading(isLoading) {
            // Original functionality preserved
            this.state.isProcessing = isLoading;
            this.dom.captureBtn.disabled = isLoading;
            this.dom.captureBtn.classList.toggle("pulse-animation", isLoading);
            if (!isLoading) this.dom.aiStatus.textContent = "AI READY";
        }

        sleep = ms => new Promise(r => setTimeout(r, ms));

        notify(msg, type) {
            // Original functionality preserved
            this.dom.notification.textContent = msg;
            this.dom.notification.className = `notification-toast visible ${type}`;
            setTimeout(() => this.dom.notification.classList.remove("visible"), 4000);
        }

        renderUser() {
            if(this.dom.displayName) this.dom.displayName.textContent = `Dr. ${this.state.user.name}`;
        }

        async initCamera() {
            try {
                // Check if camera already exists
                if (this.cameraStream) {
                    return;
                }
                
                this.cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        facingMode: "environment",
                        focusMode: "continuous",
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                });
                
                this.dom.video.srcObject = this.cameraStream;
                
                // Wait for video to be ready
                await new Promise((resolve) => {
                    this.dom.video.onloadedmetadata = () => {
                        this.dom.video.play()
                            .then(resolve)
                            .catch(err => {
                                console.warn("Video play failed:", err);
                                resolve();
                            });
                    };
                    
                    // Timeout in case onloadedmetadata never fires
                    setTimeout(resolve, 3000);
                });
                
            } catch (e) {
                let errorMsg = "Camera Access Required";
                if (e.name === 'NotAllowedError') {
                    errorMsg = "Camera permission denied";
                } else if (e.name === 'NotFoundError') {
                    errorMsg = "No camera found";
                } else if (e.name === 'NotReadableError') {
                    errorMsg = "Camera is already in use";
                }
                this.notify(errorMsg, "error");
                console.error("Camera init error:", e);
            }
        }
    }

    // Initialize with error handling
    document.addEventListener("DOMContentLoaded", () => {
        try {
            window.App = new MedAIApp();
            window.App.init();
        } catch (err) {
            console.error("Failed to initialize MedAI App:", err);
            // Show user-friendly error
            const notification = document.getElementById("notification");
            if (notification) {
                notification.textContent = "Failed to initialize application";
                notification.className = "notification-toast visible error";
            }
        }
    });
})();
