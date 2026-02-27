/**
 * MED-AI DASHBOARD CORE (dash.js)
 * Enhanced with Auth Integration, History Tracking, and Analytics
 */

const DashApp = {
    state: {
        activeTab: 'scanner',
        scanType: 'xray',
        isAnalyzing: false,
        cameraFacing: 'environment',
        stream: null,
        // Loaded from LocalStorage or API
        history: JSON.parse(localStorage.getItem('medai_history')) || [],
        analytics: {
            totalScans: 0,
            averageConfidence: 0,
            distribution: { xray: 0, ct: 0, mri: 0, ultrasound: 0 }
        }
    },

    init() {
        console.log("🚀 Med-AI Dashboard Initializing...");
        this.cacheDOM();
        this.bindEvents();
        this.startCamera();
        
        // Auth Integration
        this.updateUserSession();
        
        // Initial Data Load
        this.updateAnalytics();
        this.renderHistory();

        setTimeout(() => {
            document.getElementById('loading-overlay')?.classList.add('hidden');
        }, 1000);
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
            displayName: document.getElementById('display-name'),
            historyList: document.getElementById('history-list'),
            analyticsPlaceholder: document.querySelector('.analytics-placeholder')
        };
    },

    bindEvents() {
        this.dom.navItems.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        this.dom.typeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.dom.typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.scanType = btn.dataset.type;
            });
        });

        this.dom.captureBtn.addEventListener('click', () => this.performAnalysis());
        document.getElementById('close-results')?.addEventListener('click', () => this.toggleResults(false));
        document.getElementById('logout-btn')?.addEventListener('click', () => window.MedAI.logout());
        
        // History Search
        document.querySelector('.search-input')?.addEventListener('input', (e) => {
            this.renderHistory(e.target.value);
        });
    },

    updateUserSession() {
        const user = window.MedAI.getUser();
        if (user && this.dom.displayName) {
            const prefix = user.name.toLowerCase().startsWith('dr') ? '' : 'Dr. ';
            this.dom.displayName.textContent = `${prefix}${user.name}`;
            
            const avatar = document.getElementById('avatar-circle');
            if(avatar) avatar.textContent = user.name.charAt(0).toUpperCase();
        }
    },

    // --- Tab Management ---
    switchTab(tabId) {
        if (this.state.isAnalyzing) return;
        Object.keys(this.dom.sections).forEach(key => {
            this.dom.sections[key].classList.toggle('hidden', key !== tabId);
        });
        this.dom.navItems.forEach(nav => nav.classList.toggle('active', nav.dataset.tab === tabId));
        
        if (tabId === 'scanner') this.startCamera();
        else this.stopCamera();

        if (tabId === 'analytics') this.renderAnalytics();
    },

    // --- Analysis & History Logic ---
    async performAnalysis() {
        if (this.state.isAnalyzing) return;
        this.state.isAnalyzing = true;
        this.dom.statusBadge.textContent = "ANALYZING...";
        
        await new Promise(res => setTimeout(res, 2000));

        const result = this.generateMockResult();
        
        // Save to History
        const historyEntry = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            type: this.state.scanType,
            ...result
        };
        
        this.state.history.unshift(historyEntry);
        localStorage.setItem('medai_history', JSON.stringify(this.state.history));
        
        this.renderResults(result);
        this.toggleResults(true);
        this.updateAnalytics();

        this.state.isAnalyzing = false;
        this.dom.statusBadge.textContent = "AI READY";
    },

    renderHistory(filter = "") {
        if (!this.dom.historyList) return;
        
        const filtered = this.state.history.filter(item => 
            item.title.toLowerCase().includes(filter.toLowerCase()) || 
            item.type.includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            this.dom.historyList.innerHTML = `<div class="empty-state">No scans match your search.</div>`;
            return;
        }

        this.dom.historyList.innerHTML = filtered.map(item => `
            <div class="history-card animate-fade-in">
                <div class="history-type-icon">${item.type === 'xray' ? '🩻' : '🧠'}</div>
                <div class="history-info">
                    <h4>${item.title}</h4>
                    <p>${item.date} • ${item.type.toUpperCase()}</p>
                </div>
                <div class="history-conf">${item.confidence}%</div>
            </div>
        `).join('');
    },

    // --- Analytics Logic ---
    updateAnalytics() {
        const hist = this.state.history;
        this.state.analytics.totalScans = hist.length;
        
        if (hist.length > 0) {
            const sumConf = hist.reduce((acc, curr) => acc + curr.confidence, 0);
            this.state.analytics.averageConfidence = Math.round(sumConf / hist.length);
            
            // Distribution
            this.state.analytics.distribution = hist.reduce((acc, curr) => {
                acc[curr.type] = (acc[curr.type] || 0) + 1;
                return acc;
            }, { xray: 0, ct: 0, mri: 0, ultrasound: 0 });
        }
    },

    renderAnalytics() {
        const { totalScans, averageConfidence, distribution } = this.state.analytics;
        
        this.dom.analyticsPlaceholder.innerHTML = `
            <div class="analytics-grid">
                <div class="stat-card">
                    <span class="label">Total Diagnostics</span>
                    <span class="value">${totalScans}</span>
                </div>
                <div class="stat-card">
                    <span class="label">Avg. AI Confidence</span>
                    <span class="value">${averageConfidence}%</span>
                </div>
                <div class="stat-card">
                    <span class="label">Active Modality</span>
                    <span class="value">${this.getTopModality()}</span>
                </div>
            </div>
            
            <div class="distribution-chart-container">
                <h4>Modality Distribution</h4>
                ${Object.entries(distribution).map(([type, count]) => `
                    <div class="dist-row">
                        <span>${type.toUpperCase()}</span>
                        <div class="progress-bar">
                            <div class="fill" style="width: ${totalScans ? (count/totalScans)*100 : 0}%"></div>
                        </div>
                        <span>${count}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },

    getTopModality() {
        const dist = this.state.analytics.distribution;
        return Object.keys(dist).reduce((a, b) => dist[a] > dist[b] ? a : b).toUpperCase();
    },

    // --- Camera & Results (Standard Logic) ---
    async startCamera() {
        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.state.cameraFacing }
            });
            this.dom.video.srcObject = this.state.stream;
        } catch (e) { this.dom.statusBadge.textContent = "OFFLINE"; }
    },

    stopCamera() {
        if (this.state.stream) this.state.stream.getTracks().forEach(t => t.stop());
    },

    toggleResults(show) {
        this.dom.resultsPanel.classList.toggle('hidden', !show);
    },

    renderResults(data) {
        document.getElementById('confidence-path').style.strokeDasharray = `${data.confidence}, 100`;
        document.getElementById('confidence-text').textContent = `${data.confidence}%`;
        document.getElementById('result-title').textContent = data.title;
        document.getElementById('result-description').textContent = data.description;
        document.getElementById('findings-list').innerHTML = data.findings.map(f => `<li>${f}</li>`).join('');
    },

    generateMockResult() {
        const types = {
            xray: { title: "Normal Thoracic Scan", confidence: 96, findings: ["Lungs clear", "No fractures"] },
            ct: { title: "Clear Cranial View", confidence: 89, findings: ["No hemorrhage", "Ventricles normal"] },
            mri: { title: "Soft Tissue Assessment", confidence: 92, findings: ["Ligaments intact", "No edema"] },
            ultrasound: { title: "Abdominal Fluid Check", confidence: 85, findings: ["Organ size normal", "No free fluid"] }
        };
        return types[this.state.scanType] || types.xray;
    }
};

document.addEventListener('DOMContentLoaded', () => DashApp.init());
