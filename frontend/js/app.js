// API URL - change for production
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

// DOM Elements
const codeInput = document.getElementById('codeInput');
const languageSelect = document.getElementById('languageSelect');
const scanBtn = document.getElementById('scanBtn');
const scanResult = document.getElementById('scanResult');
const scansList = document.getElementById('scansList');
const accuracyEl = document.getElementById('accuracy');
const totalScansEl = document.getElementById('totalScans');
const totalVulnsEl = document.getElementById('totalVulns');
const falsePositivesEl = document.getElementById('falsePositives');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadScans();
    
    // Auto-refresh every 10 seconds
    setInterval(() => {
        loadStats();
        loadScans();
    }, 10000);
});

// Event Listeners
scanBtn.addEventListener('click', performScan);

// Functions
async function performScan() {
    const code = codeInput.value.trim();
    const language = languageSelect.value;
    
    if (!code) {
        showError('Please enter some code to scan');
        return;
    }
    
    // Show loading
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<span class="btn-icon">⏳</span> Scanning...';
    scanResult.innerHTML = '<div class="loading">Analyzing code for vulnerabilities...</div>';
    
    try {
        const response = await fetch(`${API_URL}/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code,
                filename: `test.${getExtension(language)}`,
                language,
                repo: 'manual-test',
                prNumber: 1
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const scan = await response.json();
        displayScanResult(scan);
        
        // Refresh stats and scans list
        loadStats();
        loadScans();
        
    } catch (error) {
        console.error('Scan error:', error);
        showError(`Scan failed: ${error.message}`);
    } finally {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<span class="btn-icon">🔍</span> Scan for Vulnerabilities';
    }
}

function displayScanResult(scan) {
    if (scan.error) {
        showError(`Scan error: ${scan.error}`);
        return;
    }
    
    if (!scan.findings || scan.findings.length === 0) {
        scanResult.innerHTML = `
            <div class="success-message">
                ✅ No vulnerabilities found! Your code looks secure.
            </div>
            <div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                Scanned by ${scan.llmProvider || 'AI'} • ${scan.scanDuration}ms
            </div>
        `;
        return;
    }
    
    const findingsHtml = scan.findings.map((finding, index) => `
        <div class="vulnerability ${finding.severity}">
            <span class="severity ${finding.severity}">${finding.severity}</span>
            <div class="vuln-type">${finding.type}</div>
            <div class="vuln-line">Line ${finding.line}</div>
            <div class="vuln-desc">${finding.description}</div>
            <div class="vuln-fix">${escapeHtml(finding.fix)}</div>
            <div class="vuln-confidence">
                Confidence: <span class="confidence-value">${finding.confidence}%</span>
                ${finding.learned ? '• <span style="color: var(--accent-yellow);">Pattern learned from feedback</span>' : ''}
            </div>
            
            ${!scan.userFeedback ? `
                <div class="feedback-buttons">
                    <button class="feedback-btn real" onclick="submitFeedback('${scan.id}', true)">
                        ✅ Real Bug
                    </button>
                    <button class="feedback-btn false" onclick="submitFeedback('${scan.id}', false)">
                        ❌ False Positive
                    </button>
                </div>
            ` : `
                <div class="feedback-given ${scan.userFeedback.isReal ? 'real' : 'false'}">
                    ${scan.userFeedback.isReal ? '✅ Confirmed as real vulnerability' : '❌ Marked as false positive'}
                </div>
            `}
        </div>
    `).join('');
    
    scanResult.innerHTML = `
        <div style="margin-bottom: 1rem; color: var(--text-secondary);">
            Found ${scan.findings.length} potential issue${scan.findings.length !== 1 ? 's' : ''} 
            • Scanned by ${scan.llmProvider || 'AI'} (${scan.llmModel || 'unknown'})
            • ${scan.scanDuration}ms
        </div>
        ${findingsHtml}
    `;
}

async function submitFeedback(scanId, isReal) {
    try {
        const response = await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scanId,
                isReal,
                comment: ''
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit feedback');
        }
        
        // Refresh to show updated feedback
        loadScans();
        
        // Show confirmation
        const message = isReal 
            ? 'Thank you for confirming this vulnerability'
            : 'Thank you for the feedback. We will learn from this pattern.';
        
        // Temporary notification
        const notification = document.createElement('div');
        notification.className = 'success-message';
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '1000';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
        
    } catch (error) {
        console.error('Feedback error:', error);
        alert('Failed to submit feedback. Please try again.');
    }
}

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/scan`);
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (data.stats) {
            animateNumber(accuracyEl, data.stats.accuracy.toFixed(1));
            animateNumber(totalScansEl, data.stats.totalScans);
            animateNumber(totalVulnsEl, data.stats.totalVulns);
            animateNumber(falsePositivesEl, data.stats.falsePositivesPrevented);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadScans() {
    try {
        const response = await fetch(`${API_URL}/scan?limit=10`);
        if (!response.ok) return;
        
        const data = await response.json();
        renderScans(data.scans || []);
    } catch (error) {
        console.error('Failed to load scans:', error);
        scansList.innerHTML = '<div class="no-scans">Failed to load scans</div>';
    }
}

function renderScans(scans) {
    if (!scans || scans.length === 0) {
        scansList.innerHTML = '<div class="no-scans">No scans yet. Try scanning some code above!</div>';
        return;
    }
    
    scansList.innerHTML = scans.map(scan => `
        <div class="scan-item">
            <div class="scan-header">
                <div>
                    <div class="scan-title">${scan.repo}</div>
                    <div class="scan-meta">
                        ${scan.filename} • ${new Date(scan.timestamp).toLocaleString()}
                    </div>
                </div>
                <span class="scan-status ${scan.status}">
                    ${scan.status === 'completed' ? '✓ Completed' : '✗ Failed'}
                </span>
            </div>
            <div style="margin-top: 0.5rem; color: var(--text-secondary);">
                ${scan.findings?.length || 0} findings
                ${scan.llmProvider ? `• ${scan.llmProvider}` : ''}
                ${scan.userFeedback 
                    ? `• ${scan.userFeedback.isReal ? '✅ Confirmed real' : '❌ False positive'}`
                    : '• Awaiting feedback'
                }
            </div>
        </div>
    `).join('');
}

function showError(message) {
    scanResult.innerHTML = `<div class="vulnerability critical">${escapeHtml(message)}</div>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getExtension(language) {
    const extensions = {
        javascript: 'js',
        typescript: 'ts',
        python: 'py',
        java: 'java',
        php: 'php',
        ruby: 'rb',
        go: 'go'
    };
    return extensions[language] || 'txt';
}

function animateNumber(element, target) {
    const current = parseFloat(element.textContent) || 0;
    const targetNum = parseFloat(target);
    
    if (isNaN(targetNum)) {
        element.textContent = target;
        return;
    }
    
    const duration = 500;
    const start = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        const value = current + (targetNum - current) * easeProgress;
        element.textContent = Number.isInteger(targetNum) ? Math.round(value) : value.toFixed(1);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}
