// Security vulnerability patterns for pre-filtering
const SECURITY_PATTERNS = {
  sqlInjection: {
    name: 'SQL Injection',
    severity: 'critical',
    patterns: [
      /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*['"`]\s*\+/i,
      /INSERT\s+INTO\s+.*\s+VALUES\s*\(.*['"`]\s*\+/i,
      /UPDATE\s+.*\s+SET\s+.*['"`]\s*\+/i,
      /DELETE\s+FROM\s+.*\s+WHERE\s+.*['"`]\s*\+/i,
      /exec\s*\(\s*['"`]\s*.*\s*['"`]\s*\+/i,
      /query\s*\(\s*['"`]\s*.*\s*['"`]\s*\+/i
    ],
    languages: ['javascript', 'typescript', 'python', 'java', 'php', 'ruby', 'go']
  },
  
  xss: {
    name: 'XSS (Cross-Site Scripting)',
    severity: 'high',
    patterns: [
      /innerHTML\s*=\s*.*\+/i,
      /outerHTML\s*=\s*.*\+/i,
      /document\.write\s*\(.*\+/i,
      /eval\s*\(.*\+/i,
      /dangerouslySetInnerHTML/i
    ],
    languages: ['javascript', 'typescript', 'jsx', 'tsx']
  },
  
  hardcodedSecrets: {
    name: 'Hardcoded Secret',
    severity: 'critical',
    patterns: [
      /['"`]sk-[a-zA-Z0-9]{20,}['"`]/i, // OpenAI keys
      /['"`]AKIA[0-9A-Z]{16}['"`]/i, // AWS keys
      /['"`]ghp_[a-zA-Z0-9]{36}['"`]/i, // GitHub tokens
      /['"`]glpat-[a-zA-Z0-9\-]{20}['"`]/i, // GitLab tokens
      /password\s*[:=]\s*['"`][^'"]{8,}['"`]/i,
      /api[_-]?key\s*[:=]\s*['"`][^'"]{8,}['"`]/i,
      /secret\s*[:=]\s*['"`][^'"]{8,}['"`]/i
    ],
    languages: ['javascript', 'typescript', 'python', 'java', 'php', 'ruby', 'go', 'yaml', 'json']
  },
  
  commandInjection: {
    name: 'Command Injection',
    severity: 'critical',
    patterns: [
      /exec\s*\(\s*['"`].*\$\{/i,
      /execSync\s*\(\s*['"`].*\$/i,
      /spawn\s*\(\s*['"`].*\$/i,
      /child_process.*exec/i
    ],
    languages: ['javascript', 'typescript', 'python', 'ruby', 'php']
  },
  
  pathTraversal: {
    name: 'Path Traversal',
    severity: 'high',
    patterns: [
      /fs\.readFile\s*\(\s*.*req\./i,
      /fs\.writeFile\s*\(\s*.*req\./i,
      /res\.sendFile\s*\(\s*.*req\./i,
      /path\.join\s*\(\s*.*req\./i
    ],
    languages: ['javascript', 'typescript', 'python', 'java', 'php']
  },
  
  insecureDeserialization: {
    name: 'Insecure Deserialization',
    severity: 'critical',
    patterns: [
      /JSON\.parse\s*\(\s*.*req\./i,
      /eval\s*\(\s*.*req\./i,
      /new\s+Function\s*\(\s*.*req\./i,
      /deserialize\s*\(\s*.*req\./i
    ],
    languages: ['javascript', 'typescript', 'python', 'java', 'ruby']
  }
};

/**
 * Quick pattern-based scan (before LLM)
 */
function quickPatternScan(code, language) {
  const findings = [];
  
  for (const [key, pattern] of Object.entries(SECURITY_PATTERNS)) {
    if (!pattern.languages.includes(language.toLowerCase())) {
      continue;
    }
    
    for (const regex of pattern.patterns) {
      const matches = code.match(regex);
      if (matches) {
        // Find line number
        const lines = code.substring(0, code.indexOf(matches[0])).split('\n');
        const lineNumber = lines.length;
        
        findings.push({
          type: pattern.name,
          severity: pattern.severity,
          line: lineNumber,
          pattern: key,
          match: matches[0].substring(0, 50) + '...',
          confidence: 70 // Pattern match confidence
        });
      }
    }
  }
  
  return findings;
}

module.exports = { SECURITY_PATTERNS, quickPatternScan };
