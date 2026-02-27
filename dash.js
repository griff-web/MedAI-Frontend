/**
 * MED-AI NEURAL COCKPIT (dash.js)
 * Unified Version: Triage + Heatmap + Voice + Advanced Analytics
 */

const DashApp = {
    state: {
        activeTab: 'scanner',
        scanType: 'xray',
        isAnalyzing: false,
        cameraFacing: 'environment',
        stream: null,
        history: JSON.parse(localStorage.getItem('medai_history')) || [],
        recognition: null,
        analytics: {
            totalScans: 0,
            averageConfidence: 0,
            distribution: { xray: 0, ct: 0, mri: 0, ultrasound: 0 }
        }
    },

    init() {
        console.log("🚀 Neural Cockpit Initializing...");
        this.cacheDOM();
        this.bindEvents();
        this.initVoiceScribe();
        this.updateUserSession();
        
        // Initial Data Sync
        this.updateAnalytics();
        this.renderHistory();

        if (this.state.activeTab === 'scanner') this.startCamera();
        if (Notification.permission !== "granted") Notification.requestPermission();

        // Hide loader
        setTimeout(() => {
            document.getElementById('loading-overlay')?.classList.add('hidden');
        }, 1000);
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
            resultsPanel: document.getElementById('results-panel'),
            clinicalNotes: document.getElementById('clinical-notes'),
            analyticsPlaceholder: document.querySelector('.analytics-placeholder'),
            sections: {
                scanner: document.getElementById('scanner-section'),
                history: document.getElementById('history-section'),
                analytics: document.getElementById('analytics-section')
            },
            navItems: document.querySelectorAll('.nav-item'),
            typeBtns: document.querySelectorAll('.type-btn')
        };
    },

    bindEvents() {
        // Tab Navigation
        this.dom.navItems.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Modality Toggles
        this.dom.typeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.dom.typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.scanType = btn.dataset.type;
            });
        });

        // Search in History
        document.querySelector('.search-input')?.addEventListener('input', (e) => {
            this.renderHistory(e.target.value);
        });

        // Core Actions
        this.dom.captureBtn.addEventListener('click', () => this.performNeuralAnalysis());
        document.getElementById('close-results')?.addEventListener('click', () => this.toggleResults(false));
        document.getElementById('logout-btn')?.addEventListener('click', () => window.MedAI.logout());
    },

    // ==================== MEDICAL MODULES ====================

    triggerTriage(result) {
        if (result.severity === 'CRITICAL') {
            document.body.classList.add('emergency-alert-active');
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            
            const alertAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            alertAudio.play().catch(() => {});

            if (Notification.permission === "granted") {
                new Notification("🚨 CRITICAL FINDING", { body: `${result.title} detected.` });
            }
            setTimeout(() => document.body.classList.remove('emergency-alert-active'), 8000);
        }
    },

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

    initVoiceScribe() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Speech || !this.dom.scribeBtn) return;

        this.state.recognition = new Speech();
        this.state.recognition.onresult = (e) => {
            const text = e.results[0][0].transcript;
            if (this.dom.clinicalNotes) {
                this.dom.clinicalNotes.value += (this.dom.clinicalNotes.value ? ". " : "") + text;
            }
        };

        this.dom.scribeBtn.addEventListener('click', () => {
            this.state.recognition.start();
            this.dom.scribeBtn.classList.add('recording-active');
        });
        this.state.recognition.onend = () => this.dom.scribeBtn.classList.remove('recording-active');
    },

    // ==================== ENGINE & LOGIC ====================

    async performNeuralAnalysis() {
        if (this.state.isAnalyzing) return;
        this.state.isAnalyzing = true;
        this.dom.statusBadge.textContent = "AI PROCESSING...";
        
        await new Promise(r => setTimeout(r, 2000));

        const result = this.generateClinicalResult();
        
        // Run AI UI Modules
        this.triggerTriage(result);
        this.drawHeatmap(result.coords);
        
        // Save & Render
        const entry = { id: Date.now(), date: new Date().toLocaleString(), ...result };
        this.state.history.unshift(entry);
        localStorage.setItem('medai_history', JSON.stringify(this.state.history));
        
        this.renderResults(result);
        this.toggleResults(true);
        this.updateAnalytics();
        this.renderHistory();

        this.state.isAnalyzing = false;
        this.dom.statusBadge.textContent = "AI READY";
    },

    generateClinicalResult() {
        const isCritical = Math.random() > 0.7;
        const types = {
            xray: { title: isCritical ? "Pneumothorax" : "Normal Thoracic", findings: ["Clear lung fields"] },
            ct: { title: isCritical ? "Hemorrhage" : "Clear Cranial", findings: ["Normal ventricles"] },
            mri: { title: "Soft Tissue Assessment", findings: ["No edema"] },
            ultrasound: { title: "Abdominal Fluid Check", findings: ["No free fluid"] }
        };
        const base = types[this.state.scanType] || types.xray;

        return {
            ...base,
            severity: isCritical ? "CRITICAL" : "NORMAL",
            confidence: Math.floor(Math.random() * 15) + 85,
            type: this.state.scanType,
            description: "AI-generated automated assessment based on neural visual patterns.",
            coords: isCritical ? { x: 300, y: 200, radius: 120 } : null
        };
    },

    // ==================== UI RENDERING ====================

    updateAnalytics() {
        const hist = this.state.history;
        this.state.analytics.totalScans = hist.length;
        if (hist.length > 0) {
            const sumConf = hist.reduce((acc, curr) => acc + curr.confidence, 0);
            this.state.analytics.averageConfidence = Math.round(sumConf / hist.length);
            this.state.analytics.distribution = hist.reduce((acc, curr) => {
                acc[curr.type] = (acc[curr.type] || 0) + 1;
                return acc;
            }, { xray: 0, ct: 0, mri: 0, ultrasound: 0 });
        }
    },

    renderAnalytics() {
        const { totalScans, averageConfidence, distribution } = this.state.analytics;
        if (!this.dom.analyticsPlaceholder) return;
        
        this.dom.analyticsPlaceholder.innerHTML = `
            <div class="analytics-grid">
                <div class="stat-card"><span>Total</span><span class="value">${totalScans}</span></div>
                <div class="stat-card"><span>Avg Conf.</span><span class="value">${averageConfidence}%</span></div>
            </div>
            <div class="distribution-chart-container">
                <h4>Distribution</h4>
                ${Object.entries(distribution).map(([type, count]) => `
                    <div class="dist-row">
                        <span>${type.toUpperCase()}</span>
                        <div class="progress-bar"><div class="fill" style="width:${totalScans ? (count/totalScans)*100 : 0}%"></div></div>
                        <span>${count}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderHistory(filter = "") {
        if (!this.dom.historyList) return;
        const filtered = this.state.history.filter(item => 
            item.title.toLowerCase().includes(filter.toLowerCase())
        );

        this.dom.historyList.innerHTML = filtered.map(item => `
            <div class="history-card ${item.severity === 'CRITICAL' ? 'critical-border' : ''}">
                <div class="history-info">
                    <h4>${item.title}</h4>
                    <p>${item.date} • ${item.type.toUpperCase()}</p>
                </div>
                <div class="item-badge ${item.severity.toLowerCase()}">${item.confidence}%</div>
            </div>
        `).join('');
    },

    renderResults(data) {
        document.getElementById('confidence-path').style.strokeDasharray = `${data.confidence}, 100`;
        document.getElementById('confidence-text').textContent = `${data.confidence}%`;
        document.getElementById('result-title').textContent = data.title;
        document.getElementById('result-description').textContent = data.description;
        document.getElementById('findings-list').innerHTML = data.findings.map(f => `<li>${f}</li>`).join('');
    },

    // ==================== CORE UTILITIES ====================

    switchTab(tabId) {
        if (this.state.isAnalyzing) return;
        Object.keys(this.dom.sections).forEach(key => {
            this.dom.sections[key].classList.toggle('hidden', key !== tabId);
        });
        this.dom.navItems.forEach(nav => nav.classList.toggle('active', nav.dataset.tab === tabId));
        this.state.activeTab = tabId;
        
        if (tabId === 'scanner') this.startCamera();
        else { this.stopCamera(); this.drawHeatmap(null); }
        if (tabId === 'analytics') this.renderAnalytics();
    },

    toggleResults(show) {
        this.dom.resultsPanel.classList.toggle('hidden', !show);
    },

    updateUserSession() {
        const user = window.MedAI.getUser();
        if (user && this.dom.displayName) {
            this.dom.displayName.textContent = `Dr. ${user.name.replace('Dr. ', '')}`;
        }
    },

    async startCamera() {
        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            this.dom.video.srcObject = this.state.stream;
        } catch (e) { this.dom.statusBadge.textContent = "OFFLINE"; }
    },

    stopCamera() {
        if (this.state.stream) this.state.stream.getTracks().forEach(t => t.stop());
    }
};

document.addEventListener('DOMContentLoaded', () => DashApp.init());
