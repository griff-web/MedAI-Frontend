/**
 * MED-AI DASHBOARD CORE (Enhanced Demo Safe Version)
 * Built on original architecture — fully compatible
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
        this.seedDemoData(); // safe demo data
        this.updateUserSession();
        this.updateAnalytics();
        this.renderHistory();
        this.startCamera();

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.stopCamera();
        });

        window.addEventListener("beforeunload", () => this.stopCamera());
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

        this.dom.captureBtn?.addEventListener('click', () => this.performAnalysis());

        document.getElementById('close-results')
            ?.addEventListener('click', () => this.toggleResults(false));

        // Debounced search (safe)
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener(
                'input',
                this.debounce((e) => this.renderHistory(e.target.value), 300)
            );
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

        this.dom.navItems.forEach(nav =>
            nav.classList.toggle('active', nav.dataset.tab === tabId)
        );

        if (tabId === 'scanner') this.startCamera();
        else this.stopCamera();

        if (tabId === 'analytics') this.renderAnalytics();
    },

    async performAnalysis() {
        if (this.state.isAnalyzing) return;

        this.state.isAnalyzing = true;
        this.setStatus("ANALYZING 0%");

        this.captureFrame(); // realism only

        await this.simulateProgress();

        const result = this.generateMockResult();

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
        this.renderHistory();

        this.state.isAnalyzing = false;
        this.setStatus("AI READY");
    },

    simulateProgress() {
        return new Promise(resolve => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 20;
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
        if (this.dom.statusBadge)
            this.dom.statusBadge.textContent = text;
    },

    captureFrame() {
        if (!this.dom.video) return;

        const canvas = document.createElement('canvas');
        canvas.width = this.dom.video.videoWidth;
        canvas.height = this.dom.video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.dom.video, 0, 0);
        return canvas.toDataURL('image/jpeg');
    },

    renderHistory(filter = "") {
        if (!this.dom.historyList) return;

        const filtered = this.state.history.filter(item =>
            item.title.toLowerCase().includes(filter.toLowerCase()) ||
            item.type.includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            this.dom.historyList.innerHTML =
                `<div class="empty-state">No scans found.</div>`;
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

        if (total === 0) return;

        const sumConf = hist.reduce((acc, curr) => acc + curr.confidence, 0);
        this.state.analytics.averageConfidence = Math.round(sumConf / total);

        this.state.analytics.distribution = hist.reduce((acc, curr) => {
            acc[curr.type] = (acc[curr.type] || 0) + 1;
            return acc;
        }, { xray: 0, ct: 0, mri: 0, ultrasound: 0 });
    },

    renderAnalytics() {
        if (!this.dom.analyticsPlaceholder) return;

        const { totalScans, averageConfidence } = this.state.analytics;

        this.dom.analyticsPlaceholder.innerHTML = `
            <div class="stat-card">
                <span>Total Scans</span>
                <strong>${totalScans}</strong>
            </div>
            <div class="stat-card">
                <span>Avg Confidence</span>
                <strong>${averageConfidence}%</strong>
            </div>
        `;
    },

    toggleResults(show) {
        this.dom.resultsPanel?.classList.toggle('hidden', !show);
    },

    renderResults(data) {
        document.getElementById('confidence-path').style.strokeDasharray =
            `${data.confidence}, 100`;
        document.getElementById('confidence-text').textContent =
            `${data.confidence}%`;
        document.getElementById('result-title').textContent = data.title;
        document.getElementById('result-description').textContent =
            data.description;
        document.getElementById('findings-list').innerHTML =
            data.findings.map(f => `<li>${f}</li>`).join('');
    },

    generateMockResult() {
        const confidence = Math.floor(80 + Math.random() * 20);

        const types = {
            xray: ["Normal Thoracic Scan", "Mild Opacity Detected"],
            ct: ["Clear Cranial View", "Sinus Inflammation"],
            mri: ["Soft Tissue Assessment", "Ligament Strain"],
            ultrasound: ["Abdominal Scan Clear", "Gallbladder Thickening"]
        };

        const titles = types[this.state.scanType];
        const title = titles[Math.floor(Math.random() * titles.length)];

        return {
            title,
            confidence,
            description:
                "AI-powered diagnostic interpretation using pattern analysis.",
            findings: [
                "Feature extraction complete",
                "Pattern match successful",
                "No critical anomalies detected"
            ]
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

        ['xray', 'ct', 'mri'].forEach(type => {
            this.state.scanType = type;
            const result = this.generateMockResult();
            this.state.history.push({
                id: Date.now() + Math.random(),
                date: new Date().toLocaleString(),
                type,
                ...result
            });
        });

        localStorage.setItem('medai_history',
            JSON.stringify(this.state.history));
    },

    async startCamera() {
        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.state.cameraFacing }
            });
            this.dom.video.srcObject = this.state.stream;
            this.setStatus("AI READY");
        } catch {
            this.setStatus("CAMERA OFFLINE");
        }
    },

    stopCamera() {
        if (this.state.stream)
            this.state.stream.getTracks().forEach(t => t.stop());
    }
};

document.addEventListener('DOMContentLoaded', () => DashApp.init());
