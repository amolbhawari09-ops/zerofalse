// API URL configuration
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://zerofalse.vercel.app/api';

// DOM Elements
const codeInput = document.getElementById('codeInput');
const languageSelect = document.getElementById('languageSelect');
const lineNumbers = document.getElementById('lineNumbers');
const scanResult = document.getElementById('scanResult');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateLineNumbers();
    loadStats();
    
    // Event listeners
    codeInput.addEventListener('input', updateLineNumbers);
    codeInput.addEventListener('scroll', syncScroll);
    
    // Auto-refresh stats every 10 seconds
    setInterval(loadStats, 10000);
});

// Update line numbers
function updateLineNumbers() {
    const lines = codeInput.value.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

// Sync scroll between textarea and line numbers
function syncScroll() {
    lineNumbers.scrollTop = codeInput.scrollTop;
}

// Load example code
function loadExample() {
    const examples = {
        javascript: `function getUser(id) {
  // Vulnerable: SQL Injection
  const query = "SELECT * FROM users WHERE id = " + id;
  return db.query(query);
}

function processPayment(token) {
  // Vulnerable: Hardcoded secret
  const API_KEY = "sk-live-1234567890abcdef";
  return stripe.charges.create({ amount: 100, source: token });
}`,
        python: `def get_user(user_id):
    # Vulnerable: SQL Injection
    query = f"SELECT * FROM users WHERE id = {user_id}"
    cursor.execute(query)
    return cursor.fetchone()

def process_data(data):
    # Vulnerable: Command Injection
    import os
    os.system(f"echo {data}")`,
        java: `public User getUser(String id) {
    // Vulnerable: SQL Injection
    String query = "SELECT * FROM users WHERE id = " + id;
    return jdbcTemplate.queryForObject(query, User.class);
}`
    };
    
    const lang = languageSelect.value;
    codeInput.value = examples[lang] || examples.javascript;
    updateLineNumbers();
    
    // Animate the change
    codeInput.style.opacity = '0.5';
    setTimeout(() => codeInput.style.opacity = '1', 200);
}

// Perform scan
async function performScan() {
    const code = codeInput.value.trim();
    const language = languageSelect.value;
    
    if (!code) {
        showError('Please enter some code to scan');
        return;
    }
    
    const btn = document.getElementById('scanBtn');
    const originalText = btn.innerHTML;
    
    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="loading">⏳</span> Scanning...';
    scanResult.classList.remove('hidden');
    scanResult.innerHTML = '<div class="loading" style="text-align: center; padding: 2rem;">🔍 Analyzing code for vulnerabilities...</div>';
    
    try {
        const response = await fetch(`${API_URL}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                filename: `example.${getExtension(language)}`,
                language,
                repo: 'demo',
                prNumber: 1
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const scan = await response.json();
        displayResults(scan);
        
        // Refresh stats
        loadStats();
        
    } catch (error) {
        console.error('Scan error:', error);
        scanResult.innerHTML = `
            <div class="vulnerability-card critical">
                <h4>⚠️ Scan Failed</h4>
                <p>${error.message}</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Please try again or contact support.</p>
            </div>
        `;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Display scan results
function displayResults(scan) {
    if (scan.error) {
        showError(`Scan error: ${scan.error}`);
        return;
    }
    
    if (!scan.findings || scan.findings.length === 0) {
        scanResult.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
                <h3 style="color: var(--color-success); margin-bottom: 0.5rem;">No vulnerabilities found!</h3>
                <p style="color: var(--color-text-secondary);">Your code looks secure. Great job!</p>
                <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-top: 1rem;">
                    Scanned by ${scan.llmProvider || 'AI'} • ${scan.scanDuration}ms
                </p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--color-danger); margin-bottom: 0.5rem;">
                ⚠️ Found ${scan.findings.length} issue${scan.findings.length !== 1 ? 's' : ''}
            </h3>
            <p style="color: var(--color-text-secondary); font-size: 0.875rem;">
                Scanned by ${scan.llmProvider || 'AI'} • ${scan.scanDuration}ms
            </p>
        </div>
    `;
    
    scan.findings.forEach((finding, index) => {
        const severityClass = finding.severity || 'medium';
        html += `
            <div class="vulnerability-card ${severityClass}">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <span class="severity-badge ${severityClass}">${finding.severity}</span>
                    <span style="font-weight: 600;">${finding.type}</span>
                </div>
                <p style="color: var(--color-text-secondary); margin-bottom: 0.75rem;">
                    ${finding.description}
                </p>
                <div style="background: var(--color-bg); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.75rem;">
                    <code style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-primary);">
                        ${escapeHtml(finding.fix || 'No fix suggested')}
                    </code>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.875rem; color: var(--color-text-muted);">
                        Line ${finding.line} • Confidence: ${finding.confidence}%
                    </span>
                    ${!scan.userFeedback ? `
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-sm" onclick="submitFeedback('${scan.id}', true)" style="background: rgba(16, 185, 129, 0.2); color: var(--color-success);">
                                ✅ Real
                            </button>
                            <button class="btn btn-sm" onclick="submitFeedback('${scan.id}', false)" style="background: rgba(239, 68, 68, 0.2); color: var(--color-danger);">
                                ❌ False
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    scanResult.innerHTML = html;
}

// Submit feedback
async function submitFeedback(scanId, isReal) {
    try {
        await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scanId, isReal, comment: '' })
        });
        
        showToast(isReal ? '✅ Marked as real vulnerability' : '❌ Marked as false positive');
        loadStats();
        
    } catch (error) {
        console.error('Feedback error:', error);
    }
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/scan`);
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (data.stats) {
            animateNumber('heroTotalScans', data.stats.totalScans);
            animateNumber('heroVulnsFound', data.stats.totalVulns);
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// Animate number
function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    
    const duration = 1000;
    const start = performance.now();
    
    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(current + (target - current) * ease);
        
        el.textContent = value.toLocaleString();
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Show error
function showError(message) {
    scanResult.classList.remove('hidden');
    scanResult.innerHTML = `
        <div class="vulnerability-card critical">
            <h4>⚠️ Error</h4>
            <p>${message}</p>
        </div>
    `;
}

// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: var(--color-bg-card);
        color: var(--color-text);
        padding: 1rem 1.5rem;
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-border);
        box-shadow: var(--shadow-lg);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Utility functions
function getExtension(language) {
    const map = {
        javascript: 'js',
        typescript: 'ts',
        python: 'py',
        java: 'java',
        go: 'go',
        ruby: 'rb',
        php: 'php'
    };
    return map[language] || 'js';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
