(() => {
"use strict";

/**
 * MEDAI ENTERPRISE ENGINE v3.3 (Enhanced Stability + Security)
 * Integrated with MedAI Authentication System
 * 
 * @author MedAI Team
 * @version 3.3.0
 * @license Proprietary
 */

/* ==================== CONFIGURATION ==================== */

class Config {
    static API_BASE = window.ENV_API_BASE || "https://medai-backend-j9i6.onrender.com";
    static ENDPOINT = "/diagnostics/process";
    static AUTH_ENDPOINT = "/auth/me";
    static REQUEST_TIMEOUT = 30000;
    static MAX_RETRIES = 2;
    static MAX_FILE_SIZE = 50 * 1024 * 1024;
    static COOLDOWN_MS = 3000;
    static RETRYABLE_STATUS = [502, 503, 504];
    static MAX_HISTORY_ITEMS = 50;
    
    static FEATURES = {
        ENABLE_TORCH: true,
        ENABLE_ANALYTICS: true,
        ENABLE_COMPRESSION: true,
        ENABLE_VIRTUAL_SCROLL: false,
        ENABLE_OFFLINE_QUEUE: true,
        ENABLE_PERFORMANCE_MONITORING: true
    };
    
    static LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };
    
    static CURRENT_LOG_LEVEL = Config.LOG_LEVELS.INFO;
}

/* ==================== SERVICES ==================== */

class LoggerService {
    constructor() {
        this.currentLevel = Config.CURRENT_LOG_LEVEL;
        this.logQueue = [];
        this.flushInterval = setInterval(() => this.flushLogs(), 30000);
    }
    
    getCurrentUserId() {
        return window.medAIApp?.state?.currentUser?.id || 'anonymous';
    }
    
    log(level, message, data = null) {
        if (level >= this.currentLevel) {
            const entry = {
                timestamp: new Date().toISOString(),
                level: Object.keys(Config.LOG_LEVELS)[level],
                message,
                data: data ? this.sanitizeData(data) : null,
                userId: this.getCurrentUserId(),
                url: window.location.href,
                userAgent: navigator.userAgent
            };
            
            console[Object.keys(Config.LOG_LEVELS)[level].toLowerCase()](entry);
            
            if (Config.FEATURES.ENABLE_OFFLINE_QUEUE) {
                this.logQueue.push(entry);
            }
        }
    }
    
    sanitizeData(data) {
        // Remove sensitive information
        const sanitized = { ...data };
        delete sanitized.token;
        delete sanitized.password;
        delete sanitized.authorization;
        return sanitized;
    }
    
    async flushLogs() {
        if (this.logQueue.length === 0 || !navigator.onLine) return;
        
        const logs = [...this.logQueue];
        this.logQueue = [];
        
        try {
            await fetch(`${Config.API_BASE}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs })
            });
        } catch (error) {
            // Re-queue logs if failed
            this.logQueue.unshift(...logs);
            console.warn('Failed to send logs:', error);
        }
    }
    
    destroy() {
        clearInterval(this.flushInterval);
        this.flushLogs();
    }
}

class AuthService {
    constructor() {
        this.token = null;
        this.user = null;
        this.listeners = [];
        this.csrfToken = this.generateCSRFToken();
    }
    
    generateCSRFToken() {
        const token = crypto.randomUUID ? crypto.randomUUID() : 
            `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('csrf_token', token);
        return token;
    }
    
    getCSRFToken() {
        return sessionStorage.getItem('csrf_token') || this.generateCSRFToken();
    }
    
    async validateToken(token) {
        try {
            const response = await fetch(`${Config.API_BASE}${Config.AUTH_ENDPOINT}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': this.getCSRFToken()
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.token = token;
                this.user = data.user;
                return { valid: true, user: data.user };
            }
            return { valid: false };
        } catch (error) {
            return { valid: false, error };
        }
    }
    
    getToken() {
        return this.token || localStorage.getItem("medai_token") || "";
    }
    
    getUser() {
        return this.user;
    }
    
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem("medai_token");
        localStorage.removeItem("medai_user");
        sessionStorage.removeItem("medai_token");
        sessionStorage.removeItem("medai_user");
        sessionStorage.removeItem("csrf_token");
        
        this.notifyListeners({ authenticated: false, user: null });
        window.location.href = '/login.html';
    }
    
    onAuthChange(listener) {
        this.listeners.push(listener);
    }
    
    notifyListeners(authState) {
        this.listeners.forEach(listener => listener(authState));
    }
    
    sanitizeInput(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

class HistoryService {
    constructor() {
        this.storageKey = 'medai_history';
        this.maxItems = Config.MAX_HISTORY_ITEMS;
    }
    
    save(item) {
        let history = this.load();
        
        const historyItem = {
            ...item,
            id: Date.now().toString(),
            date: new Date().toISOString()
        };
        
        history.unshift(historyItem);
        
        if (history.length > this.maxItems) {
            history = history.slice(0, this.maxItems);
        }
        
        localStorage.setItem(this.storageKey, JSON.stringify(history));
        return historyItem;
    }
    
    load() {
        return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    }
    
    filter(criteria) {
        const history = this.load();
        const searchTerm = criteria.toLowerCase();
        
        return history.filter(item => 
            item.patientId?.toLowerCase().includes(searchTerm) ||
            item.diagnosis?.toLowerCase().includes(searchTerm) ||
            item.scanType?.toLowerCase().includes(searchTerm)
        );
    }
    
    getById(id) {
        const history = this.load();
        return history.find(item => item.id === id);
    }
    
    delete(id) {
        const history = this.load();
        const filtered = history.filter(item => item.id !== id);
        localStorage.setItem(this.storageKey, JSON.stringify(filtered));
        return filtered;
    }
    
    getStats() {
        const history = this.load();
        const total = history.length;
        
        if (total === 0) {
            return { total, averageConfidence: 0, byType: {} };
        }
        
        const sum = history.reduce((acc, item) => acc + (item.confidence || 0), 0);
        const averageConfidence = Math.round(sum / total);
        
        const byType = history.reduce((acc, item) => {
            const type = item.scanType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
        
        return { total, averageConfidence, byType };
    }
}

class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.initNetworkListeners();
    }
    
    initNetworkListeners() {
        window.addEventListener('online', () => this.process());
    }
    
    async add(request) {
        this.queue.push({
            ...request,
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            timestamp: Date.now()
        });
        
        if (navigator.onLine) {
            this.process();
        }
    }
    
    async process() {
        if (this.processing || this.queue.length === 0 || !navigator.onLine) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const request = this.queue.shift();
            try {
                await this.executeRequest(request);
            } catch (error) {
                console.error('Failed to process queued request:', error);
                
                // Re-queue if failed and retry count < 3
                request.retryCount = (request.retryCount || 0) + 1;
                if (request.retryCount < 3) {
                    this.queue.unshift(request);
                }
                break;
            }
        }
        
        this.processing = false;
    }
    
    async executeRequest(request) {
        const response = await fetch(request.url, {
            ...request.options,
            headers: {
                ...request.options?.headers,
                'X-Queue-ID': request.id
            }
        });
        
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response;
    }
    
    getQueueLength() {
        return this.queue.length;
    }
}

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.thresholds = {
            slow: 100,  // ms
            verySlow: 300 // ms
        };
    }
    
    measure(operationName, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        
        this.recordMetric(operationName, duration);
        
        if (duration > this.thresholds.verySlow) {
            console.warn(`⚠️ Very slow operation: ${operationName} took ${duration.toFixed(2)}ms`);
        } else if (duration > this.thresholds.slow) {
            console.info(`📊 Slow operation: ${operationName} took ${duration.toFixed(2)}ms`);
        }
        
        return result;
    }
    
    async measureAsync(operationName, asyncFn) {
        const start = performance.now();
        try {
            const result = await asyncFn();
            const duration = performance.now() - start;
            this.recordMetric(operationName, duration);
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this.recordMetric(operationName, duration, true);
            throw error;
        }
    }
    
    recordMetric(name, duration, isError = false) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        
        const metrics = this.metrics.get(name);
        metrics.push({ duration, timestamp: Date.now(), isError });
        
        // Keep only last 100 measurements
        if (metrics.length > 100) {
            metrics.shift();
        }
    }
    
    getStats(operationName) {
        const metrics = this.metrics.get(operationName) || [];
        if (metrics.length === 0) return null;
        
        const durations = metrics.map(m => m.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const errorRate = metrics.filter(m => m.isError).length / metrics.length;
        
        return { avg, min, max, errorRate, count: metrics.length };
    }
}

/* ==================== MAIN APPLICATION CLASS ==================== */

class MedAIApp {
    
    /**
     * Initialize the application with all required services
     */
    constructor() {
        // Services
        this.logger = new LoggerService();
        this.auth = new AuthService();
        this.history = new HistoryService();
        this.requestQueue = new RequestQueue();
        this.performance = new PerformanceMonitor();
        
        // State
        this.state = {
            isProcessing: false,
            lastRequestTime: 0,
            isOnline: navigator.onLine,
            isAuthenticated: false,
            currentUser: null,
            activeTab: 'scanner',
            scanType: 'xray'
        };
        
        // DOM elements
        this.dom = {};
        
        // Resources
        this.cameraStream = null;
        this.fileInput = null;
        this.eventListeners = [];
        this.timeouts = [];
        this.canvas = null;
        
        // Bind methods
        this.debouncedFilterHistory = this.debounce(this.filterHistory.bind(this), 300);
    }
    
    /* ==================== INITIALIZATION ==================== */
    
    async init() {
        return this.performance.measureAsync('init', async () => {
            this.logger.log(Config.LOG_LEVELS.INFO, 'Initializing MedAI App');
            
            // Check authentication first
            if (!await this.checkAuthentication()) {
                return;
            }
            
            this.cacheDOM();
            this.addAccessibilityAttributes();
            this.setupKeyboardShortcuts();
            this.setupDragAndDrop();
            this.bindEvents();
            this.bindNetworkEvents();
            await this.initCamera();
            this.createFileInput();
            this.injectDisclaimer();
            this.setupAuthListener();
            this.updateUserInfo();
            this.initTabNavigation();
            this.registerServiceWorker();
            
            this.logger.log(Config.LOG_LEVELS.INFO, 'MedAI App initialized successfully');
        });
    }
    
    async checkAuthentication() {
        // Check if MedAI global object exists (from auth.js)
        if (window.MedAI && window.MedAI.isAuthenticated()) {
            this.state.isAuthenticated = true;
            this.state.currentUser = window.MedAI.getUser();
            return true;
        }
        
        // Fallback: check localStorage directly
        const token = localStorage.getItem("medai_token");
        if (token) {
            const result = await this.auth.validateToken(token);
            if (result.valid) {
                this.state.isAuthenticated = true;
                this.state.currentUser = result.user;
                return true;
            }
        }
        
        // Not authenticated, redirect to login
        window.location.href = '/login.html';
        return false;
    }
    
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                this.logger.log(Config.LOG_LEVELS.WARN, 'SW registration failed', { error: err.message });
            });
        }
    }
    
    /* ==================== DOM MANAGEMENT ==================== */
    
    cacheDOM() {
        const $ = id => document.getElementById(id);
        this.dom = {
            // Navigation elements
            navItems: document.querySelectorAll('.nav-item'),
            logoutBtn: document.querySelector('.logout-trigger'),
            
            // Scanner elements
            video: $("camera-stream"),
            captureBtn: $("capture-trigger"),
            uploadLocal: $("upload-local"),
            torchBtn: $("toggle-torch"),
            closeResultsBtn: $("close-results"),
            medBotBtn: $("MedBot-btn"),
            
            // Sections
            scannerSection: $("scanner-section"),
            historySection: $("history-section"),
            analyticsSection: $("analytics-section"),
            
            // Results panel
            resultsPanel: $("results-panel"),
            resultTitle: $("result-title"),
            resultDescription: $("result-description"),
            findingsList: $("findings-list"),
            confidenceText: $("confidence-text"),
            confidencePath: $("confidence-path"),
            
            // Notification
            notification: $("notification"),
            
            // History elements
            historyList: $("history-list"),
            searchInput: document.querySelector('.search-input'),
            
            // Scan type buttons
            scanTypeBtns: document.querySelectorAll('.type-btn'),
            
            // Progress bar
            progressBar: document.querySelector('.upload-progress')
        };
    }
    
    addAccessibilityAttributes() {
        this.dom.captureBtn?.setAttribute('aria-label', 'Capture image');
        this.dom.captureBtn?.setAttribute('role', 'button');
        this.dom.captureBtn?.setAttribute('tabindex', '0');
        
        this.dom.resultsPanel?.setAttribute('role', 'region');
        this.dom.resultsPanel?.setAttribute('aria-live', 'polite');
        this.dom.resultsPanel?.setAttribute('aria-label', 'Analysis results');
        
        this.dom.closeResultsBtn?.setAttribute('aria-label', 'Close results panel');
        
        this.dom.uploadLocal?.setAttribute('aria-label', 'Upload image');
        this.dom.torchBtn?.setAttribute('aria-label', 'Toggle flashlight');
    }
    
    setupKeyboardShortcuts() {
        this.addEventListenerWithTracking(document, 'keydown', (e) => {
            // Ctrl/Cmd + C: Capture
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !this.state.isProcessing) {
                e.preventDefault();
                this.safeCapture();
            }
            
            // Esc: Close results
            if (e.key === 'Escape' && !this.dom.resultsPanel?.classList.contains('hidden')) {
                this.dom.resultsPanel?.classList.add('hidden');
            }
            
            // Alt + 1,2,3: Tab navigation
            if (e.altKey && !isNaN(parseInt(e.key))) {
                const tabIndex = parseInt(e.key) - 1;
                const tabs = ['scanner', 'history', 'analytics'];
                if (tabs[tabIndex]) {
                    this.switchTab(tabs[tabIndex]);
                }
            }
        });
    }
    
    setupDragAndDrop() {
        const dropZone = document.querySelector('.scanner-viewport');
        if (!dropZone) return;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.addEventListenerWithTracking(dropZone, eventName, this.preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            this.addEventListenerWithTracking(dropZone, eventName, () => {
                dropZone.classList.add('highlight');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            this.addEventListenerWithTracking(dropZone, eventName, () => {
                dropZone.classList.remove('highlight');
            });
        });
        
        this.addEventListenerWithTracking(dropZone, 'drop', (e) => {
            e.preventDefault();
            const dt = e.dataTransfer;
            const file = dt.files[0];
            
            if (file) {
                this.processLocalFile(file);
            }
        });
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    addEventListenerWithTracking(element, event, handler, options = {}) {
        if (!element) return;
        this.eventListeners.push({ element, event, handler, options });
        element.addEventListener(event, handler, options);
    }
    
    removeEventListeners() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element?.removeEventListener(event, handler, options);
        });
        this.eventListeners = [];
    }
    
    /* ==================== EVENT BINDING ==================== */
    
    bindEvents() {
        // Capture and upload events
        this.dom.captureBtn?.addEventListener("click", () => this.safeCapture());
        this.dom.uploadLocal?.addEventListener("click", () => this.fileInput?.click());
        
        // Torch toggle (if supported)
        if (Config.FEATURES.ENABLE_TORCH) {
            this.dom.torchBtn?.addEventListener("click", () => this.toggleTorch());
        }
        
        // Close results panel
        this.dom.closeResultsBtn?.addEventListener("click", () => {
            this.dom.resultsPanel?.classList.add("hidden");
        });
        
        // MedBot button
        this.dom.medBotBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            window.open('MedBot.html', '_blank');
        });
        
        // Logout button
        this.dom.logoutBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            this.logout();
        });
        
        // Scan type selection
        this.dom.scanTypeBtns?.forEach(btn => {
            btn.addEventListener("click", (e) => {
                this.dom.scanTypeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.scanType = btn.dataset.type;
            });
        });
        
        // History search with debouncing
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener("input", (e) => {
                this.debouncedFilterHistory(e.target.value);
            });
        }
    }
    
    bindNetworkEvents() {
        this.addEventListenerWithTracking(window, "online", () => {
            this.state.isOnline = true;
            this.updateAIStatus("AI READY", "online");
            this.requestQueue.process();
        });
        
        this.addEventListenerWithTracking(window, "offline", () => {
            this.state.isOnline = false;
            this.updateAIStatus("OFFLINE", "offline");
            this.notify("You are offline. Network required for analysis.", "warning");
        });
    }
    
    setupAuthListener() {
        if (window.MedAI) {
            window.MedAI.onAuthChange(({ authenticated, user }) => {
                this.state.isAuthenticated = authenticated;
                this.state.currentUser = user;
                
                if (!authenticated) {
                    window.location.href = '/login.html';
                } else {
                    this.updateUserInfo();
                }
            });
        }
    }
    
    /* ==================== AUTHENTICATION ==================== */
    
    logout() {
        if (window.MedAI) {
            window.MedAI.logout();
        } else {
            this.auth.logout();
        }
    }
    
    updateUserInfo() {
        const user = this.state.currentUser || (window.MedAI && window.MedAI.getUser());
        
        if (user) {
            const displayNameEl = document.getElementById('display-name');
            if (displayNameEl) {
                displayNameEl.textContent = this.auth.sanitizeInput(user.name || 'Medical Practitioner');
            }
            
            const userRoleEl = document.querySelector('.user-role');
            if (userRoleEl) {
                userRoleEl.textContent = this.formatRole(user.role || 'user');
            }
            
            const avatarEl = document.getElementById('avatar-circle');
            if (avatarEl && user.name) {
                const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                avatarEl.textContent = this.auth.sanitizeInput(initials || 'MD');
            }
        }
    }
    
    formatRole(role) {
        const roles = {
            'user': 'General Practitioner',
            'doctor': 'Radiologist',
            'admin': 'Administrator'
        };
        return roles[role] || role;
    }
    
    updateAIStatus(text, status) {
        const statusEl = document.getElementById('ai-status');
        const container = document.getElementById('ai-status-container');
        
        if (statusEl) statusEl.textContent = text;
        if (container) {
            container.className = `ai-status-badge ${status}`;
        }
    }
    
    /* ==================== TAB NAVIGATION ==================== */
    
    initTabNavigation() {
        this.dom.navItems?.forEach(item => {
            this.addEventListenerWithTracking(item, "click", (e) => {
                e.preventDefault();
                
                if (item.classList.contains('logout-trigger')) return;
                
                const tab = item.dataset.tab;
                this.switchTab(tab);
            });
        });
    }
    
    switchTab(tab) {
        this.dom.navItems?.forEach(item => {
            if (!item.classList.contains('logout-trigger')) {
                item.classList.remove('active');
                if (item.dataset.tab === tab) {
                    item.classList.add('active');
                }
            }
        });
        
        this.dom.scannerSection?.classList.add('hidden');
        this.dom.historySection?.classList.add('hidden');
        this.dom.analyticsSection?.classList.add('hidden');
        
        switch(tab) {
            case 'scanner':
                this.dom.scannerSection?.classList.remove('hidden');
                break;
            case 'history':
                this.dom.historySection?.classList.remove('hidden');
                this.loadHistory();
                break;
            case 'analytics':
                this.dom.analyticsSection?.classList.remove('hidden');
                this.loadAnalytics();
                break;
        }
        
        this.state.activeTab = tab;
    }
    
    /* ==================== SECURITY CORE ==================== */
    
    async fetchSecure(url, options = {}) {
        const token = this.auth.getToken();
        const csrfToken = this.auth.getCSRFToken();

        if (!navigator.onLine && Config.FEATURES.ENABLE_OFFLINE_QUEUE) {
            await this.requestQueue.add({ url, options });
            this.notify("Request queued for when online", "info");
            return null;
        }

        for (let attempt = 0; attempt <= Config.MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT);
            this.timeouts.push(timeout);

            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'Authorization': token ? `Bearer ${token}` : '',
                        'X-CSRF-Token': csrfToken,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    signal: controller.signal,
                    credentials: 'include'
                });

                clearTimeout(timeout);
                this.timeouts = this.timeouts.filter(t => t !== timeout);

                if (response.status === 401) {
                    this.notify("Session expired. Please login again.", "error");
                    setTimeout(() => this.logout(), 2000);
                    throw new Error("Unauthorized");
                }

                if (!response.ok) {
                    if (Config.RETRYABLE_STATUS.includes(response.status) && attempt < Config.MAX_RETRIES) {
                        await this.sleep(1000 * (attempt + 1));
                        continue;
                    }
                    throw new Error(`Server error ${response.status}`);
                }

                return response;

            } catch (err) {
                clearTimeout(timeout);
                this.timeouts = this.timeouts.filter(t => t !== timeout);
                
                if (err.name === 'AbortError') {
                    throw new Error('Request timeout');
                }
                if (attempt >= Config.MAX_RETRIES) throw err;
                await this.sleep(1000 * (attempt + 1));
            }
        }
    }
    
    sanitizeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    validateResponseSchema(data) {
        return (
            data &&
            typeof data === "object" &&
            typeof data.diagnosis === "string" &&
            Array.isArray(data.findings) &&
            typeof data.confidence === "number"
        );
    }
    
    async validateFileSignature(file) {
        try {
            const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());

            if (header[0] === 0xFF && header[1] === 0xD8) return true; // JPEG
            if (header[0] === 0x89 && header[1] === 0x50) return true; // PNG
            if (header[0] === 0x52 && header[1] === 0x49) return true; // WEBP
            if ((header[0] === 0x49 && header[1] === 0x49) ||
                (header[0] === 0x4D && header[1] === 0x4D)) return true; // TIFF

            // DICOM check
            const dicomCheck = new TextDecoder().decode(
                new Uint8Array(await file.slice(128, 132).arrayBuffer())
            );
            return dicomCheck === "DICM";
        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'File signature validation failed', { error: error.message });
            return false;
        }
    }
    
    rateLimitCheck() {
        const now = Date.now();
        if (now - this.state.lastRequestTime < Config.COOLDOWN_MS) {
            this.notify("Please wait before next request.", "warning");
            return false;
        }
        this.state.lastRequestTime = now;
        return true;
    }
    
    /* ==================== IMAGE COMPRESSION ==================== */
    
    async compressImage(file) {
        if (!Config.FEATURES.ENABLE_COMPRESSION || file.size < 1024 * 1024) {
            return file;
        }
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                
                let width = img.width;
                let height = img.height;
                
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1080;
                
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        this.logger.log(Config.LOG_LEVELS.INFO, 'Image compressed', {
                            originalSize: file.size,
                            compressedSize: blob.size,
                            ratio: `${Math.round(blob.size / file.size * 100)}%`
                        });
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to compress image'));
                    }
                }, 'image/jpeg', 0.8);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error('Failed to load image for compression'));
            };
            
            img.src = URL.createObjectURL(file);
        });
    }
    
    /* ==================== TORCH CONTROL ==================== */
    
    async toggleTorch() {
        if (!this.cameraStream) {
            this.notify("Camera not initialized", "error");
            return;
        }

        const track = this.cameraStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.();
        
        if (!capabilities?.torch) {
            this.notify("Torch not supported on this device", "warning");
            return;
        }

        try {
            const currentTorch = track.getConstraints().torch || false;
            await track.applyConstraints({ 
                advanced: [{ torch: !currentTorch }] 
            });
            this.dom.torchBtn.textContent = !currentTorch ? '🔆' : '🔦';
        } catch (err) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Torch toggle failed', { error: err.message });
            this.notify("Could not toggle flash", "error");
        }
    }
    
    /* ==================== ANALYSIS ==================== */
    
    async safeCapture() {
        if (this.state.isProcessing || !this.state.isOnline) return;
        if (!this.rateLimitCheck()) return;

        try {
            this.updateAIStatus("PROCESSING", "processing");
            const blob = await this.captureFrame();
            await this.sendForAnalysis(blob, "capture.jpg");
            this.updateAIStatus("AI READY", "ready");
        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Capture failed', { error: error.message });
            this.updateAIStatus("ERROR", "error");
            this.notify("Capture failed. Please try again.", "error");
        }
    }
    
    async sendForAnalysis(file, filename) {
        if (this.state.isProcessing) return;
        this.setLoading(true);

        try {
            const compressedFile = await this.compressImage(file);
            
            const fd = new FormData();
            fd.append("file", compressedFile, filename);
            
            if (this.state.scanType) {
                fd.append("type", this.state.scanType);
            }

            this.showProgress(30);
            
            const response = await this.performance.measureAsync('analysis', async () => {
                return await this.fetchSecure(
                    `${Config.API_BASE}${Config.ENDPOINT}`,
                    { method: "POST", body: fd }
                );
            });

            if (!response) return; // Queued offline

            this.showProgress(70);

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("Invalid JSON response from server");
            }

            if (!this.validateResponseSchema(data)) {
                throw new Error("Invalid response schema");
            }

            this.showProgress(100);
            setTimeout(() => this.showProgress(0), 500);

            this.displayResults(data);
            
            const historyItem = this.history.save({
                diagnosis: data.diagnosis,
                confidence: data.confidence,
                findings: data.findings,
                scanType: this.state.scanType || 'xray',
                patientId: this.generatePatientId()
            });
            
            this.logger.log(Config.LOG_LEVELS.INFO, 'Analysis completed', { 
                diagnosis: data.diagnosis,
                confidence: data.confidence 
            });

        } catch (err) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Analysis error', { error: err.message });
            this.notify(err.message || "Analysis failed. Please try again.", "error");
            this.showProgress(0);
        } finally {
            this.setLoading(false);
        }
    }
    
    async processLocalFile(file) {
        if (file.size > Config.MAX_FILE_SIZE) {
            this.notify("File too large. Maximum size is 50MB.", "error");
            return;
        }

        if (!(await this.validateFileSignature(file))) {
            this.notify("Unsupported or invalid file format.", "error");
            return;
        }

        await this.sendForAnalysis(file, file.name);
        if (this.fileInput) {
            this.fileInput.value = "";
        }
    }
    
    showProgress(percent) {
        if (!this.dom.progressBar) {
            this.dom.progressBar = document.createElement('div');
            this.dom.progressBar.className = 'upload-progress';
            this.dom.progressBar.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                height: 3px;
                background: linear-gradient(90deg, var(--kenya-green), var(--kenya-teal));
                transition: width 0.3s ease;
                z-index: 1000;
            `;
            document.body.appendChild(this.dom.progressBar);
        }
        
        this.dom.progressBar.style.width = `${percent}%`;
        this.dom.progressBar.style.display = percent > 0 ? 'block' : 'none';
    }
    
    /* ==================== HISTORY MANAGEMENT ==================== */
    
    generatePatientId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let id = 'PT-';
        for (let i = 0; i < 6; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }
    
    async loadHistory() {
        if (!this.dom.historyList) return;
        
        const history = this.history.load();
        
        if (history.length === 0) {
            this.dom.historyList.innerHTML = '<div class="empty-state">No recent scans found. Start by capturing an image.</div>';
            return;
        }
        
        this.renderHistoryList(history);
    }
    
    renderHistoryList(items) {
        if (!this.dom.historyList) return;
        
        if (Config.FEATURES.ENABLE_VIRTUAL_SCROLL && items.length > 50) {
            this.renderVirtualHistory(items);
        } else {
            this.renderFullHistory(items);
        }
    }
    
    renderFullHistory(items) {
        this.dom.historyList.innerHTML = items.map(item => `
            <div class="history-card" data-id="${this.sanitizeHTML(item.id)}">
                <div class="history-header">
                    <span class="history-type">${this.sanitizeHTML(item.scanType?.toUpperCase() || 'UNKNOWN')}</span>
                    <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                </div>
                <div class="history-body">
                    <h4>${this.sanitizeHTML(item.diagnosis || 'No diagnosis')}</h4>
                    <p>Patient: ${this.sanitizeHTML(item.patientId || 'Unknown')}</p>
                    <div class="history-confidence">
                        <div class="confidence-bar" style="width: ${Math.min(100, Math.max(0, item.confidence || 0))}%"></div>
                        <span>${item.confidence || 0}% confidence</span>
                    </div>
                </div>
                <button class="history-view-btn" data-id="${this.sanitizeHTML(item.id)}">View Details</button>
            </div>
        `).join('');
        
        // Add click handlers to view buttons
        this.dom.historyList.querySelectorAll('.history-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                this.viewHistoryItem(id);
            });
        });
    }
    
    renderVirtualHistory(items) {
        // Simplified virtual scroll implementation
        const container = this.dom.historyList;
        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.height = '500px';
        container.style.overflowY = 'auto';
        
        const itemHeight = 120; // Approximate height per item
        const totalHeight = items.length * itemHeight;
        const buffer = 5;
        
        const renderVisibleItems = () => {
            const scrollTop = container.scrollTop;
            const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
            const endIndex = Math.min(items.length, startIndex + Math.ceil(container.clientHeight / itemHeight) + buffer * 2);
            
            let html = '';
            for (let i = startIndex; i < endIndex; i++) {
                const item = items[i];
                html += `
                    <div class="history-card" data-id="${this.sanitizeHTML(item.id)}" style="position: absolute; top: ${i * itemHeight}px; width: 100%;">
                        <div class="history-header">
                            <span class="history-type">${this.sanitizeHTML(item.scanType?.toUpperCase() || 'UNKNOWN')}</span>
                            <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                        </div>
                        <div class="history-body">
                            <h4>${this.sanitizeHTML(item.diagnosis || 'No diagnosis')}</h4>
                            <p>Patient: ${this.sanitizeHTML(item.patientId || 'Unknown')}</p>
                            <div class="history-confidence">
                                <div class="confidence-bar" style="width: ${Math.min(100, Math.max(0, item.confidence || 0))}%"></div>
                                <span>${item.confidence || 0}% confidence</span>
                            </div>
                        </div>
                        <button class="history-view-btn" data-id="${this.sanitizeHTML(item.id)}">View Details</button>
                    </div>
                `;
            }
            
            container.innerHTML = html;
            container.style.height = `${totalHeight}px`;
        };
        
        container.addEventListener('scroll', renderVisibleItems);
        renderVisibleItems();
    }
    
    filterHistory(searchTerm) {
        if (!searchTerm || searchTerm.length < 2) {
            this.loadHistory();
            return;
        }
        
        const filtered = this.history.filter(searchTerm);
        this.renderHistoryList(filtered);
    }
    
    viewHistoryItem(id) {
        const item = this.history.getById(id);
        if (item) {
            this.displayResults(item);
            this.switchTab('scanner');
        }
    }
    
    /* ==================== ANALYTICS ==================== */
    
    async loadAnalytics() {
        if (!Config.FEATURES.ENABLE_ANALYTICS) return;
        
        const analyticsEl = document.querySelector('.analytics-placeholder');
        if (!analyticsEl) return;
        
        const stats = this.history.getStats();
        
        analyticsEl.innerHTML = `
            <div class="analytics-grid">
                <div class="analytics-card">
                    <h3>Total Scans</h3>
                    <p class="stat-large">${stats.total}</p>
                </div>
                <div class="analytics-card">
                    <h3>Avg Confidence</h3>
                    <p class="stat-large">${stats.averageConfidence}%</p>
                </div>
                <div class="analytics-card">
                    <h3>Success Rate</h3>
                    <p class="stat-large">${this.calculateSuccessRate()}%</p>
                </div>
                <div class="analytics-card analytics-card-full">
                    <h3>Scans by Type</h3>
                    <div class="type-chart">
                        ${Object.entries(stats.byType).map(([type, count]) => `
                            <div class="type-stat">
                                <span>${type}:</span>
                                <span>${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    
    calculateSuccessRate() {
        const history = this.history.load();
        if (history.length === 0) return 0;
        
        const highConfidence = history.filter(item => (item.confidence || 0) >= 70).length;
        return Math.round(highConfidence / history.length * 100);
    }
    
    /* ==================== RESULTS DISPLAY ==================== */
    
    displayResults(data) {
        this.dom.resultsPanel?.classList.remove("hidden");

        if (this.dom.resultTitle) {
            this.dom.resultTitle.textContent = this.sanitizeHTML(data.diagnosis || "Analysis Complete");
        }
        
        if (this.dom.resultDescription) {
            this.dom.resultDescription.textContent =
                this.sanitizeHTML(data.description || "AI-assisted interpretation provided. Clinical correlation recommended.");
        }

        this.updateConfidence(data.confidence);

        if (this.dom.findingsList) {
            this.dom.findingsList.innerHTML = "";
            
            if (data.findings && data.findings.length > 0) {
                data.findings.forEach(item => {
                    const li = document.createElement("li");
                    li.className = "finding-item";
                    li.innerHTML = `<span class="finding-bullet">•</span> ${this.sanitizeHTML(String(item))}`;
                    this.dom.findingsList.appendChild(li);
                });
            } else {
                const li = document.createElement("li");
                li.className = "finding-item empty";
                li.textContent = "No specific findings detected";
                this.dom.findingsList.appendChild(li);
            }
        }

        if (window.innerWidth <= 768) {
            this.dom.resultsPanel?.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    updateConfidence(score) {
        const value = Math.max(0, Math.min(100, Number(score) || 0));
        
        if (this.dom.confidenceText) {
            this.dom.confidenceText.textContent = `${value}%`;
        }

        if (this.dom.confidencePath) {
            this.dom.confidencePath.style.strokeDasharray = `${value},100`;
            
            if (value >= 80) {
                this.dom.confidencePath.style.stroke = 'var(--kenya-green)';
            } else if (value >= 60) {
                this.dom.confidencePath.style.stroke = 'var(--warning)';
            } else {
                this.dom.confidencePath.style.stroke = 'var(--kenya-red)';
            }
        }
    }
    
    /* ==================== CAMERA ==================== */
    
    async initCamera() {
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                this.notify("Camera not supported on this device", "error");
                return;
            }

            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };

            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

            if (this.dom.video) {
                this.dom.video.srcObject = this.cameraStream;
                this.dom.video.setAttribute("playsinline", true);
                
                try {
                    await this.dom.video.play();
                } catch (playError) {
                    this.logger.log(Config.LOG_LEVELS.WARN, 'Auto-play failed', { error: playError.message });
                }
                
                this.updateAIStatus("AI READY", "ready");
            }

        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Camera initialization failed', { error: error.message });
            
            let errorMessage = "Camera unavailable.";
            if (error.name === 'NotAllowedError') {
                errorMessage = "Camera access denied. Please grant permission.";
            } else if (error.name === 'NotFoundError') {
                errorMessage = "No camera found on this device.";
            } else if (error.name === 'NotReadableError') {
                errorMessage = "Camera is already in use by another application.";
            }
            
            this.notify(errorMessage, "error");
            this.updateAIStatus("CAMERA ERROR", "error");
        }
    }
    
    captureFrame() {
        return new Promise((resolve, reject) => {
            if (!this.dom.video?.videoWidth) {
                reject(new Error("Video not ready"));
                return;
            }

            const canvas = document.createElement("canvas");
            this.canvas = canvas;
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            ctx.drawImage(this.dom.video, 0, 0);

            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Failed to capture image"));
                }
            }, "image/jpeg", 0.95);
        });
    }
    
    /* ==================== UI HELPERS ==================== */
    
    setLoading(state) {
        this.state.isProcessing = state;
        if (this.dom.captureBtn) {
            this.dom.captureBtn.disabled = state;
            this.dom.captureBtn.classList.toggle('processing', state);
        }
    }
    
    notify(msg, type) {
        if (!this.dom.notification) return;
        
        this.dom.notification.textContent = msg;
        this.dom.notification.className = `notification-toast visible ${type}`;

        const timeout = setTimeout(() => {
            this.dom.notification?.classList.remove("visible");
        }, 4000);
        
        this.timeouts.push(timeout);
    }
    
    injectDisclaimer() {
        if (document.querySelector('.medical-disclaimer')) return;
        
        const disclaimer = document.createElement("div");
        disclaimer.className = "medical-disclaimer";
        disclaimer.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 11px;
            color: var(--text-tertiary);
            background: rgba(255,255,255,0.9);
            padding: 8px;
            z-index: 40;
            backdrop-filter: blur(5px);
            border-top: 1px solid var(--border);
        `;
        disclaimer.textContent =
            "AI-assisted analysis only. Not a medical diagnosis. Always consult with qualified healthcare providers.";
        document.body.appendChild(disclaimer);
    }
    
    sleep(ms) { 
        return new Promise(r => {
            const timeout = setTimeout(r, ms);
            this.timeouts.push(timeout);
        });
    }
    
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    createFileInput() {
        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = "image/*,.dcm,.dicom";
        this.fileInput.multiple = false;
        this.fileInput.style.display = "none";
        document.body.appendChild(this.fileInput);

        this.fileInput.addEventListener("change", e => {
            const file = e.target.files?.[0];
            if (file) {
                this.processLocalFile(file);
            }
        });
    }
    
    async performHealthCheck() {
        const checks = {
            camera: !!this.cameraStream,
            api: await this.checkAPIHealth(),
            storage: this.checkStorage(),
            auth: this.state.isAuthenticated,
            online: this.state.isOnline
        };
        
        const isHealthy = Object.values(checks).every(Boolean);
        
        if (!isHealthy) {
            this.logger.log(Config.LOG_LEVELS.WARN, 'Health check failed', checks);
        }
        
        return { isHealthy, checks };
    }
    
    async checkAPIHealth() {
        try {
            const response = await fetch(`${Config.API_BASE}/health`, { 
                signal: AbortSignal.timeout(5000) 
            });
            return response.ok;
        } catch {
            return false;
        }
    }
    
    checkStorage() {
        try {
            localStorage.setItem('health_check', 'test');
            localStorage.removeItem('health_check');
            return true;
        } catch {
            return false;
        }
    }
    
    // Clean up resources
    destroy() {
        this.logger.log(Config.LOG_LEVELS.INFO, 'Destroying MedAI App');
        
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.cameraStream = null;
        }
        
        this.removeEventListeners();
        
        this.timeouts.forEach(clearTimeout);
        this.timeouts = [];
        
        if (this.canvas) {
            this.canvas.width = 0;
            this.canvas.height = 0;
            this.canvas = null;
        }
        
        if (this.fileInput?.parentNode) {
            this.fileInput.parentNode.removeChild(this.fileInput);
        }
        
        if (this.dom.progressBar?.parentNode) {
            this.dom.progressBar.parentNode.removeChild(this.dom.progressBar);
        }
        
        this.logger.destroy();
        
        Object.keys(this.dom).forEach(key => {
            this.dom[key] = null;
        });
    }
}

/* ==================== GLOBAL EXPORTS ==================== */

// Global function for history view
window.viewHistoryItem = function(id) {
    if (window.medAIApp) {
        window.medAIApp.viewHistoryItem(id);
    }
};

// Global health check
window.checkMedAIHealth = async function() {
    if (window.medAIApp) {
        return await window.medAIApp.performHealthCheck();
    }
    return { isHealthy: false, error: 'App not initialized' };
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    window.medAIApp = new MedAIApp();
    window.medAIApp.init().catch(error => {
        console.error('Failed to initialize MedAI App:', error);
    });
});

// Clean up on page unload
window.addEventListener("beforeunload", () => {
    if (window.medAIApp) {
        window.medAIApp.destroy();
    }
});

})();
