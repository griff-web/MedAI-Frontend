/**
 * MED-AI DASHBOARD CORE v2.0 (Demo Edition)
 * Fully Interactive Demonstration Build
 */

const DashApp = {

    VERSION: "2.0.0-DEMO",

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

    /* ========================= INIT ========================= */

    init() {
        console.log(`🚀 MedAI Dashboard v${this.VERSION} Initializing...`);
        this.cacheDOM();
        this.bindEvents();
        this.seedDemoData();
        this.updateUserSession();
        this.updateAnalytics();
        this.renderHistory();
        this.startCamera();

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.stopCamera();
        });

        window.addEventListener("beforeunload", () => this.stopCamera());

        setTimeout(() => {
            document.getElementById('loading-overlay')?.classList.add('hidden');
        }, 800);
    },

    /* ========================= DOM ========================= */

    cacheDOM() {
        this.dom = {
            video: document.getElementById('camera-stream'),
            captureBtn: document.getElementById('capture-trigger'),
            statusBadge: document.getElementById('ai-status'),
            resultsPanel: document.getElementById('results-panel'),
            historyList: document.getElementById('history-list'),
            analyticsPlaceholder: document.querySelector('.analytics-placeholder'),
            displayName: document.getElementById('display-name'),
            navItems: document.querySelectorAll('.nav-item'),
            typeBtns: document.querySelectorAll('.type-btn'),
            sections: {
                scanner: document.getElementById('scanner-section'),
                history: document.getElementById('history-section'),
                analytics: document.getElementById('analytics-section')
            }
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

        document.getElementById('close-results')?.addEventListener('click', () => this.toggleResults(false));
        document.getElementById('switch-camera')?.addEventListener('click', () => this.toggleCamera());
        document.getElementById('clear-history')?.addEventListener('click', () => this.clearHistory());
        document.getElementById('export-history')?.addEventListener('click', () => this.exportHistory());

        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input',
                this.debounce((e) => this.renderHistory(e.target.value), 300)
            );
        }
    },

    /* ========================= USER ========================= */

    updateUserSession() {
        if (!window.MedAI?.getUser) return;
        const user = window.MedAI.getUser();
        if (user && this.dom.displayName) {
            const prefix = user.name.toLowerCase().startsWith('dr') ? '' : 'Dr. ';
            this.dom.displayName.textContent = `${prefix}${user.name}`;
        }
    },

    /* ========================= STATUS ========================= */

    setStatus(text) {
        if (this.dom.statusBadge) {
            this.dom.statusBadge.textContent = text;
        }
    },

    /* ========================= CAMERA ========================= */

    async startCamera() {
        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.state.cameraFacing }
            });
            this.dom.video.srcObject = this.state.stream;
            this.setStatus("AI READY");
        } catch (err) {
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
        this.state.cameraFacing =
            this.state.cameraFacing === 'environment' ? 'user' : 'environment';
        this.startCamera();
    },

    captureFrame() {
        const canvas = document.createElement('canvas');
        const video = this.dom.video;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        return canvas.toDataURL('image/jpeg');
    },

    /* ========================= ANALYSIS ========================= */

    async performAnalysis() {

        if (this.state.isAnalyzing) return;

        this.state.isAnalyzing = true;
        this.setStatus("ANALYZING 0%");

        this.captureFrame(); // demo realism

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
        this.updateAnalytics();
        this.renderHistory();
        this.toggleResults(true);

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

    /* ========================= HISTORY ========================= */

    renderHistory(filter = "") {

        if (!this.dom.historyList) return;

        const filtered = this.state.history.filter(item =>
            item.title.toLowerCase().includes(filter.toLowerCase()) ||
            item.type.includes(filter.toLowerCase())
        );

        this.dom.historyList.innerHTML = "";

        if (filtered.length === 0) {
            this.dom.historyList.textContent = "No scans found.";
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = "history-card";
            card.dataset.id = item.id;

            const title = document.createElement('h4');
            title.textContent = item.title;

            const meta = document.createElement('p');
            meta.textContent = `${item.date} • ${item.type.toUpperCase()}`;

            const conf = document.createElement('div');
            conf.className = "history-conf";
            conf.textContent = `${item.confidence}%`;

            card.append(title, meta, conf);

            card.addEventListener('click', () => {
                this.renderResults(item);
                this.toggleResults(true);
                this.switchTab('scanner');
            });

            this.dom.historyList.appendChild(card);
        });
    },

    clearHistory() {
        if (!confirm("Clear all scan history?")) return;
        this.state.history = [];
        localStorage.removeItem('medai_history');
        this.updateAnalytics();
        this.renderHistory();
    },

    exportHistory() {
        const blob = new Blob(
            [JSON.stringify(this.state.history, null, 2)],
            { type: "application/json" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "medai-history.json";
        a.click();
        URL.revokeObjectURL(url);
    },

    /* ========================= ANALYTICS ========================= */

    updateAnalytics() {

        const hist = this.state.history;
        const total = hist.length;

        this.state.analytics.totalScans = total;

        if (total === 0) {
            this.state.analytics.averageConfidence = 0;
            this.state.analytics.distribution =
                { xray: 0, ct: 0, mri: 0, ultrasound: 0 };
            return;
        }

        const sum = hist.reduce((a, b) => a + b.confidence, 0);

        this.state.analytics.averageConfidence = Math.round(sum / total);

        this.state.analytics.distribution =
            hist.reduce((acc, curr) => {
                acc[curr.type]++;
                return acc;
            }, { xray: 0, ct: 0, mri: 0, ultrasound: 0 });
    },

    renderAnalytics() {

        const { totalScans, averageConfidence, distribution } =
            this.state.analytics;

        const top = totalScans === 0 ? "N/A" : this.getTopModality();

        this.dom.analyticsPlaceholder.innerHTML = `
            <div class="stat-card">
                <h3>Total Scans</h3>
                <p>${totalScans}</p>
            </div>
            <div class="stat-card">
                <h3>Avg Confidence</h3>
                <p>${averageConfidence}%</p>
            </div>
            <div class="stat-card">
                <h3>Top Modality</h3>
                <p>${top}</p>
            </div>
        `;
    },

    getTopModality() {
        const dist = this.state.analytics.distribution;
        return Object.keys(dist)
            .reduce((a, b) => dist[a] > dist[b] ? a : b)
            .toUpperCase();
    },

    /* ========================= RESULTS ========================= */

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
        document.getElementById('scan-time').textContent =
            new Date().toLocaleString();
    },

    /* ========================= MOCK AI ========================= */

    generateMockResult() {

        const randomConfidence =
            Math.floor(80 + Math.random() * 20);

        const db = {
            xray: [
                "Normal Thoracic Scan",
                "Mild Pulmonary Opacity",
                "Possible Rib Fracture"
            ],
            ct: [
                "Clear Cranial View",
                "Minor Sinus Inflammation"
            ],
            mri: [
                "Soft Tissue Assessment",
                "Ligament Strain Detected"
            ],
            ultrasound: [
                "Abdominal Fluid Check",
                "Gallbladder Wall Thickening"
            ]
        };

        const titles = db[this.state.scanType];
        const title =
            titles[Math.floor(Math.random() * titles.length)];

        return {
            title,
            confidence: randomConfidence,
            description:
                "AI-powered diagnostic interpretation using pattern recognition and anomaly detection.",
            findings: [
                "Automated feature extraction complete",
                "Pattern correlation successful",
                "No critical abnormalities flagged"
            ]
        };
    },

    /* ========================= UTIL ========================= */

    debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    seedDemoData() {
        if (this.state.history.length > 0) return;

        const types = ['xray', 'ct', 'mri'];

        types.forEach(type => {
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
    }

};

/* ========================= START ========================= */

document.addEventListener('DOMContentLoaded',
    () => DashApp.init());
