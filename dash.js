/**
 * MED-AI DASHBOARD CORE (dash.js)
 * Robust Implementation for Medical Diagnostics
 */

const DashApp = {
    // --- Configuration & State ---
    state: {
        activeTab: 'scanner',
        scanType: 'xray',
        isAnalyzing: false,
        cameraFacing: 'environment', // 'user' or 'environment'
        stream: null,
        history: []
    },

    // --- Initialization ---
    init() {
        console.log("🚀 Med-AI Dashboard Initializing...");
        this.cacheDOM();
        this.bindEvents();
        this.startCamera();
        this.updateUserSession();
        
        // Remove loading overlay after a short delay
        setTimeout(() => {
            document.getElementById('loading-overlay')?.classList.add('hidden');
        }, 1500);
    },

    cacheDOM() {
        this.dom = {
            video: document.getElementById('camera-stream'),
            captureBtn: document.getElementById('capture-trigger'),
            statusBadge: document.getElementById('ai-status'),
            resultsPanel: document.getElementById('results-panel'),
            sections: {
                scanner: document.getElementById('scanner-section'),
                history: document.getElementById('history-section'),
                analytics: document.getElementById('analytics-section')
            },
            navItems: document.querySelectorAll('.nav-item'),
            typeBtns: document.querySelectorAll('.type-btn'),
            displayName: document.getElementById('display-name')
        };
    },

    bindEvents() {
        // Navigation / Tab Switching
        this.dom.navItems.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Scan Type Selection
        this.dom.typeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.dom.typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.scanType = btn.dataset.type;
                this.showToast(`Switched to ${this.state.scanType.toUpperCase()} mode`);
            });
        });

        // Camera Actions
        this.dom.captureBtn.addEventListener('click', () => this.performAnalysis());
        document.getElementById('switch-camera')?.addEventListener('click', () => this.toggleCamera());
        document.getElementById('close-results')?.addEventListener('click', () => this.toggleResults(false));
        
        // Utility buttons
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            if(confirm("Are you sure you want to log out?")) window.location.href = 'auth.html';
        });
    },

    // --- View Logic ---
    switchTab(tabId) {
        if (this.state.isAnalyzing) return;

        // Update UI state
        this.dom.navItems.forEach(nav => {
            nav.classList.toggle('active', nav.dataset.tab === tabId);
        });

        // Toggle visibility with simple logic
        Object.keys(this.dom.sections).forEach(key => {
            this.dom.sections[key].classList.toggle('hidden', key !== tabId);
        });

        this.state.activeTab = tabId;
        
        // Manage camera resources
        if (tabId === 'scanner') this.startCamera();
        else this.stopCamera();
    },

    // --- Camera Engine ---
    async startCamera() {
        try {
            if (this.state.stream) this.stopCamera();

            const constraints = {
                video: {
                    facingMode: this.state.cameraFacing,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.dom.video.srcObject = this.state.stream;
            this.dom.statusBadge.textContent = "AI READY";
        } catch (err) {
            console.error("Camera Error:", err);
            this.showToast("Camera access denied or unavailable", "warning");
            this.dom.statusBadge.textContent = "OFFLINE";
        }
    },

    stopCamera() {
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
            this.state.stream = null;
        }
    },

    toggleCamera() {
        this.state.cameraFacing = (this.state.cameraFacing === 'user') ? 'environment' : 'user';
        this.startCamera();
    },

    // --- Diagnostic Logic ---
    async performAnalysis() {
        if (this.state.isAnalyzing) return;

        this.state.isAnalyzing = true;
        this.dom.captureBtn.classList.add('processing');
        this.dom.statusBadge.textContent = "ANALYZING...";

        // Simulate Neural Network latency
        await new Promise(res => setTimeout(res, 2500));

        const mockResult = this.generateMockResult();
        this.renderResults(mockResult);
        this.toggleResults(true);

        this.state.isAnalyzing = false;
        this.dom.captureBtn.classList.remove('processing');
        this.dom.statusBadge.textContent = "AI READY";
    },

    renderResults(data) {
        // Update Confidence Circle
        const path = document.getElementById('confidence-path');
        const text = document.getElementById('confidence-text');
        path.style.strokeDasharray = `${data.confidence}, 100`;
        text.textContent = `${data.confidence}%`;

        // Update Text
        document.getElementById('result-title').textContent = data.title;
        document.getElementById('result-description').textContent = data.description;
        document.getElementById('modality-type').textContent = this.state.scanType.toUpperCase();
        document.getElementById('study-id').textContent = `MD-${Math.floor(Math.random()*9000)+1000}`;

        // Render Findings List
        const list = document.getElementById('findings-list');
        list.innerHTML = data.findings.map(f => `
            <li>
                <span class="finding-dot"></span>
                ${f}
            </li>
        `).join('');
    },

    toggleResults(show) {
        this.dom.resultsPanel.classList.toggle('hidden', !show);
        document.body.style.overflow = show ? 'hidden' : '';
    },

    // --- Helpers ---
    showToast(msg, type = 'info') {
        const toast = document.getElementById('notification');
        toast.textContent = msg;
        toast.className = `notification-toast visible ${type}`;
        setTimeout(() => toast.classList.remove('visible'), 3000);
    },

    updateUserSession() {
        // In a real app, fetch from localStorage/Firebase
        const user = { name: "Dr. Kibaki", role: "Radiologist" };
        if(this.dom.displayName) this.dom.displayName.textContent = user.name;
    },

    generateMockResult() {
        const results = {
            xray: {
                title: "Clear Pulmonary Fields",
                description: "No acute osseous abnormality or pleural effusion detected.",
                confidence: 98,
                findings: ["Normal heart size", "Lungs are clear", "Trachea is midline"]
            },
            mri: {
                title: "Soft Tissue Analysis",
                description: "Localized inflammation observed in the ligament area.",
                confidence: 84,
                findings: ["Minor swelling", "No structural tear", "Joint space preserved"]
            }
        };
        return results[this.state.scanType] || results.xray;
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => DashApp.init());
