/**
 * MED-AI DASHBOARD CORE v2.1 (Improved & Maintainable)
 * Camera, History, Analytics & Mock AI
 */

const DashApp = {
    // Configuration constants
    CONFIG: {
        STORAGE_KEY: 'medai_history',
        DEBOUNCE_DELAY: 300,
        PROGRESS_INTERVAL: 200,
        MIN_CONFIDENCE: 80,
        MAX_CONFIDENCE: 100,
        SCAN_TYPES: ['xray', 'ct', 'mri', 'ultrasound']
    },

    // Mock data templates
    MOCK_DATA: {
        titles: {
            xray: ["Normal Thoracic Scan", "Mild Pulmonary Opacity"],
            ct: ["Clear Cranial View", "Sinus Inflammation"],
            mri: ["Soft Tissue Assessment", "Ligament Strain"],
            ultrasound: ["Abdominal Scan Clear", "Gallbladder Thickening"]
        },
        defaultFindings: ["Feature extraction complete", "Pattern match successful", "No critical anomalies detected"],
        defaultDescription: "AI-powered diagnostic interpretation using pattern analysis."
    },

    state: {
        activeTab: 'scanner',
        scanType: 'xray',
        isAnalyzing: false,
        cameraFacing: 'environment',
        stream: null,
        history: [],
        analytics: {
            totalScans: 0,
            averageConfidence: 0,
            distribution: { xray: 0, ct: 0, mri: 0, ultrasound: 0 }
        }
    },

    // DOM element cache
    dom: {},

    init() {
        console.log("🚀 Med-AI Dashboard Initializing...");
        this.loadState();
        this.cacheDOM();
        this.bindEvents();
        this.seedDemoData();
        this.updateUserSession();
        this.refreshUI();
    },

    // Load persisted state
    loadState() {
        try {
            const savedHistory = localStorage.getItem(this.CONFIG.STORAGE_KEY);
            this.state.history = savedHistory ? JSON.parse(savedHistory) : [];
        } catch (error) {
            console.error("Failed to load history:", error);
            this.state.history = [];
        }
        this.updateAnalytics();
    },

    // Save state to localStorage
    saveState() {
        try {
            localStorage.setItem(this.CONFIG.STORAGE_KEY, JSON.stringify(this.state.history));
        } catch (error) {
            console.error("Failed to save history:", error);
        }
    },

    cacheDOM() {
        const getElement = (id, query = false) => {
            return query ? document.querySelector(id) : document.getElementById(id);
        };

        this.dom = {
            video: getElement('camera-stream'),
            captureBtn: getElement('capture-trigger'),
            statusBadge: getElement('ai-status'),
            resultsPanel: getElement('results-panel'),
            closeResults: getElement('close-results'),
            displayName: getElement('display-name'),
            historyList: getElement('history-list'),
            sections: {
                scanner: getElement('scanner-section'),
                history: getElement('history-section'),
                analytics: getElement('analytics-section')
            },
            navItems: document.querySelectorAll('.nav-item'),
            typeBtns: document.querySelectorAll('.type-btn'),
            analyticsPlaceholder: document.querySelector('.analytics-placeholder'),
            searchInput: document.querySelector('.search-input'),
            resultElements: {
                confidencePath: getElement('confidence-path'),
                confidenceText: getElement('confidence-text'),
                title: getElement('result-title'),
                description: getElement('result-description'),
                findingsList: getElement('findings-list')
            }
        };
    },

    bindEvents() {
        // Navigation
        this.dom.navItems.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Scan type selection
        this.dom.typeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleScanTypeClick(e));
        });

        // Capture button
        if (this.dom.captureBtn) {
            this.dom.captureBtn.addEventListener('click', () => this.performAnalysis());
        }

        // Close results
        if (this.dom.closeResults) {
            this.dom.closeResults.addEventListener('click', () => this.toggleResults(false));
        }

        // Search input with debounce
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener('input', 
                this.debounce((e) => this.renderHistory(e.target.value), this.CONFIG.DEBOUNCE_DELAY)
            );
        }

        // Handle page unload
        window.addEventListener('beforeunload', () => this.cleanup());
    },

    handleScanTypeClick(event) {
        const btn = event.currentTarget;
        this.dom.typeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.scanType = btn.dataset.type;
    },

    cleanup() {
        this.stopCamera();
    },

    refreshUI() {
        this.updateAnalytics();
        this.renderHistory();
        this.startCamera().catch(error => {
            console.error("Camera start failed:", error);
            this.setStatus("CAMERA OFFLINE");
        });
    },

    updateUserSession() {
        if (!window.MedAI?.getUser || !this.dom.displayName) return;
        
        try {
            const user = window.MedAI.getUser();
            if (user?.name) {
                const prefix = user.name.toLowerCase().startsWith('dr') ? '' : 'Dr. ';
                this.dom.displayName.textContent = `${prefix}${user.name}`;
            }
        } catch (error) {
            console.error("Failed to update user session:", error);
        }
    },

    switchTab(tabId) {
        if (this.state.isAnalyzing) return;

        // Hide all sections
        Object.values(this.dom.sections).forEach(section => {
            if (section) section.classList.add('hidden');
        });

        // Show selected section
        const selectedSection = this.dom.sections[tabId];
        if (selectedSection) selectedSection.classList.remove('hidden');

        // Update navigation
        this.dom.navItems.forEach(nav => {
            nav.classList.toggle('active', nav.dataset.tab === tabId);
        });

        // Handle camera
        if (tabId === 'scanner') {
            this.startCamera();
        } else {
            this.stopCamera();
        }

        // Render tab-specific content
        if (tabId === 'analytics') {
            this.renderAnalytics();
        }

        this.state.activeTab = tabId;
    },

    async startCamera() {
        if (this.state.stream) return;

        try {
            const constraints = {
                video: { 
                    facingMode: this.state.cameraFacing,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.dom.video) {
                this.dom.video.srcObject = this.state.stream;
                await this.dom.video.play();
                this.setStatus("AI READY");
            }
        } catch (err) {
            throw new Error(`Camera access failed: ${err.message}`);
        }
    },

    stopCamera() {
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.state.stream = null;
            
            if (this.dom.video) {
                this.dom.video.srcObject = null;
            }
        }
    },

    toggleCamera() {
        this.stopCamera();
        this.state.cameraFacing = this.state.cameraFacing === 'environment' ? 'user' : 'environment';
        this.startCamera().catch(error => {
            console.error("Camera toggle failed:", error);
            this.setStatus("CAMERA OFFLINE");
        });
    },

    captureFrame() {
        if (!this.dom.video || !this.dom.video.videoWidth) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.dom.video.videoWidth;
        canvas.height = this.dom.video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        ctx.drawImage(this.dom.video, 0, 0);
        return canvas.toDataURL('image/jpeg');
    },

    async performAnalysis() {
        if (this.state.isAnalyzing) return;

        this.state.isAnalyzing = true;
        this.setStatus("ANALYZING 0%");

        try {
            // Capture frame (optional, could be used for actual processing)
            this.captureFrame();

            // Simulate AI processing
            await this.simulateProgress();

            // Generate and save result
            const result = this.generateMockResult();
            const entry = this.createHistoryEntry(result);

            this.state.history.unshift(entry);
            this.saveState();

            // Update UI
            this.renderResults(entry);
            this.toggleResults(true);
            this.updateAnalytics();
            this.renderHistory();

        } catch (error) {
            console.error("Analysis failed:", error);
            this.setStatus("ANALYSIS FAILED");
        } finally {
            this.state.isAnalyzing = false;
            this.setStatus("AI READY");
        }
    },

    createHistoryEntry(result) {
        return {
            id: Date.now(),
            date: new Date().toLocaleString(),
            type: this.state.scanType,
            ...result
        };
    },

    simulateProgress() {
        return new Promise(resolve => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 18;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    resolve();
                }
                this.setStatus(`ANALYZING ${Math.floor(progress)}%`);
            }, this.CONFIG.PROGRESS_INTERVAL);
        });
    },

    setStatus(text) {
        if (this.dom.statusBadge) {
            this.dom.statusBadge.textContent = text;
        }
    },

    renderHistory(filter = "") {
        if (!this.dom.historyList) return;

        const filtered = this.filterHistory(filter);
        
        if (filtered.length === 0) {
            this.dom.historyList.innerHTML = '<div class="empty-state">No scans found.</div>';
            return;
        }

        this.dom.historyList.innerHTML = filtered.map(item => this.createHistoryCard(item)).join('');

        // Attach click handlers to history cards
        this.attachHistoryCardHandlers();
    },

    filterHistory(filter) {
        if (!filter) return this.state.history;
        
        const searchTerm = filter.toLowerCase();
        return this.state.history.filter(item => 
            item.title?.toLowerCase().includes(searchTerm) ||
            item.type?.toLowerCase().includes(searchTerm)
        );
    },

    createHistoryCard(item) {
        return `
            <div class="history-card" data-id="${item.id}">
                <div class="history-info">
                    <h4>${this.escapeHtml(item.title)}</h4>
                    <p>${item.date} • ${item.type.toUpperCase()}</p>
                </div>
                <div class="history-conf">${item.confidence}%</div>
            </div>
        `;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    attachHistoryCardHandlers() {
        this.dom.historyList.querySelectorAll('.history-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = Number(card.dataset.id);
                const scan = this.state.history.find(h => h.id === id);
                if (scan) {
                    this.renderResults(scan);
                    this.toggleResults(true);
                    this.switchTab('scanner');
                }
            });
        });
    },

    updateAnalytics() {
        const history = this.state.history;
        const total = history.length;
        
        this.state.analytics.totalScans = total;

        if (total === 0) {
            this.resetAnalytics();
            return;
        }

        // Calculate average confidence
        const validHistory = history.filter(item => typeof item.confidence === 'number');
        if (validHistory.length > 0) {
            const sumConf = validHistory.reduce((sum, item) => sum + item.confidence, 0);
            this.state.analytics.averageConfidence = Math.round(sumConf / validHistory.length);
        }

        // Calculate distribution
        this.state.analytics.distribution = this.calculateDistribution(history);
    },

    resetAnalytics() {
        this.state.analytics.averageConfidence = 0;
        this.state.analytics.distribution = { 
            xray: 0, ct: 0, mri: 0, ultrasound: 0 
        };
    },

    calculateDistribution(history) {
        const distribution = { xray: 0, ct: 0, mri: 0, ultrasound: 0 };
        
        history.forEach(item => {
            if (distribution.hasOwnProperty(item.type)) {
                distribution[item.type]++;
            }
        });
        
        return distribution;
    },

    renderAnalytics() {
        if (!this.dom.analyticsPlaceholder) return;

        const { totalScans, averageConfidence } = this.state.analytics;
        const topModality = this.getTopModality();

        this.dom.analyticsPlaceholder.innerHTML = `
            <div class="stat-card">
                <span>Total Scans</span>
                <strong>${totalScans}</strong>
            </div>
            <div class="stat-card">
                <span>Avg Confidence</span>
                <strong>${averageConfidence}%</strong>
            </div>
            <div class="stat-card">
                <span>Top Modality</span>
                <strong>${topModality}</strong>
            </div>
        `;
    },

    getTopModality() {
        const dist = this.state.analytics.distribution;
        
        // Check if all values are zero
        if (Object.values(dist).every(value => value === 0)) {
            return 'N/A';
        }

        return Object.keys(dist)
            .reduce((a, b) => dist[a] > dist[b] ? a : b)
            .toUpperCase();
    },

    toggleResults(show) {
        if (this.dom.resultsPanel) {
            this.dom.resultsPanel.classList.toggle('hidden', !show);
        }
    },

    renderResults(data) {
        const { resultElements } = this.dom;
        
        if (resultElements.confidencePath) {
            resultElements.confidencePath.style.strokeDasharray = `${data.confidence}, 100`;
        }
        
        if (resultElements.confidenceText) {
            resultElements.confidenceText.textContent = `${data.confidence}%`;
        }
        
        if (resultElements.title) {
            resultElements.title.textContent = data.title;
        }
        
        if (resultElements.description) {
            resultElements.description.textContent = data.description;
        }
        
        if (resultElements.findingsList && Array.isArray(data.findings)) {
            resultElements.findingsList.innerHTML = data.findings
                .map(finding => `<li>${finding}</li>`)
                .join('');
        }
    },

    generateMockResult() {
        const titles = this.MOCK_DATA.titles[this.state.scanType] || this.MOCK_DATA.titles.xray;
        const confidence = Math.floor(this.CONFIG.MIN_CONFIDENCE + Math.random() * 20);
        const title = titles[Math.floor(Math.random() * titles.length)];

        return {
            title,
            confidence,
            description: this.MOCK_DATA.defaultDescription,
            findings: [...this.MOCK_DATA.defaultFindings] // Create a copy
        };
    },

    debounce(fn, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    seedDemoData() {
        if (this.state.history.length > 0) return;

        const demoTypes = ['xray', 'ct', 'mri'];
        const demoData = [];

        demoTypes.forEach(type => {
            // Temporarily set scan type for mock generation
            const originalType = this.state.scanType;
            this.state.scanType = type;
            
            const result = this.generateMockResult();
            demoData.push({
                id: Date.now() + Math.random(),
                date: new Date().toLocaleString(),
                type,
                ...result
            });

            // Restore original type
            this.state.scanType = originalType;
        });

        this.state.history.push(...demoData);
        this.saveState();
        this.updateAnalytics();
    }
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    try {
        DashApp.init();
    } catch (error) {
        console.error("Failed to initialize Med-AI Dashboard:", error);
    }
});
