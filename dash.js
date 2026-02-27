/**
 * MED-AI DASHBOARD CORE v2 (Fully Functional Demo)
 * Camera, History, Analytics & Mock AI
 */

const DashApp = {
    state: {
        activeTab: 'scanner',
        scanType: 'xray',
        isAnalyzing: false,
        cameraFacing: 'environment',
        stream: null,
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
        this.seedDemoData();
        this.updateUserSession();
        this.updateAnalytics();
        this.renderHistory();
        this.startCamera();
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
        this.dom.navItems.forEach(btn => btn.addEventListener('click', () => this.switchTab(btn.dataset.tab)));

        this.dom.typeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.dom.typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.scanType = btn.dataset.type;
            });
        });

        this.dom.captureBtn?.addEventListener('click', () => this.performAnalysis());

        document.getElementById('close-results')?.addEventListener('click', () => this.toggleResults(false));

        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce((e) => this.renderHistory(e.target.value), 300));
        }
    },

    updateUserSession() {
        if (!window.MedAI?.getUser) return;
        const user = window.MedAI.getUser();
        if (user && this.dom.displayName) {
            const prefix = user.name.toLowerCase().startsWith('dr') ? '' : 'Dr. ';
            this.dom.displayName.textContent = `${prefix}${user.name}`;
        }
    },

    switchTab(tabId) {
        if (this.state.isAnalyzing) return;
        Object.keys(this.dom.sections).forEach(key => {
            this.dom.sections[key]?.classList.toggle('hidden', key !== tabId);
        });

        this.dom.navItems.forEach(nav => nav.classList.toggle('active', nav.dataset.tab === tabId));

        if (tabId === 'scanner') this.startCamera();
        else this.stopCamera();

        if (tabId === 'analytics') this.renderAnalytics();
    },

    async startCamera() {
        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.state.cameraFacing }
            });
            this.dom.video.srcObject = this.state.stream;
            this.dom.video.play();
            this.setStatus("AI READY");
        } catch (err) {
            console.error("Camera error:", err);
            this.setStatus("CAMERA OFFLINE");
        }
    },

    stopCamera() {
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
            this.state.stream = null;
        }
    },

    toggleCamera() {
        this.stopCamera();
        this.state.cameraFacing = this.state.cameraFacing === 'environment' ? 'user' : 'environment';
        this.startCamera();
    },

    captureFrame() {
        if (!this.dom.video) return null;
        const canvas = document.createElement('canvas');
        canvas.width = this.dom.video.videoWidth;
        canvas.height = this.dom.video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.dom.video, 0, 0);
        return canvas.toDataURL('image/jpeg');
    },

    async performAnalysis() {
        if (this.state.isAnalyzing) return;
        this.state.isAnalyzing = true;
        this.setStatus("ANALYZING 0%");

        this.captureFrame();

        await this.simulateProgress();

        const result = this.generateMockResult();

        const entry = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            type: this.state.scanType,
            ...result
        };

        this.state.history.unshift(entry);
        localStorage.setItem('medai_history', JSON.stringify(this.state.history));

        this.renderResults(entry);
        this.toggleResults(true);
        this.updateAnalytics();
        this.renderHistory();

        this.state.isAnalyzing = false;
        this.setStatus("AI READY");
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
            }, 200);
        });
    },

    setStatus(text) {
        if (this.dom.statusBadge) this.dom.statusBadge.textContent = text;
    },

    renderHistory(filter = "") {
        if (!this.dom.historyList) return;
        const filtered = this.state.history.filter(item =>
            item.title.toLowerCase().includes(filter.toLowerCase()) ||
            item.type.includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            this.dom.historyList.innerHTML = `<div class="empty-state">No scans found.</div>`;
            return;
        }

        this.dom.historyList.innerHTML = filtered.map(item => `
            <div class="history-card" data-id="${item.id}">
                <div class="history-info">
                    <h4>${item.title}</h4>
                    <p>${item.date} • ${item.type.toUpperCase()}</p>
                </div>
                <div class="history-conf">${item.confidence}%</div>
            </div>
        `).join('');

        // Click to reopen
        this.dom.historyList.querySelectorAll('.history-card')
            .forEach(card => {
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
        const hist = this.state.history;
        const total = hist.length;
        this.state.analytics.totalScans = total;

        if (total === 0) {
            this.state.analytics.averageConfidence = 0;
            this.state.analytics.distribution = { xray: 0, ct: 0, mri: 0, ultrasound: 0 };
            return;
        }

        const sumConf = hist.reduce((a, c) => a + c.confidence, 0);
        this.state.analytics.averageConfidence = Math.round(sumConf / total);

        this.state.analytics.distribution = hist.reduce((acc, c) => {
            acc[c.type] = (acc[c.type] || 0) + 1;
            return acc;
        }, { xray: 0, ct: 0, mri: 0, ultrasound: 0 });
    },

    renderAnalytics() {
        if (!this.dom.analyticsPlaceholder) return;
        const { totalScans, averageConfidence, distribution } = this.state.analytics;
        const topModality = totalScans ? this.getTopModality() : 'N/A';

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
        return Object.keys(dist).reduce((a, b) => dist[a] > dist[b] ? a : b).toUpperCase();
    },

    toggleResults(show) {
        this.dom.resultsPanel?.classList.toggle('hidden', !show);
    },

    renderResults(data) {
        document.getElementById('confidence-path').style.strokeDasharray = `${data.confidence}, 100`;
        document.getElementById('confidence-text').textContent = `${data.confidence}%`;
        document.getElementById('result-title').textContent = data.title;
        document.getElementById('result-description').textContent = data.description;
        document.getElementById('findings-list').innerHTML = data.findings.map(f => `<li>${f}</li>`).join('');
    },

    generateMockResult() {
        const confidence = Math.floor(80 + Math.random() * 20);
        const titles = {
            xray: ["Normal Thoracic Scan", "Mild Pulmonary Opacity"],
            ct: ["Clear Cranial View", "Sinus Inflammation"],
            mri: ["Soft Tissue Assessment", "Ligament Strain"],
            ultrasound: ["Abdominal Scan Clear", "Gallbladder Thickening"]
        };
        const title = titles[this.state.scanType][Math.floor(Math.random() * titles[this.state.scanType].length)];
        return {
            title,
            confidence,
            description: "AI-powered diagnostic interpretation using pattern analysis.",
            findings: ["Feature extraction complete", "Pattern match successful", "No critical anomalies detected"]
        };
    },

    debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    seedDemoData() {
        if (this.state.history.length > 0) return;
        ['xray','ct','mri'].forEach(type => {
            this.state.scanType = type;
            const result = this.generateMockResult();
            this.state.history.push({
                id: Date.now() + Math.random(),
                date: new Date().toLocaleString(),
                type,
                ...result
            });
        });
        localStorage.setItem('medai_history', JSON.stringify(this.state.history));
    }
};

document.addEventListener('DOMContentLoaded', () => DashApp.init());
