/**
 * MED-AI DASHBOARD CORE v3 (Enhanced & Maintainable)
 * Camera, History, Analytics & Mock AI
 */

// Configuration constants
const CONFIG = {
  STORAGE_KEY: 'medai_history',
  DEBOUNCE_DELAY: 300,
  PROGRESS_INTERVAL: 200,
  MAX_CONFIDENCE: 100,
  MIN_CONFIDENCE: 80,
  SCAN_TYPES: ['xray', 'ct', 'mri', 'ultrasound'],
  TABS: ['scanner', 'history', 'analytics']
};

// Mock data templates
const MOCK_RESULTS = {
  xray: {
    titles: ['Normal Thoracic Scan', 'Mild Pulmonary Opacity'],
    findings: ['Feature extraction complete', 'Pattern match successful', 'No critical anomalies detected']
  },
  ct: {
    titles: ['Clear Cranial View', 'Sinus Inflammation'],
    findings: ['Feature extraction complete', 'Pattern match successful', 'No critical anomalies detected']
  },
  mri: {
    titles: ['Soft Tissue Assessment', 'Ligament Strain'],
    findings: ['Feature extraction complete', 'Pattern match successful', 'No critical anomalies detected']
  },
  ultrasound: {
    titles: ['Abdominal Scan Clear', 'Gallbladder Thickening'],
    findings: ['Feature extraction complete', 'Pattern match successful', 'No critical anomalies detected']
  }
};

class MedAIDashboard {
  #state;
  #dom;
  #boundEvents = new Set();

  constructor() {
    this.#state = this.#initializeState();
    this.#dom = {};
  }

  #initializeState() {
    return {
      activeTab: 'scanner',
      scanType: 'xray',
      isAnalyzing: false,
      cameraFacing: 'environment',
      stream: null,
      history: this.#loadHistory(),
      analytics: this.#initializeAnalytics()
    };
  }

  #initializeAnalytics() {
    return {
      totalScans: 0,
      averageConfidence: 0,
      distribution: CONFIG.SCAN_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {})
    };
  }

  #loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
    }
  }

  #saveHistory() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.#state.history));
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  init() {
    console.log('🚀 Med-AI Dashboard Initializing...');
    this.#cacheDOM();
    this.#bindEvents();
    this.#seedDemoData();
    this.#updateUserSession();
    this.#updateAnalytics();
    this.#renderHistory();
    this.#startCamera().catch(error => this.#handleError('Camera initialization failed', error));
  }

  #cacheDOM() {
    const getElement = (id, required = false) => {
      const element = document.getElementById(id);
      if (required && !element) {
        console.warn(`Required element #${id} not found`);
      }
      return element;
    };

    this.#dom = {
      video: getElement('camera-stream', true),
      captureBtn: getElement('capture-trigger'),
      statusBadge: getElement('ai-status'),
      resultsPanel: getElement('results-panel'),
      sections: {
        scanner: getElement('scanner-section'),
        history: getElement('history-section'),
        analytics: getElement('analytics-section')
      },
      navItems: document.querySelectorAll('.nav-item'),
      typeBtns: document.querySelectorAll('.type-btn'),
      displayName: getElement('display-name'),
      historyList: getElement('history-list'),
      analyticsPlaceholder: document.querySelector('.analytics-placeholder'),
      closeResults: getElement('close-results'),
      searchInput: document.querySelector('.search-input'),
      confidencePath: getElement('confidence-path'),
      confidenceText: getElement('confidence-text'),
      resultTitle: getElement('result-title'),
      resultDescription: getElement('result-description'),
      findingsList: getElement('findings-list')
    };
  }

  #bindEvents() {
    // Navigation
    this.#addEventListeners(this.#dom.navItems, 'click', (btn) => 
      this.#switchTab(btn.dataset.tab));

    // Scan type selection
    this.#addEventListeners(this.#dom.typeBtns, 'click', (btn) => 
      this.#handleScanTypeChange(btn));

    // Capture button
    this.#addEventListener(this.#dom.captureBtn, 'click', () => 
      this.#performAnalysis());

    // Close results
    this.#addEventListener(this.#dom.closeResults, 'click', () => 
      this.#toggleResults(false));

    // Search
    this.#addEventListener(this.#dom.searchInput, 'input', 
      this.#debounce((e) => this.#renderHistory(e.target.value), CONFIG.DEBOUNCE_DELAY));

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => this.#cleanup());
  }

  #addEventListener(element, event, handler) {
    if (!element) return;
    const wrappedHandler = handler.bind(this);
    element.addEventListener(event, wrappedHandler);
    this.#boundEvents.add({ element, event, handler: wrappedHandler });
  }

  #addEventListeners(elements, event, handler) {
    elements.forEach(element => this.#addEventListener(element, event, () => handler(element)));
  }

  #cleanup() {
    this.#stopCamera();
    this.#boundEvents.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.#boundEvents.clear();
  }

  #handleScanTypeChange(selectedBtn) {
    this.#dom.typeBtns.forEach(btn => btn.classList.remove('active'));
    selectedBtn.classList.add('active');
    this.#state.scanType = selectedBtn.dataset.type;
  }

  async #switchTab(tabId) {
    if (this.#state.isAnalyzing || !CONFIG.TABS.includes(tabId)) return;

    // Hide all sections
    Object.values(this.#dom.sections).forEach(section => 
      section?.classList.add('hidden'));
    
    // Show selected section
    this.#dom.sections[tabId]?.classList.remove('hidden');

    // Update navigation
    this.#dom.navItems.forEach(nav => 
      nav.classList.toggle('active', nav.dataset.tab === tabId));

    // Handle camera
    if (tabId === 'scanner') {
      await this.#startCamera();
    } else {
      this.#stopCamera();
    }

    // Render tab-specific content
    if (tabId === 'analytics') {
      this.#renderAnalytics();
    }

    this.#state.activeTab = tabId;
  }

  async #startCamera() {
    try {
      if (this.#state.stream) return;

      const constraints = {
        video: {
          facingMode: this.#state.cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      this.#state.stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (this.#dom.video) {
        this.#dom.video.srcObject = this.#state.stream;
        await this.#dom.video.play();
        this.#setStatus('AI READY');
      }
    } catch (error) {
      this.#handleError('Camera access failed', error);
      this.#setStatus('CAMERA OFFLINE');
    }
  }

  #stopCamera() {
    if (this.#state.stream) {
      this.#state.stream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      this.#state.stream = null;
    }
  }

  async #toggleCamera() {
    this.#stopCamera();
    this.#state.cameraFacing = this.#state.cameraFacing === 'environment' ? 'user' : 'environment';
    await this.#startCamera();
  }

  #captureFrame() {
    if (!this.#dom.video?.videoWidth) return null;

    const canvas = document.createElement('canvas');
    canvas.width = this.#dom.video.videoWidth;
    canvas.height = this.#dom.video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.#dom.video, 0, 0);
    
    return canvas.toDataURL('image/jpeg');
  }

  async #performAnalysis() {
    if (this.#state.isAnalyzing) return;

    this.#state.isAnalyzing = true;
    this.#setStatus('ANALYZING 0%');

    try {
      this.#captureFrame();
      await this.#simulateProgress();
      
      const result = this.#generateMockResult();
      const entry = this.#createHistoryEntry(result);

      this.#state.history.unshift(entry);
      this.#saveHistory();

      this.#renderResults(entry);
      this.#toggleResults(true);
      this.#updateAnalytics();
      this.#renderHistory();
    } catch (error) {
      this.#handleError('Analysis failed', error);
    } finally {
      this.#state.isAnalyzing = false;
      this.#setStatus('AI READY');
    }
  }

  #createHistoryEntry(result) {
    return {
      id: crypto.randomUUID?.() || Date.now() + Math.random(),
      date: new Date().toISOString(),
      type: this.#state.scanType,
      ...result
    };
  }

  #simulateProgress() {
    return new Promise(resolve => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 18;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          resolve();
        }
        this.#setStatus(`ANALYZING ${Math.floor(progress)}%`);
      }, CONFIG.PROGRESS_INTERVAL);
    });
  }

  #setStatus(text) {
    if (this.#dom.statusBadge) {
      this.#dom.statusBadge.textContent = text;
      this.#dom.statusBadge.setAttribute('aria-label', text);
    }
  }

  #renderHistory(filter = '') {
    if (!this.#dom.historyList) return;

    const filtered = this.#state.history.filter(item =>
      item.title?.toLowerCase().includes(filter.toLowerCase()) ||
      item.type?.includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
      this.#dom.historyList.innerHTML = '<div class="empty-state">No scans found.</div>';
      return;
    }

    this.#dom.historyList.innerHTML = filtered.map(item => `
      <div class="history-card" data-id="${item.id}" role="button" tabindex="0">
        <div class="history-info">
          <h4>${this.#escapeHtml(item.title)}</h4>
          <p>${this.#formatDate(item.date)} • ${item.type.toUpperCase()}</p>
        </div>
        <div class="history-conf" aria-label="Confidence: ${item.confidence}%">
          ${item.confidence}%
        </div>
      </div>
    `).join('');

    // Add click handlers
    this.#dom.historyList.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => this.#handleHistoryItemClick(card.dataset.id));
      card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          this.#handleHistoryItemClick(card.dataset.id);
        }
      });
    });
  }

  #handleHistoryItemClick(id) {
    const scan = this.#state.history.find(h => h.id === id);
    if (scan) {
      this.#renderResults(scan);
      this.#toggleResults(true);
      this.#switchTab('scanner');
    }
  }

  #formatDate(isoDate) {
    try {
      return new Date(isoDate).toLocaleString();
    } catch {
      return isoDate;
    }
  }

  #escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  #updateAnalytics() {
    const { history } = this.#state;
    const total = history.length;

    this.#state.analytics.totalScans = total;

    if (total === 0) {
      this.#state.analytics.averageConfidence = 0;
      this.#state.analytics.distribution = CONFIG.SCAN_TYPES.reduce((acc, type) => 
        ({ ...acc, [type]: 0 }), {});
      return;
    }

    // Calculate average confidence
    const sumConf = history.reduce((sum, item) => sum + (item.confidence || 0), 0);
    this.#state.analytics.averageConfidence = Math.round(sumConf / total);

    // Calculate distribution
    this.#state.analytics.distribution = history.reduce((acc, item) => {
      if (acc.hasOwnProperty(item.type)) {
        acc[item.type] = (acc[item.type] || 0) + 1;
      }
      return acc;
    }, { ...this.#state.analytics.distribution });
  }

  #renderAnalytics() {
    if (!this.#dom.analyticsPlaceholder) return;

    const { totalScans, averageConfidence, distribution } = this.#state.analytics;
    const topModality = this.#getTopModality();

    this.#dom.analyticsPlaceholder.innerHTML = `
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
  }

  #getTopModality() {
    const { distribution } = this.#state.analytics;
    if (Object.values(distribution).every(v => v === 0)) return 'N/A';

    return Object.entries(distribution)
      .reduce((max, entry) => entry[1] > max[1] ? entry : max)[0]
      .toUpperCase();
  }

  #toggleResults(show) {
    if (this.#dom.resultsPanel) {
      this.#dom.resultsPanel.classList.toggle('hidden', !show);
      this.#dom.resultsPanel.setAttribute('aria-hidden', !show);
    }
  }

  #renderResults(data) {
    if (!data) return;

    // Update confidence circle
    if (this.#dom.confidencePath) {
      this.#dom.confidencePath.style.strokeDasharray = `${data.confidence}, ${CONFIG.MAX_CONFIDENCE}`;
    }
    
    if (this.#dom.confidenceText) {
      this.#dom.confidenceText.textContent = `${data.confidence}%`;
    }

    // Update text content
    if (this.#dom.resultTitle) {
      this.#dom.resultTitle.textContent = data.title;
    }
    
    if (this.#dom.resultDescription) {
      this.#dom.resultDescription.textContent = data.description;
    }

    // Update findings list
    if (this.#dom.findingsList && Array.isArray(data.findings)) {
      this.#dom.findingsList.innerHTML = data.findings
        .map(finding => `<li>${this.#escapeHtml(finding)}</li>`)
        .join('');
    }
  }

  #generateMockResult() {
    const mockType = MOCK_RESULTS[this.#state.scanType] || MOCK_RESULTS.xray;
    const confidence = Math.floor(CONFIG.MIN_CONFIDENCE + Math.random() * 20);
    const title = mockType.titles[Math.floor(Math.random() * mockType.titles.length)];

    return {
      title,
      confidence,
      description: 'AI-powered diagnostic interpretation using pattern analysis.',
      findings: mockType.findings
    };
  }

  #updateUserSession() {
    if (!window.MedAI?.getUser || !this.#dom.displayName) return;

    try {
      const user = window.MedAI.getUser();
      if (user?.name) {
        const prefix = user.name.toLowerCase().startsWith('dr') ? '' : 'Dr. ';
        this.#dom.displayName.textContent = `${prefix}${user.name}`;
      }
    } catch (error) {
      console.error('Failed to update user session:', error);
    }
  }

  #seedDemoData() {
    if (this.#state.history.length > 0) return;

    const demoData = [];
    ['xray', 'ct', 'mri'].forEach(type => {
      const result = this.#generateMockResult.call({ state: { scanType: type } });
      demoData.push({
        id: crypto.randomUUID?.() || Date.now() + Math.random(),
        date: new Date().toISOString(),
        type,
        ...result
      });
    });

    this.#state.history.push(...demoData);
    this.#saveHistory();
  }

  #debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  #handleError(message, error) {
    console.error(`${message}:`, error);
    
    // Show user-friendly error message
    if (this.#dom.statusBadge) {
      this.#dom.statusBadge.textContent = 'ERROR';
    }
    
    // Could also show a toast notification here
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.medAIDashboard = new MedAIDashboard();
    window.medAIDashboard.init();
  } catch (error) {
    console.error('Failed to initialize Med-AI Dashboard:', error);
  }
});
