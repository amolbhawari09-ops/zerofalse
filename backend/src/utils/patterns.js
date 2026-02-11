const SECURITY_PATTERNS = {
  sqlInjection: {
    name: 'SQL Injection',
    severity: 'critical',
    patterns: [/SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*['"`]\s*\+/i],
    languages: ['javascript', 'typescript', 'python', 'java']
  },
  hardcodedSecrets: {
    name: 'Hardcoded Secret',
    severity: 'critical',
    patterns: [/['"`]ghp_[a-zA-Z0-9]{36}['"`]/i, /api[_-]?key\s*[:=]\s*['"`][^'"]{8,}['"`]/i],
    languages: ['javascript', 'typescript', 'python', 'yaml', 'json']
  }
};

module.exports = {
  quickPatternScan: (code, language) => {
    const findings = [];
    if (!code) return findings;

    const lines = code.split('\n');
    
    for (const [key, pattern] of Object.entries(SECURITY_PATTERNS)) {
      if (!pattern.languages.includes(language.toLowerCase())) continue;

      lines.forEach((lineText, index) => {
        for (const regex of pattern.patterns) {
          if (regex.test(lineText)) {
            findings.push({
              type: pattern.name,
              severity: pattern.severity,
              line: index + 1,
              pattern: key,
              match: lineText.trim().substring(0, 50),
              confidence: 70
            });
          }
        }
      });
    }
    return findings;
  }
};
