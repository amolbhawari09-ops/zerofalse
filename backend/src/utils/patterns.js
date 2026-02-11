/**
 * UPGRADED: Professional Security Patterns
 * Tuned to eliminate False Negatives for common test cases.
 */
const SECURITY_PATTERNS = {
  dangerousFunctions: {
    name: 'Remote Code Execution (RCE)',
    severity: 'critical',
    // Catches eval(), exec(), Function(), and setTimeout with strings
    patterns: [/\beval\s*\(/, /\bexec\s*\(/, /\bFunction\s*\(/, /setTimeout\s*\(\s*['"`]/],
    languages: ['javascript', 'typescript']
  },
  hardcodedSecrets: {
    name: 'Hardcoded Secret',
    severity: 'critical',
    patterns: [
      // Catches: password, secret, token, apikey, access_key
      /(password|secret|token|apikey|access_key|private_key)\s*[:=]\s*['"`][^'"]{4,}['"`]/i,
      // Catches: ghp_ (GitHub), sk_ (Stripe), etc.
      /['"`](ghp_|sk_live_|key-)[a-zA-Z0-9]{20,}/i
    ],
    languages: ['javascript', 'typescript', 'python', 'yaml', 'json']
  },
  sqlInjection: {
    name: 'SQL Injection Risk',
    severity: 'high',
    // Catches concatenation in SQL strings
    patterns: [
      /(SELECT|INSERT|UPDATE|DELETE|DROP).*\+.*\s*['"`]/i,
      /(SELECT|INSERT|UPDATE|DELETE|DROP).*?\$\{.*?}/i // Template literals
    ],
    languages: ['javascript', 'typescript', 'python']
  }
};

module.exports = {
  quickPatternScan: (code, language) => {
    const findings = [];
    if (!code) return findings;

    const lines = code.split('\n');
    
    for (const [key, pattern] of Object.entries(SECURITY_PATTERNS)) {
      // Ensure language match
      if (!pattern.languages.includes(language.toLowerCase())) continue;

      lines.forEach((lineText, index) => {
        for (const regex of pattern.patterns) {
          if (regex.test(lineText)) {
            findings.push({
              type: pattern.name,
              severity: pattern.severity,
              line: index + 1,
              filename: "", // Will be populated by ScannerService
              description: `Found potential ${pattern.name} vulnerability.`,
              fix: "Use environment variables or parameterized queries to avoid this risk.",
              confidence: 85
            });
          }
        }
      });
    }
    return findings;
  }
};
