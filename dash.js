/**
 * MEDAI ENTERPRISE ENGINE v3.4.1 (Optimized)
 * High-performance medical imaging interface with robust state management.
 */
(() => {
    "use strict";

    /* ==================== 1. CONSTANTS & CONFIG ==================== */
    const CONFIG = {
        API: {
            BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            AUTH: window.ENV_AUTH_API_BASE || "https://m-backend-n2pd.onrender.com",
            TIMEOUT: 30000,
            RETRIES: 2
        },
        STORAGE_KEYS: {
            HISTORY: 'medai_history',
            TOKEN: 'medai_token',
            CSRF: 'csrf_token'
        },
        COMPRESSION: {
            ENABLED: true,
            QUALITY: 0.8,
            MAX_DIM: 1920
        },
        LOG_LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
    };

    /* ==================== 2. UTILITY CORE ==================== */
    const Utils = {
        id: (prefix = 'id') => `${prefix}_${crypto.randomUUID().split('-')[0]}`,
        
        sanitize: (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        debounce: (fn, delay) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), delay);
            };
        },

        async sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

        getDeviceInfo: () => ({
            ua: navigator.userAgent,
            online: navigator.onLine,
            screen: `${window.innerWidth}x${window.innerHeight}`
        })
    };

    /* ==================== 3. SERVICES ==================== */

    class Logger {
        constructor() {
            this.queue = [];
            this.level = window.location.hostname.includes('localhost') ? 0 : 1;
        }

        log(level, msg, data = null) {
            if (level < this.level) return;
            
            const entry = {
                id: Utils.id('log'),
                timestamp: new Date().toISOString(),
                level: Object.keys(CONFIG.LOG_LEVELS)[level],
                msg,
                data: this._maskSensitive(data),
                device: Utils.getDeviceInfo()
            };

            const styles = ['color:gray', 'color:blue', 'color:orange', 'color:red;font-weight:bold'];
            console.log(`%c[${entry.level}] ${msg}`, styles[level], data || '');
            
            this.queue.push(entry);
            if (this.queue.length > 50) this.flush();
        }

        _maskSensitive(data) {
            if (!data) return null;
            const sensitive = ['token', 'password', 'secret', 'auth'];
            const copy = JSON.parse(JSON.stringify(data));
            const mask = (obj) => {
                for (let key in obj) {
                    if (sensitive.some(s => key.toLowerCase().includes(s))) obj[key] = '****';
                    else if (typeof obj[key] === 'object') mask(obj[key]);
                }
            };
            mask(copy);
            return copy;
        }

        async flush() {
            if (!navigator.onLine || !this.queue.length) return;
            const logs = [...this.queue];
            this.queue = [];
            try {
                await fetch(`${CONFIG.API.BASE}/logs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logs)
                });
            } catch (e) {
                this.queue.push(...logs);
            }
        }
    }

    class HistoryService {
        constructor() {
            this.key = CONFIG.STORAGE_KEYS.HISTORY;
        }

        save(item) {
            const history = this.getAll();
            const entry = { ...item, id: Utils.id('hist'), date: new Date().toISOString() };
            history.unshift(entry);
            localStorage.setItem(this.key, JSON.stringify(history.slice(0, 50)));
            return entry;
        }

        getAll() {
            try {
                return JSON.parse(localStorage.getItem(this.key)) || [];
            } catch { return []; }
        }

        clear() { localStorage.removeItem(this.key); }
    }

    /* ==================== 4. MAIN APPLICATION ==================== */

    class MedAIApp {
        constructor() {
            this.logger = new Logger();
            this.history = new HistoryService();
            this.state = {
                isProcessing: false,
                stream: null,
                activeTab: 'scanner'
            };
            this.dom = {};
        }

        async init() {
            this.logger.log(CONFIG.LOG_LEVELS.INFO, "System Bootstrapping...");
            this._cacheDOM();
            this._bindEvents();
            await this.initCamera();
            this._setupNetworkListeners();
            this.logger.log(CONFIG.LOG_LEVELS.INFO, "MedAI Engine Ready.");
        }

        _cacheDOM() {
            const $ = (id) => document.getElementById(id);
            this.dom = {
                video: $("camera-stream"),
                captureBtn: $("capture-trigger"),
                results: $("results-panel"),
                status: $("ai-status"),
                historyList: $("history-list"),
                navItems: document.querySelectorAll('.nav-item'),
                sections: {
                    scanner: $("scanner-section"),
                    history: $("history-section")
                }
            };
        }

        _bindEvents() {
            this.dom.captureBtn?.addEventListener('click', () => this.handleCapture());
            
            this.dom.navItems.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tab = e.currentTarget.dataset.tab;
                    this.switchTab(tab);
                });
            });

            // Keyboard shortcuts
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.dom.results?.classList.add('hidden');
            });
        }

        async initCamera() {
            try {
                if (this.state.stream) {
                    this.state.stream.getTracks().forEach(t => t.stop());
                }

                this.state.stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 } },
                    audio: false
                });

                if (this.dom.video) {
                    this.dom.video.srcObject = this.state.stream;
                    await this.dom.video.play();
                }
            } catch (err) {
                this.logger.log(CONFIG.LOG_LEVELS.ERROR, "Camera Init Failed", err);
                this.notify("Camera Access Denied", "error");
            }
        }

        async handleCapture() {
            if (this.state.isProcessing) return;
            
            this.state.isProcessing = true;
            this._setLoading(true);

            try {
                const blob = await this._getFrameAsBlob();
                const result = await this._uploadAnalysis(blob);
                
                this.history.save({
                    type: 'Scan',
                    confidence: result.confidence,
                    diagnosis: result.label
                });

                this._displayResults(result);
            } catch (err) {
                this.logger.log(CONFIG.LOG_LEVELS.ERROR, "Capture Failed", err);
                this.notify("Analysis Failed. Please try again.", "error");
            } finally {
                this.state.isProcessing = false;
                this._setLoading(false);
            }
        }

        async _getFrameAsBlob() {
            const canvas = document.createElement('canvas');
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;
            canvas.getContext('2d').drawImage(this.dom.video, 0, 0);
            
            return new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', CONFIG.COMPRESSION.QUALITY);
            });
        }

        async _uploadAnalysis(blob) {
            const formData = new FormData();
            formData.append('file', blob, 'scan.jpg');

            const response = await fetch(`${CONFIG.API.BASE}/diagnostics/process`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN)}`
                },
                body: formData
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            return await response.json();
        }

        switchTab(tabName) {
            this.state.activeTab = tabName;
            
            // Toggle Section Visibility
            Object.entries(this.dom.sections).forEach(([key, el]) => {
                if (el) el.classList.toggle('hidden', key !== tabName);
            });

            // Update Nav UI
            this.dom.navItems.forEach(item => {
                item.classList.toggle('active', item.dataset.tab === tabName);
            });

            if (tabName === 'history') this.renderHistory();
        }

        renderHistory() {
            if (!this.dom.historyList) return;
            const items = this.history.getAll();
            
            this.dom.historyList.innerHTML = items.length ? items.map(item => `
                <div class="history-card">
                    <div class="info">
                        <strong>${Utils.sanitize(item.diagnosis)}</strong>
                        <span>${new Date(item.date).toLocaleDateString()}</span>
                    </div>
                    <div class="score">${item.confidence}%</div>
                </div>
            `).join('') : '<p class="empty-state">No history found</p>';
        }

        _setLoading(isLoading) {
            if (this.dom.status) {
                this.dom.status.textContent = isLoading ? "Analyzing..." : "AI Ready";
                this.dom.status.parentElement.classList.toggle('analyzing', isLoading);
            }
            if (this.dom.captureBtn) this.dom.captureBtn.disabled = isLoading;
        }

        notify(msg, type = 'info') {
            const note = document.getElementById('notification');
            if (!note) return;
            note.textContent = msg;
            note.className = `notification show ${type}`;
            setTimeout(() => note.classList.remove('show'), 4000);
        }

        _setupNetworkListeners() {
            window.addEventListener('online', () => this.notify("Back Online", "success"));
            window.addEventListener('offline', () => this.notify("Working Offline", "warn"));
        }

        _displayResults(data) {
            if (!this.dom.results) return;
            this.dom.results.classList.remove('hidden');
            // Logic to populate the results panel fields would go here
        }
    }

    // Initialize the singleton instance
    window.medAIApp = new MedAIApp();
    document.addEventListener('DOMContentLoaded', () => window.medAIApp.init());

})();
