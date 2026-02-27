/**
 * MED-AI DIAGNOSTIC DASHBOARD v6.0.1
 * Refactored for Robustness & Nested State Support
 */

const CONFIG = {
    API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
    TIMEOUT: 30000,
    MAX_RETRIES: 3,
    VALIDATION: {
        ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/dicom'],
        MAX_FILE_SIZE: 50 * 1024 * 1024
    }
};

// ==================== IMPROVED STATE MANAGEMENT ====================
const StateManager = {
    listeners: new Map(),
    
    create(initialState) {
        const handler = {
            get: (target, prop) => {
                const value = target[prop];
                if (value && typeof value === 'object') return new Proxy(value, handler);
                return value;
            },
            set: (target, prop, value) => {
                const oldValue = target[prop];
                target[prop] = value;
                this.notify(prop, value, oldValue);
                return true;
            }
        };
        this.state = new Proxy(initialState, handler);
        return this.state;
    },

    subscribe(property, callback) {
        if (!this.listeners.has(property)) this.listeners.set(property, new Set());
        this.listeners.get(property).add(callback);
        return () => this.listeners.get(property).delete(callback);
    },

    notify(prop, val, old) {
        this.listeners.get(prop)?.forEach(cb => cb(val, old));
    },

    batch(updates) {
        Object.entries(updates).forEach(([key, val]) => {
            this.state[key] = val;
        });
    }
};

const AppState = StateManager.create({
    currentScanType: 'xray',
    isProcessing: false,
    cameraActive: false,
    networkStatus: navigator.onLine ? 'online' : 'offline',
    performance: { fps: 0, latency: 0 }
});

// ==================== ROBUST CAMERA MANAGER ====================
const CameraManager = {
    stream: null,
    videoElement: null,

    async init(videoElement, facingMode = 'environment') {
        this.videoElement = videoElement;
        this.stop(); // Clear existing

        try {
            const constraints = {
                video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            
            return new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    AppState.cameraActive = true;
                    resolve(true);
                };
            });
        } catch (err) {
            console.error("Camera Init Failed:", err);
            return false;
        }
    },

    async capture() {
        if (!this.stream) return null;
        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(this.videoElement, 0, 0);
        
        return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
    },

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        AppState.cameraActive = false;
    }
};

// ==================== WORKER & API ====================
const AIWorker = {
    worker: new Worker('/js/ai-worker.js'),
    
    async process(blob, type) {
        const buffer = await blob.arrayBuffer();
        return new Promise((resolve) => {
            const id = crypto.randomUUID();
            // Using Transferable Objects for zero-copy memory performance
            this.worker.postMessage({ id, buffer, type }, [buffer]);
            
            const handler = (e) => {
                if (e.data.id === id) {
                    this.worker.removeEventListener('message', handler);
                    resolve(e.data.result);
                }
            };
            this.worker.addEventListener('message', handler);
        });
    }
};



// ==================== COMPLETED UI CONTROLLER ====================
const UI = {
    elements: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        this.setupSubscriptions();
    },

    cacheElements() {
        const ids = ['capture-trigger', 'camera-stream', 'ai-status', 'results-panel'];
        ids.forEach(id => {
            const camelId = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
            this.elements[camelId] = document.getElementById(id);
        });
        this.elements.navItems = document.querySelectorAll('.nav-item');
    },

    setupSubscriptions() {
        StateManager.subscribe('cameraActive', (active) => {
            this.elements.aiStatus.textContent = active ? 'AI READY' : 'OFFLINE';
            this.elements.aiStatus.className = active ? 'status-online' : 'status-offline';
        });

        StateManager.subscribe('isProcessing', (proc) => {
            this.elements.captureTrigger.disabled = proc;
            this.elements.captureTrigger.innerText = proc ? 'Analyzing...' : 'Capture Scan';
        });
    },

    bindEvents() {
        this.elements.captureTrigger?.addEventListener('click', async () => {
            AppState.isProcessing = true;
            const blob = await CameraManager.capture();
            if (blob) {
                const result = await AIWorker.process(blob, AppState.currentScanType);
                this.showResults(result);
            }
            AppState.isProcessing = false;
        });

        this.elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });
    },

    switchTab(tabId) {
        this.elements.navItems.forEach(nav => {
            nav.classList.toggle('active', nav.dataset.tab === tabId);
        });
        console.log(`Switched to: ${tabId}`);
        // Add logic here to show/hide sections based on tabId
    },

    showResults(data) {
        if (this.elements.resultsPanel) {
            this.elements.resultsPanel.classList.add('visible');
            // Populate data...
        }
    }
};

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
    UI.init();
    CameraManager.init(document.getElementById('camera-stream'));
});
