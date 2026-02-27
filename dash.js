/**
 * MED-AI NEURAL COCKPIT (dash.js)
 * Features: Emergency Triage, Heatmap HUD, Voice Scribe, Analytics & Live Sync
 */

const DashApp = {
    state: {
        activeTab: 'scanner',
        scanType: 'xray',
        isAnalyzing: false,
        history: JSON.parse(localStorage.getItem('medai_history')) || [],
        recognition: null,
        stream: null
    },

    init() {
        console.log("🚀 Neural Cockpit Initializing...");
        this.cacheDOM();
        this.bindEvents();
        this.initVoiceScribe();
        this.updateUserSession();
        this.refreshUI();
        
        // Start camera if on scanner tab
        if (this.state.activeTab === 'scanner') this.startCamera();
        
        // Request Notification permissions for Triage
        if (Notification.permission !== "granted") Notification.requestPermission();
    },

    cacheDOM() {
        this.dom = {
            video: document.getElementById('camera-stream'),
            canvas: document.getElementById('heatmap-canvas'),
            captureBtn: document.getElementById('capture-trigger'),
            scribeBtn: document.getElementById('voice-scribe-btn'),
            statusBadge: document.getElementById('ai-status'),
            displayName: document.getElementById('display-name'),
            historyList: document.getElementById('history-list'),
            sections: document.querySelectorAll('.dash-section'),
            navItems: document.querySelectorAll('.nav-item'),
            clinicalNotes: document.getElementById('clinical-notes')
        };
    },

    bindEvents() {
        // Navigation
        this.dom.navItems.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Scan Execution
        this.dom.captureBtn.addEventListener('click', () => this.performNeuralAnalysis());

        // Modality Selection
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.state.scanType = e.currentTarget.dataset.type;
            });
        });

        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', () => window.MedAI.logout());
    },

    // ==================== 1. EMERGENCY TRIAGE SYSTEM ====================
    triggerTriage(result) {
        if (result.severity === 'CRITICAL') {
            // Visual feedback
            document.body.classList.add('emergency-alert-active');
            
            // Haptic/Audio feedback
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            const alertAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            alertAudio.play().catch(() => {});

            // System Notification
            if (Notification.permission === "granted") {
                new Notification("🚨 CRITICAL FINDING", {
                    body: `${result.title} detected. Immediate attention required.`,
                    tag: "triage-alert"
                });
            }

            setTimeout(() => document.body.classList.remove('emergency-alert-active'), 8000);
        }
    },

    // ==================== 2. HEATMAP OVERLAY ENGINE ====================
    drawHeatmap(coords) {
        const ctx = this.dom.canvas.getContext('2d');
        this.dom.canvas.width = this.dom.video.videoWidth;
        this.dom.canvas.height = this.dom.video.videoHeight;

        ctx.clearRect(0, 0, this.dom.canvas.width, this.dom.canvas.height);

        if (!coords) return;

        const { x, y, radius } = coords;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, 'rgba(255, 0, 0, 0.7)');
        grad.addColorStop(0.5, 'rgba(255, 165, 0, 0.4)');
        grad.addColorStop(1, 'rgba(255, 255, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    },

    // ==================== 3. VOICE SCRIBE (AI DICTATION) ====================
    initVoiceScribe() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Speech) return;

        this.state.recognition = new Speech();
        this.state.recognition.onresult = (e) => {
            const text = e.results[0][0].transcript;
            if (this.dom.clinicalNotes) {
                this.dom.clinicalNotes.value += (this.dom.clinicalNotes.value ? ". " : "") + text;
                window.Notification.show("Notes updated via voice", "success");
            }
        };

        this.dom.scribeBtn.addEventListener('click', () => {
            this.state.recognition.start();
            this.dom.scribeBtn.classList.add('recording-active');
        });

        this.state.recognition.onend = () => this.dom.scribeBtn.classList.remove('recording-active');
    },

    // ==================== CORE ANALYSIS LOGIC ====================
    async performNeuralAnalysis() {
        if (this.state.isAnalyzing) return;
        
        this.state.isAnalyzing = true;
        this.dom.statusBadge.textContent = "AI PROCESSING...";
        this.dom.captureBtn.disabled = true;

        // Simulate Neural Network Latency
        await new Promise(r => setTimeout(r, 2500));

        const result = this.generateClinicalResult();
        
        // Execute Modules
        this.triggerTriage(result);
        this.drawHeatmap(result.coords);
        this.saveEntry(result);
        this.renderResults(result);
        
        this.state.isAnalyzing = false;
        this.dom.statusBadge.textContent = "SYSTEM READY";
        this.dom.captureBtn.disabled = false;
    },

    generateClinicalResult() {
        // Mocking AI Logic - In production, this comes from window.MedAI.api
        const isCritical = Math.random() > 0.7;
        return {
            id: Date.now(),
            title: isCritical ? "Pneumothorax Detected" : "Normal Radiograph",
            severity: isCritical ? "CRITICAL" : "NORMAL",
            confidence: Math.floor(Math.random() * 20) + 80,
            type: this.state.scanType,
            date: new Date().toISOString(),
            findings: isCritical ? ["Pleural line separation", "Mediastinal shift"] : ["Clear lung fields", "No abnormalities"],
            coords: isCritical ? { x: 300, y: 200, radius: 120 } : null
        };
    },

    // ==================== DATA & UI HELPERS ====================
    saveEntry(entry) {
        this.state.history.unshift(entry);
        localStorage.setItem('medai_history', JSON.stringify(this.state.history));
        this.refreshUI();
    },

    refreshUI() {
        this.renderHistory();
        this.renderAnalytics();
    },

    renderHistory() {
        if (!this.dom.historyList) return;
        this.dom.historyList.innerHTML = this.state.history.map(item => `
            <div class="history-item ${item.severity === 'CRITICAL' ? 'critical-border' : ''}">
                <div class="item-meta">
                    <strong>${item.title}</strong>
                    <span>${new Date(item.date).toLocaleTimeString()}</span>
                </div>
                <div class="item-badge ${item.severity.toLowerCase()}">${item.confidence}% Conf.</div>
            </div>
        `).join('');
    },

    renderAnalytics() {
        const container = document.getElementById('analytics-data');
        if (!container) return;

        const total = this.state.history.length;
        const criticalCount = this.state.history.filter(h => h.severity === 'CRITICAL').length;
        
        container.innerHTML = `
            <div class="stat-box"><h4>${total}</h4><p>Total Scans</p></div>
            <div class="stat-box"><h4>${criticalCount}</h4><p>Urgent Cases</p></div>
            <div class="stat-box"><h4>${total ? Math.round((criticalCount/total)*100) : 0}%</h4><p>Triage Rate</p></div>
        `;
    },

    switchTab(tabId) {
        this.dom.sections.forEach(s => s.classList.add('hidden'));
        document.getElementById(`${tabId}-section`).classList.remove('hidden');
        
        this.dom.navItems.forEach(n => n.classList.toggle('active', n.dataset.tab === tabId));
        this.state.activeTab = tabId;

        if (tabId === 'scanner') this.startCamera();
        else this.stopCamera();
    },

    updateUserSession() {
        const user = window.MedAI.getUser();
        if (user && this.dom.displayName) {
            this.dom.displayName.textContent = user.name.startsWith('Dr.') ? user.name : `Dr. ${user.name}`;
        }
    },

    async startCamera() {
        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            this.dom.video.srcObject = this.state.stream;
        } catch (err) {
            console.error("Camera access denied", err);
        }
    },

    stopCamera() {
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
        }
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => DashApp.init());
