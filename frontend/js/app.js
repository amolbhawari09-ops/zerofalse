// ==========================================
// ZeroFalse Frontend → Backend Connector
// Production-ready version
// ==========================================

// API URL Configuration
const API_URL =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api'
        : 'https://zerofalse-production.up.railway.app/api';

console.log("API URL:", API_URL);

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

// ==========================================
// Initialize App
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    console.log("ZeroFalse frontend initialized");

    loadStats();
    loadScans();

    // Auto refresh every 10 seconds
    setInterval(() => {
        loadStats();
        loadScans();
    }, 10000);

});

// Event listener
scanBtn.addEventListener('click', performScan);


// ==========================================
// Perform Scan
// ==========================================
async function performScan() {

    const code = codeInput.value.trim();
    const language = languageSelect.value;

    if (!code) {
        showError('Please enter some code to scan');
        return;
    }

    scanBtn.disabled = true;
    scanBtn.innerHTML = '⏳ Scanning...';

    scanResult.innerHTML =
        '<div class="loading">Analyzing code...</div>';

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
            throw new Error(`Server error ${response.status}`);
        }

        const scan = await response.json();

        displayScanResult(scan);

        loadStats();
        loadScans();

    }
    catch (error) {

        console.error(error);

        showError("Scan failed: " + error.message);

    }
    finally {

        scanBtn.disabled = false;
        scanBtn.innerHTML = '🔍 Scan for Vulnerabilities';

    }

}


// ==========================================
// Display Scan Result
// ==========================================
function displayScanResult(scan) {

    if (!scan.findings || scan.findings.length === 0) {

        scanResult.innerHTML = `
            <div class="success-message">
                ✅ No vulnerabilities found
            </div>
            <div style="opacity:0.7;">
                ${scan.llmProvider || 'AI'} • ${scan.scanDuration || 0} ms
            </div>
        `;

        return;
    }


    const html = scan.findings.map(f => `

        <div class="vulnerability ${f.severity}">

            <div>
                <strong>${f.type}</strong>
                (Line ${f.line})
            </div>

            <div>
                ${escapeHtml(f.description)}
            </div>

            <div>
                Fix: ${escapeHtml(f.fix)}
            </div>

            <div>
                Confidence: ${f.confidence}%
            </div>

        </div>

    `).join('');


    scanResult.innerHTML = `
        <div>
            Found ${scan.findings.length} vulnerabilities
        </div>
        ${html}
    `;

}


// ==========================================
// Load Stats
// ==========================================
async function loadStats() {

    try {

        const response = await fetch(`${API_URL}/scan`);

        if (!response.ok) return;

        const data = await response.json();

        if (!data.stats) return;

        animateNumber(accuracyEl, data.stats.accuracy);
        animateNumber(totalScansEl, data.stats.totalScans);
        animateNumber(totalVulnsEl, data.stats.totalVulns);
        animateNumber(falsePositivesEl, data.stats.falsePositivesPrevented);

    }
    catch (e) {

        console.error("Stats error:", e);

    }

}


// ==========================================
// Load Scan History
// ==========================================
async function loadScans() {

    try {

        const response =
            await fetch(`${API_URL}/scan?limit=10`);

        if (!response.ok) return;

        const data = await response.json();

        renderScans(data.scans || []);

    }
    catch (e) {

        scansList.innerHTML =
            "Failed to load scans";

    }

}


// ==========================================
// Render Scan List
// ==========================================
function renderScans(scans) {

    if (scans.length === 0) {

        scansList.innerHTML =
            "No scans yet";

        return;
    }


    scansList.innerHTML =
        scans.map(scan => `

        <div class="scan-item">

            <strong>${scan.repo}</strong>

            <div>
                ${scan.filename}
            </div>

            <div>
                ${scan.findings?.length || 0} findings
            </div>

        </div>

    `).join('');

}


// ==========================================
// Helpers
// ==========================================
function showError(message) {

    scanResult.innerHTML =
        `<div class="vulnerability critical">
            ${escapeHtml(message)}
        </div>`;

}


function escapeHtml(text) {

    const div = document.createElement('div');

    div.textContent = text;

    return div.innerHTML;

}


function getExtension(language) {

    const map = {
        javascript: 'js',
        python: 'py',
        java: 'java',
        php: 'php',
        go: 'go'
    };

    return map[language] || 'txt';

}


function animateNumber(el, target) {

    if (!el) return;

    el.textContent = target;

}