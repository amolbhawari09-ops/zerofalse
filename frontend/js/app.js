// =====================================================
// ZERO FALSE - ENTERPRISE CLIENT (v1.2 Patched)
// =====================================================

// 1. CONFIGURATION
const API_URL =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000/api"
        : "https://zerofalse-production-1dca.up.railway.app/api";

console.log("Environment:", API_URL);

// 2. DOM ELEMENTS
const dom = {
    input: document.getElementById("codeInput"),
    lines: document.getElementById("lineNumbers"),
    lang: document.getElementById("languageSelect"),
    result: document.getElementById("scanResult"),
    btn: document.getElementById("scanBtn"),
    stats: {
        scans: document.getElementById("heroTotalScans"),
        vulns: document.getElementById("heroVulnsFound")
    }
};

// 3. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    initEditor();
    fetchStats();
    setInterval(fetchStats, 30000); // Auto-refresh stats
});

function initEditor() {
    if (!dom.input) return;

    const updateLines = () => {
        const lines = dom.input.value.split("\n").length;
        dom.lines.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join("<br>");
    };

    dom.input.addEventListener("scroll", () => {
        dom.lines.scrollTop = dom.input.scrollTop;
    });

    dom.input.addEventListener("input", updateLines);
    updateLines();
}

// 4. CORE LOGIC
async function performScan() {
    const code = dom.input.value.trim();
    
    if (!code) {
        renderError("Please paste some code to analyze.");
        return;
    }

    setLoading(true);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

        const res = await fetch(`${API_URL}/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code,
                language: dom.lang.value,
                filename: `input.${getExtension(dom.lang.value)}`,
                repo: "web-client",
                prNumber: null
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`Server Error (${res.status})`);
        
        const data = await res.json();
        
        // --- FIX 1: DEFENSIVE PARSING ---
        // Handle { scan: null }, { scan: {...} }, or { findings: [...] }
        let scanData = null;

        if (data.scan) {
            scanData = data.scan;
        } else if (data.findings) {
            // Backend returned flat structure
            scanData = data; 
        } else {
            // Backend returned valid JSON but no scan data (e.g. empty queue)
            throw new Error("Analysis completed but returned no data.");
        }

        renderResults(scanData);
        fetchStats(); 

    } catch (err) {
        console.error("Scan Error:", err);
        const msg = err.name === 'AbortError' 
            ? "Request timed out. The server is taking too long." 
            : (err.message || "Analysis failed.");
        renderError(msg);
    } finally {
        setLoading(false);
    }
}

// 5. RENDERING
function renderResults(scan) {
    dom.result.innerHTML = "";
    dom.result.style.display = 'block';

    // Safety check for 'findings' array
    const findings = Array.isArray(scan.findings) ? scan.findings : [];

    if (findings.length === 0) {
        dom.result.innerHTML = `
            <div class="state-empty" style="color: var(--success)">
                <span style="font-size: 24px">✅</span><br><br>
                <strong>No vulnerabilities detected.</strong><br>
                Code appears safe for deployment.
            </div>
        `;
        return;
    }

    const header = document.createElement('div');
    header.className = 'result-header';
    header.textContent = `ANALYSIS REPORT: ${findings.length} ISSUES FOUND`;
    dom.result.appendChild(header);

    findings.forEach(f => {
        // --- FIX 2: SEVERITY NORMALIZATION ---
        // Backend: 'high', 'Medium', 'LOW' -> Standardize to lowercase
        const severity = (f.severity || 'low').toLowerCase();
        
        // Map to CSS classes (.severity-high, .severity-medium, .severity-low)
        let severityClass = 'severity-low';
        if (severity === 'high' || severity === 'critical') severityClass = 'severity-high';
        else if (severity === 'medium') severityClass = 'severity-medium';

        const card = document.createElement('div');
        card.className = 'vulnerability-card';
        card.innerHTML = `
            <div class="vuln-title">
                <div class="severity-badge ${severityClass}"></div>
                <span>${escapeHtml(f.type || "Security Issue")}</span>
            </div>
            <div class="vuln-desc">${escapeHtml(f.description || "No description provided.")}</div>
            ${f.fix ? `<div class="vuln-fix">${escapeHtml(f.fix)}</div>` : ''}
            <div class="meta">
                Line ${f.line || "?"} • Confidence: ${f.confidence || 0}%
            </div>
        `;
        dom.result.appendChild(card);
    });
}

function renderError(msg) {
    dom.result.innerHTML = `
        <div class="state-empty" style="color: var(--error)">
            ⚠️ ${escapeHtml(msg)}
        </div>
    `;
    dom.result.style.display = 'block';
}

function setLoading(isLoading) {
    if (isLoading) {
        dom.btn.disabled = true;
        dom.btn.textContent = "Analyzing...";
        dom.result.innerHTML = `
            <div class="state-empty">
                <span style="display:inline-block; animation: spin 1s linear infinite">⟳</span>
                <br>Running static analysis engine...
            </div>
        `;
        dom.result.style.display = 'block';
    } else {
        dom.btn.disabled = false;
        dom.btn.textContent = "Analyze Code";
    }
}

// 6. UTILITIES
async function fetchStats() {
    try {
        const res = await fetch(`${API_URL}/scan`);
        if (res.ok) {
            const data = await res.json();
            if (data.stats) {
                dom.stats.scans.textContent = formatNumber(data.stats.totalScans);
                dom.stats.vulns.textContent = formatNumber(data.stats.totalFindings);
            }
        }
    } catch (e) { /* Silent fail */ }
}

function getExtension(lang) {
    const map = { javascript: 'js', python: 'py', java: 'java', typescript: 'ts', go: 'go' };
    return map[lang] || 'txt';
}

function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(num || 0);
}

// Expose for HTML
window.performScan = performScan;
