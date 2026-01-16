/**
 * MEDAI ENTERPRISE ENGINE v2.0.0 - Kenyan Edition
 * World-Class Medical Diagnostic System with Kenyan Flag Theme
 * Optimized for Backend Integration & Cross-Device Excellence
 */

class MedAICore {
    constructor() {
        this.config = {
            API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            ENDPOINTS: {
                ANALYZE: "/diagnostics/process",
                HISTORY: "/diagnostics/history",
                ANALYTICS: "/analytics/overview"
            },
            TIMEOUT: 45000,
            RETRY_ATTEMPTS: 3,
            RETRY_DELAY: 2000
        };

        this.state = {
            stream: null,
            imageCapture: null,
            activeMode: "xray",
            isProcessing: false,
            torchOn: false,
            controller: null,
            user: JSON.parse(localStorage.getItem("medai_user")) || { 
                name: "Practitioner",
                role: "Medical Doctor",
                hospital: "Kenya Medical Center"
            },
            scanHistory: [],
            analytics: null,
            isOnline: navigator.onLine,
            connectionStatus: 'stable'
        };

        this.dom = {};
        this.animationTimers = {};
        this.notifTimer = null;
        this.retryCount = 0;
        
        // Kenyan theme data
        this.kenyanThemes = {
            colors: {
                black: '#000000',
                red: '#BB0000',
                green: '#006600',
                white: '#FFFFFF',
                gold: '#F0C420'
            },
            greetings: [
                "Karibu Dokta!",
                "Habari yako Dokta?",
                "Uko sawa Dokta!",
                "Hongera kwa kazi nzuri!"
            ],
            medicalTerms: {
                xray: "Picha ya X-Ray",
                ct: "CT Scan",
                mri: "MRI",
                ultrasound: "Ultrasound"
            }
        };

        this.init();
    }

    async init() {
        this.cacheSelectors();
        this.bindEvents();
        this.setupNavigation();
        this.renderUser();
        this.setupConnectionMonitoring();
        
        // Add Kenyan decorative wave
        this.addKenyanWave();
        
        // Initial data loading
        await Promise.all([
            this.setupCamera(),
            this.loadInitialData()
        ]);
        
        // Welcome notification with Kenyan flair
        setTimeout(() => {
            this.notify(
                this.getRandomKenyanGreeting(),
                'success',
                3000
            );
        }, 1000);
        
        console.log("🇰🇪 MedAI Enterprise v2.0.0: Ready & Connected | Kenya Medical Excellence");
    }

    cacheSelectors() {
        const ids = [
            "camera-stream", "capture-trigger", "toggle-torch", "upload-local",
            "results-panel", "close-results", "ai-status", "confidence-path",
            "confidence-text", "result-title", "result-description", "findings-list",
            "display-name", "notification", "user-role", "user-hospital",
            "history-section", "analytics-section", "scan-history-list",
            "analytics-data", "connection-status", "kenya-wave"
        ];

        ids.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.dom[id.replace(/-/g, '')] = element;
            }
        });

        this.dom.typeBtns = document.querySelectorAll(".type-btn");
        this.dom.navItems = document.querySelectorAll(".nav-item");
        this.dom.views = document.querySelectorAll(".content-view");
        this.dom.cameraControls = document.querySelector(".camera-controls");
        this.dom.scannerCard = document.querySelector(".scanner-card");
        this.dom.targetBox = document.querySelector(".target-box");
        this.dom.scanLine = document.querySelector(".scan-line");
        this.dom.userAvatar = document.querySelector(".user-avatar");
    }

    /* =====================================================
       KENYAN THEME ENHANCEMENTS
    ===================================================== */
    addKenyanWave() {
        const wave = document.createElement('div');
        wave.className = 'kenya-flag-wave';
        wave.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, 
                ${this.kenyanThemes.colors.black} 33%, 
                ${this.kenyanThemes.colors.red} 34%, 
                ${this.kenyanThemes.colors.red} 66%, 
                ${this.kenyanThemes.colors.green} 67%
            );
            z-index: -1;
            opacity: 0.3;
            animation: kenyaWave 3s ease-in-out infinite;
        `;
        
        // Add CSS animation if not already present
        if (!document.querySelector('style[data-kenya-wave]')) {
            const style = document.createElement('style');
            style.dataset.kenyaWave = true;
            style.textContent = `
                @keyframes kenyaWave {
                    0%, 100% { transform: translateX(0) scale(1); }
                    25% { transform: translateX(-5px) scale(1.05); }
                    75% { transform: translateX(5px) scale(0.95); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(wave);
        this.dom.kenyawave = wave;
    }

    getRandomKenyanGreeting() {
        return this.kenyanThemes.greetings[
            Math.floor(Math.random() * this.kenyanThemes.greetings.length)
        ];
    }

    updateConnectionStatus(status) {
        this.state.connectionStatus = status;
        if (this.dom.connectionstatus) {
            this.dom.connectionstatus.textContent = `Status: ${status}`;
            this.dom.connectionstatus.className = `connection-status ${status}`;
        }
    }

    /* =====================================================
       CAMERA SYSTEM - ENHANCED WITH KENYAN FLAIR
    ===================================================== */
    async setupCamera() {
        try {
            this.notify("Kuanzisha kamera ya kisasa...", "info", 2000);
            
            const constraints = {
                video: { 
                    facingMode: "environment", 
                    width: { ideal: 1920, max: 2560 },
                    height: { ideal: 1080, max: 1440 },
                    frameRate: { ideal: 30 }
                }
            };

            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Add visual feedback
            this.animateCameraStart();
            
            this.dom.camerastream.srcObject = this.state.stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.dom.camerastream.onloadedmetadata = () => {
                    this.dom.camerastream.play();
                    resolve();
                };
            });

            const track = this.state.stream.getVideoTracks()[0];
            if ("ImageCapture" in window) {
                this.state.imageCapture = new ImageCapture(track);
            }
            
            this.notify("Kamera tayari! Unaweza kuchukua picha.", "success", 2000);
            
        } catch (error) {
            console.error("Camera setup error:", error);
            this.notify("Kamera haipo au imezimwa. Tumia upakiaji wa picha kutoka kwenye faili.", "warning", 4000);
            this.showCameraFallbackUI();
        }
    }

    animateCameraStart() {
        if (this.dom.scannerCard) {
            this.dom.scannerCard.style.transform = 'scale(0.95)';
            this.dom.scannerCard.style.opacity = '0.8';
            
            setTimeout(() => {
                this.dom.scannerCard.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                this.dom.scannerCard.style.transform = 'scale(1)';
                this.dom.scannerCard.style.opacity = '1';
            }, 100);
        }
        
        // Animate scan line
        if (this.dom.scanLine) {
            this.dom.scanLine.style.animation = 'scan 2s ease-in-out infinite';
        }
    }

    showCameraFallbackUI() {
        if (this.dom.cameraControls) {
            const uploadBtn = this.dom.cameraControls.querySelector('#upload-local');
            if (uploadBtn) {
                uploadBtn.style.animation = 'pulse 1.5s ease-in-out infinite';
                uploadBtn.style.transform = 'scale(1.1)';
            }
        }
    }

    async captureImage() {
        if (!this.state.stream) {
            throw new Error("Camera stream not available");
        }

        try {
            if (this.state.imageCapture) {
                return await this.state.imageCapture.takePhoto();
            } else {
                return await this.captureFallback();
            }
        } catch (error) {
            console.error("Capture error:", error);
            throw new Error("Failed to capture image");
        }
    }

    async captureFallback() {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            const video = this.dom.camerastream;
            
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            
            const ctx = canvas.getContext("2d");
            
            // Add subtle enhancement to the image
            ctx.filter = "contrast(1.1) saturate(1.1)";
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Add Kenyan watermark
            ctx.fillStyle = 'rgba(187, 0, 0, 0.1)';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🇰🇪 MedAI Kenya', canvas.width / 2, canvas.height - 30);
            
            canvas.toBlob(resolve, "image/jpeg", 0.92);
        });
    }

    /* =====================================================
       AI PIPELINE - BACKEND INTEGRATION
    ===================================================== */
    async handleCapture() {
        if (this.state.isProcessing) {
            this.notify("Tafadhali ngoje uchambuzi wa sasa ukamilike.", "warning");
            return;
        }

        if (!this.state.isOnline) {
            this.notify("Hakuna muunganisho wa intaneti. Tafadhali angalia muunganisho wako.", "error");
            return;
        }

        const token = localStorage.getItem("medai_token");
        if (!token) {
            this.notify("Muda wa kuingia umekwisha. Tafadhali ingia tena.", "error");
            setTimeout(() => window.location.href = "index.html", 2000);
            return;
        }

        this.toggleLoading(true, "Inachukua picha...");

        try {
            // Visual capture feedback
            this.animateCapture();
            
            // Capture image
            const imageBlob = await this.captureImage();
            
            // Update status
            this.updateAIStatus("AI inachambua...", true);
            
            // Send to backend
            const result = await this.uploadToAI(imageBlob);
            
            // Display results
            this.displayDiagnosis(result);
            
            // Update history
            await this.updateScanHistory(result);
            
            // Success notification
            this.notify("Uchambuzi umekamilika kwa mafanikio!", "success");
            
        } catch (error) {
            console.error("Capture process error:", error);
            
            const errorMessage = this.getErrorMessage(error);
            this.notify(errorMessage, "error");
            
            if (error.name === "AbortError" && this.retryCount < this.config.RETRY_ATTEMPTS) {
                this.retryCount++;
                setTimeout(() => {
                    this.notify(`Inajaribu tena (${this.retryCount}/${this.config.RETRY_ATTEMPTS})...`, "info");
                    this.handleCapture();
                }, this.config.RETRY_DELAY);
                return;
            }
            
            this.retryCount = 0;
        } finally {
            this.toggleLoading(false);
            this.retryCount = 0;
        }
    }

    animateCapture() {
        // Flash effect
        if (this.dom.camerastream) {
            this.dom.camerastream.style.filter = 'brightness(1.5)';
            setTimeout(() => {
                this.dom.camerastream.style.filter = '';
            }, 300);
        }
        
        // Button animation
        if (this.dom.capturetrigger) {
            this.dom.capturetrigger.style.transform = 'scale(0.9)';
            setTimeout(() => {
                this.dom.capturetrigger.style.transform = '';
            }, 300);
        }
        
        // Scanner animation
        if (this.dom.targetBox) {
            this.dom.targetBox.style.borderColor = this.kenyanThemes.colors.green;
            this.dom.targetBox.style.boxShadow = `0 0 30px ${this.kenyanThemes.colors.green}`;
            setTimeout(() => {
                this.dom.targetBox.style.borderColor = '';
                this.dom.targetBox.style.boxShadow = '';
            }, 1000);
        }
    }

    async uploadToAI(imageBlob) {
        // Cancel any ongoing request
        if (this.state.controller) {
            this.state.controller.abort();
        }
        
        this.state.controller = new AbortController();
        const timeoutId = setTimeout(() => {
            this.state.controller.abort();
            throw new Error("Muda wa kuwasiliana na seva umekwisha");
        }, this.config.TIMEOUT);

        try {
            const formData = new FormData();
            formData.append("file", imageBlob, `scan_${Date.now()}.jpg`);
            formData.append("type", this.state.activeMode);
            formData.append("metadata", JSON.stringify({
                timestamp: new Date().toISOString(),
                device: navigator.userAgent,
                location: "Kenya",
                resolution: `${imageBlob.size} bytes`
            }));

            const response = await fetch(
                `${this.config.API_BASE}${this.config.ENDPOINTS.ANALYZE}`,
                {
                    method: "POST",
                    headers: { 
                        "Authorization": `Bearer ${localStorage.getItem("medai_token")}`,
                        "X-Request-ID": `medai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                    },
                    body: formData,
                    signal: this.state.controller.signal
                }
            );

            clearTimeout(timeoutId);

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem("medai_token");
                throw new Error("Muda wa kuingia umekwisha. Tafadhali ingia tena.");
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Seva imeshindwa: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            
            // Validate response structure
            if (!result.diagnosis || !result.confidence) {
                throw new Error("Jibu lisilo sahihi kutoka kwa seva");
            }

            return result;

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === "AbortError") {
                throw new Error("Seva inaleta changamoto. Tafadhali jaribu tena baadae.");
            }
            
            throw error;
        }
    }

    getErrorMessage(error) {
        const errorMap = {
            "NetworkError": "Shida ya mtandao. Angalia muunganisho wako wa intaneti.",
            "AbortError": "Muda umekwisha. Tafadhali jaribu tena.",
            "TypeError": "Shida ya muunganisho na seva.",
            "Failed to fetch": "Haikuweza kuwasiliana na seva."
        };
        
        return errorMap[error.name] || errorMap[error.message] || 
               `Shida imetokea: ${error.message || "Tafadhali jaribu tena"}`;
    }

    /* =====================================================
       DATA MANAGEMENT & BACKEND INTEGRATION
    ===================================================== */
    async loadInitialData() {
        try {
            const token = localStorage.getItem("medai_token");
            if (!token) return;

            // Load history and analytics in parallel
            await Promise.allSettled([
                this.loadScanHistory(),
                this.loadAnalytics()
            ]);
            
        } catch (error) {
            console.warn("Failed to load initial data:", error);
        }
    }

    async loadScanHistory() {
        try {
            const response = await fetch(
                `${this.config.API_BASE}${this.config.ENDPOINTS.HISTORY}`,
                {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("medai_token")}`
                    }
                }
            );

            if (response.ok) {
                const history = await response.json();
                this.state.scanHistory = history.slice(0, 10); // Last 10 scans
                this.renderScanHistory();
            }
        } catch (error) {
            console.error("Failed to load history:", error);
        }
    }

    async loadAnalytics() {
        try {
            const response = await fetch(
                `${this.config.API_BASE}${this.config.ENDPOINTS.ANALYTICS}`,
                {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("medai_token")}`
                    }
                }
            );

            if (response.ok) {
                this.state.analytics = await response.json();
                this.renderAnalytics();
            }
        } catch (error) {
            console.error("Failed to load analytics:", error);
        }
    }

    async updateScanHistory(result) {
        const newScan = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            type: this.state.activeMode,
            diagnosis: result.diagnosis,
            confidence: result.confidence,
            imageUrl: URL.createObjectURL(await this.captureImage())
        };

        this.state.scanHistory.unshift(newScan);
        if (this.state.scanHistory.length > 10) {
            this.state.scanHistory.pop();
        }

        this.renderScanHistory();
        
        // Optionally sync with backend
        await this.syncScanWithBackend(newScan);
    }

    async syncScanWithBackend(scan) {
        try {
            await fetch(`${this.config.API_BASE}${this.config.ENDPOINTS.HISTORY}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("medai_token")}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(scan)
            });
        } catch (error) {
            console.warn("Failed to sync scan with backend:", error);
        }
    }

    /* =====================================================
       UI & RESULTS RENDERING
    ===================================================== */
    displayDiagnosis(data) {
        // Show results panel with animation
        this.dom.resultspanel.classList.remove("hidden");
        this.dom.resultspanel.style.animation = "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
        
        // Update confidence score with animation
        const score = Math.min(100, Math.max(0, data.confidence || 85));
        if (this.dom.confidencepath) {
            // Reset animation
            this.dom.confidencepath.style.transition = 'none';
            this.dom.confidencepath.style.strokeDasharray = '0,100';
            
            // Force reflow
            this.dom.confidencepath.offsetHeight;
            
            // Animate to final value
            this.dom.confidencepath.style.transition = 'stroke-dasharray 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
            this.dom.confidencepath.style.strokeDasharray = `${score},100`;
            
            // Animate text counter
            this.animateCounter(this.dom.confidencetext, 0, score, 1500);
        }

        // Update diagnosis text with Kenyan medical terms
        const diagnosisText = data.diagnosis || "Hakuna kasoro zilizogunduliwa";
        const descriptionText = data.description || 
            "Uchambuzi wa AI umethibitisha kuwa hakuna dalili za ugonjwa. Angalio la kawaida linapendekezwa.";
        
        this.typeWriterEffect(this.dom.resulttitle, diagnosisText, 50);
        this.typeWriterEffect(this.dom.resultdescription, descriptionText, 30);

        // Update findings list
        this.dom.findingslist.innerHTML = "";
        const findings = data.findings || ["Muundo wa kawaida wa kiolojia unaonekana"];
        
        findings.forEach((finding, index) => {
            setTimeout(() => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <span class="finding-icon">🔍</span>
                    <span class="finding-text">${finding}</span>
                `;
                li.style.animation = 'fadeIn 0.5s ease-out';
                this.dom.findingslist.appendChild(li);
            }, index * 200);
        });

        // Add SVG gradient for confidence circle
        this.addSVGGradient();
    }

    animateCounter(element, start, end, duration) {
        const startTime = performance.now();
        const updateCounter = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = this.easeOutCubic(progress);
            const currentValue = Math.floor(start + (end - start) * easeProgress);
            
            element.textContent = `${currentValue}%`;
            
            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            }
        };
        
        requestAnimationFrame(updateCounter);
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    typeWriterEffect(element, text, speed = 50) {
        element.textContent = '';
        let i = 0;
        
        const type = () => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(type, speed);
            }
        };
        
        type();
    }

    addSVGGradient() {
        const svg = this.dom.confidencepath?.closest('svg');
        if (svg && !svg.querySelector('defs')) {
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            gradient.id = 'kenyaGradient';
            gradient.setAttribute('x1', '0%');
            gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '100%');
            gradient.setAttribute('y2', '100%');
            
            const stops = [
                { offset: '0%', color: this.kenyanThemes.colors.black },
                { offset: '50%', color: this.kenyanThemes.colors.red },
                { offset: '100%', color: this.kenyanThemes.colors.green }
            ];
            
            stops.forEach(stop => {
                const stopElement = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                stopElement.setAttribute('offset', stop.offset);
                stopElement.setAttribute('stop-color', stop.color);
                gradient.appendChild(stopElement);
            });
            
            defs.appendChild(gradient);
            svg.appendChild(defs);
            
            this.dom.confidencepath.setAttribute('stroke', 'url(#kenyaGradient)');
        }
    }

    renderScanHistory() {
        if (!this.dom.scanhistorylist) return;
        
        this.dom.scanhistorylist.innerHTML = '';
        
        this.state.scanHistory.forEach((scan, index) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.style.animationDelay = `${index * 0.1}s`;
            
            const confidenceColor = scan.confidence >= 80 ? this.kenyanThemes.colors.green :
                                  scan.confidence >= 60 ? this.kenyanThemes.colors.gold :
                                  this.kenyanThemes.colors.red;
            
            item.innerHTML = `
                <div class="history-item-header">
                    <span class="scan-type">${this.kenyanThemes.medicalTerms[scan.type] || scan.type}</span>
                    <span class="scan-date">${new Date(scan.timestamp).toLocaleDateString('sw-KE')}</span>
                </div>
                <div class="history-item-diagnosis">
                    <strong>${scan.diagnosis}</strong>
                </div>
                <div class="history-item-footer">
                    <span class="confidence-badge" style="background: ${confidenceColor}">
                        ${scan.confidence}% Imani
                    </span>
                    <button class="view-details-btn" data-id="${scan.id}">
                        Angalia Maelezo
                    </button>
                </div>
            `;
            
            this.dom.scanhistorylist.appendChild(item);
        });
    }

    renderAnalytics() {
        if (!this.dom.analyticsdata || !this.state.analytics) return;
        
        const { totalScans, accuracy, averageConfidence, commonDiagnosis } = this.state.analytics;
        
        this.dom.analyticsdata.innerHTML = `
            <div class="analytics-grid">
                <div class="analytics-card">
                    <div class="analytics-icon">📊</div>
                    <div class="analytics-value">${totalScans || 0}</div>
                    <div class="analytics-label">Jumla ya Uchambuzi</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-icon">🎯</div>
                    <div class="analytics-value">${accuracy || 0}%</div>
                    <div class="analytics-label">Usahihi wa AI</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-icon">📈</div>
                    <div class="analytics-value">${averageConfidence || 0}%</div>
                    <div class="analytics-label">Wastani wa Imani</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-icon">🏥</div>
                    <div class="analytics-value">${commonDiagnosis || 'N/A'}</div>
                    <div class="analytics-label">Ugonjwa wa Kawaida</div>
                </div>
            </div>
        `;
    }

    /* =====================================================
       EVENT HANDLING & UI CONTROLS
    ===================================================== */
    bindEvents() {
        // Capture button with enhanced feedback
        this.dom.capturetrigger.onclick = () => this.handleCapture();
        
        // Type selection with animation
        this.dom.typeBtns.forEach(btn => {
            btn.onclick = () => {
                this.dom.typeBtns.forEach(b => {
                    b.classList.remove("active");
                    b.style.transform = '';
                });
                
                btn.classList.add("active");
                btn.style.transform = 'scale(1.05)';
                this.state.activeMode = btn.dataset.type;
                
                // Update active mode indicator
                this.notify(`Aina: ${this.kenyanThemes.medicalTerms[btn.dataset.type] || btn.dataset.type}`, "info", 1500);
            };
        });

        // Close results with animation
        this.dom.closeResults.onclick = () => {
            this.dom.resultspanel.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => {
                this.dom.resultspanel.classList.add("hidden");
                this.dom.resultspanel.style.animation = '';
            }, 300);
        };

        // Torch toggle
        this.dom.toggletorch.onclick = async () => {
            const track = this.state.stream?.getVideoTracks()[0];
            if (!track) {
                this.notify("Kamera haipo", "warning");
                return;
            }
            
            try {
                this.state.torchOn = !this.state.torchOn;
                await track.applyConstraints({ 
                    advanced: [{ torch: this.state.torchOn }] 
                });
                
                // Visual feedback
                this.dom.toggletorch.style.transform = 'rotate(30deg)';
                this.dom.toggletorch.style.color = this.state.torchOn ? 
                    this.kenyanThemes.colors.gold : '';
                
                setTimeout(() => {
                    this.dom.toggletorch.style.transform = '';
                }, 300);
                
                this.notify(
                    this.state.torchOn ? "Mwanga umewashwa" : "Mwanga umezimwa",
                    "info",
                    1500
                );
                
            } catch {
                this.notify("Hii kifaa haikubali mwanga wa ziada", "info");
            }
        };

        // Local upload
        this.dom.uploadlocal.onclick = () => this.handleLocalUpload();
        
        // Add window scroll for nav effect
        window.addEventListener('scroll', () => {
            const nav = document.querySelector('.dash-nav');
            if (window.scrollY > 10) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
        });
    }

    async handleLocalUpload() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*,.dcm,.nii";
        input.multiple = false;
        
        input.onclick = () => {
            input.style.opacity = '0';
            input.style.position = 'fixed';
            input.style.top = '0';
            input.style.left = '0';
            input.style.width = '100%';
            input.style.height = '100%';
        };

        input.onchange = async () => {
            if (!input.files || !input.files[0]) return;
            
            const file = input.files[0];
            
            // Validate file
            if (file.size > 50 * 1024 * 1024) { // 50MB limit
                this.notify("Faili ni kubwa sana. Tafadhali chagua faili ndogo ya MB 50.", "error");
                return;
            }
            
            this.toggleLoading(true, "Inasoma faili...");
            
            try {
                // Add file type validation
                if (!file.type.startsWith('image/')) {
                    throw new Error("Tafadhali chagua faili ya picha");
                }
                
                const result = await this.uploadToAI(file);
                this.displayDiagnosis(result);
                
                this.notify("Faili imepakiwa na kuchambuliwa kikamilifu!", "success");
                
            } catch (error) {
                this.notify(this.getErrorMessage(error), "error");
            } finally {
                this.toggleLoading(false);
                input.remove();
            }
        };

        document.body.appendChild(input);
        input.click();
    }

    setupNavigation() {
        this.dom.navItems.forEach(btn => {
            btn.onclick = () => {
                // Update active state
                this.dom.navItems.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                
                // Hide all views
                this.dom.views.forEach(v => v.classList.add("hidden"));
                
                // Show selected view
                const targetView = document.getElementById(`${btn.dataset.tab}-section`);
                if (targetView) {
                    targetView.classList.remove("hidden");
                    targetView.style.animation = 'fadeIn 0.5s ease-out';
                    
                    // Load data for specific tabs
                    if (btn.dataset.tab === 'history') {
                        this.loadScanHistory();
                    } else if (btn.dataset.tab === 'analytics') {
                        this.loadAnalytics();
                    }
                }

                // Handle logout
                if (btn.dataset.tab === "log-out") {
                    this.handleLogout();
                }
            };
        });
    }

    handleLogout() {
        this.notify("Inatoka... Kwaheri!", "info", 1500);
        
        setTimeout(() => {
            // Clear all local data
            localStorage.removeItem("medai_token");
            localStorage.removeItem("medai_user");
            
            // Stop camera
            if (this.state.stream) {
                this.state.stream.getTracks().forEach(track => track.stop());
            }
            
            // Redirect to login
            window.location.href = "reg.html";
        }, 1500);
    }

    /* =====================================================
       UI UTILITIES
    ===================================================== */
    toggleLoading(active, text = "AI inachambua...") {
        this.state.isProcessing = active;
        
        if (this.dom.capturetrigger) {
            this.dom.capturetrigger.disabled = active;
            this.dom.capturetrigger.style.opacity = active ? '0.7' : '1';
        }
        
        this.updateAIStatus(active ? text : "AI Tayari", active);
        
        if (active && text) {
            this.notify(text, "info", 2000);
        }
        
        // Toggle scanner overlay
        if (this.dom.targetBox) {
            this.dom.targetBox.style.opacity = active ? '0.5' : '1';
        }
    }

    updateAIStatus(text, isProcessing = false) {
        if (!this.dom.aistatus) return;
        
        this.dom.aistatus.textContent = text;
        this.dom.aistatus.classList.toggle('processing', isProcessing);
        
        if (!this.dom.aistatus.classList.contains('hidden')) {
            this.dom.aistatus.classList.remove('hidden');
        }
    }

    notify(message, type = "info", duration = 4000) {
        if (!this.dom.notification) return;
        
        // Clear existing timer
        clearTimeout(this.notifTimer);
        
        // Update notification
        this.dom.notification.textContent = message;
        this.dom.notification.className = `notification ${type}`;
        this.dom.notification.classList.remove("hidden");
        
        // Add show class for animation
        setTimeout(() => {
            this.dom.notification.classList.add('show');
        }, 10);
        
        // Auto-hide
        this.notifTimer = setTimeout(() => {
            this.dom.notification.classList.remove('show');
            setTimeout(() => {
                this.dom.notification.classList.add("hidden");
            }, 300);
        }, duration);
    }

    renderUser() {
        if (this.dom.displayname) {
            this.dom.displayname.textContent = `Dkt. ${this.state.user.name}`;
        }
        if (this.dom.userrole) {
            this.dom.userrole.textContent = this.state.user.role || 'Daktari';
        }
        if (this.dom.userhospital) {
            this.dom.userhospital.textContent = this.state.user.hospital || 'Hospitali ya Kenya';
        }
        if (this.dom.userAvatar) {
            // Generate initials for avatar
            const initials = this.state.user.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);
            
            this.dom.userAvatar.textContent = initials || 'MD';
        }
    }

    setupConnectionMonitoring() {
        // Online/offline detection
        window.addEventListener('online', () => {
            this.state.isOnline = true;
            this.updateConnectionStatus('stable');
            this.notify("Muunganisho wa intaneti umerejeshwa", "success");
        });

        window.addEventListener('offline', () => {
            this.state.isOnline = false;
            this.updateConnectionStatus('offline');
            this.notify("Hakuna muunganisho wa intaneti", "warning");
        });

        // Periodic connection check
        setInterval(() => {
            if (navigator.onLine !== this.state.isOnline) {
                this.state.isOnline = navigator.onLine;
                this.updateConnectionStatus(this.state.isOnline ? 'stable' : 'offline');
            }
        }, 5000);
    }
}

// Initialize with enhanced loading
window.addEventListener("DOMContentLoaded", () => {
    // Add loading animation
    const loadingScreen = document.createElement('div');
    loadingScreen.className = 'loading-screen';
    loadingScreen.innerHTML = `
        <div class="loading-content">
            <div class="kenya-loader">
                <div class="loader-circle" style="border-color: #000000;"></div>
                <div class="loader-circle" style="border-color: #BB0000; animation-delay: -0.5s;"></div>
                <div class="loader-circle" style="border-color: #006600; animation-delay: -1s;"></div>
            </div>
            <div class="loading-text">Inapakia MedAI Kenya...</div>
        </div>
    `;
    
    document.body.appendChild(loadingScreen);
    
    // Initialize app
    const app = new MedAICore();
    
    // Remove loading screen after initialization
    setTimeout(() => {
        loadingScreen.style.opacity = '0';
        loadingScreen.style.transition = 'opacity 0.5s ease-out';
        setTimeout(() => {
            loadingScreen.remove();
        }, 500);
    }, 1500);
    
    // Make app globally available for debugging
    window.MedAI = app;
});

// Add loading screen styles if not present
if (!document.querySelector('style[data-loading-screen]')) {
    const style = document.createElement('style');
    style.dataset.loadingScreen = true;
    style.textContent = `
        .loading-screen {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #0A0A0A 0%, #111 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }
        
        .loading-content {
            text-align: center;
        }
        
        .kenya-loader {
            position: relative;
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
        }
        
        .loader-circle {
            position: absolute;
            width: 100%;
            height: 100%;
            border: 4px solid transparent;
            border-radius: 50%;
            animation: spin 1.5s linear infinite;
            border-top-color: currentColor;
        }
        
        .loading-text {
            color: #FFFFFF;
            font-size: 1.2rem;
            font-weight: 500;
            letter-spacing: 1px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}
