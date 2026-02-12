/**
 * UPGRADED: Standardized Security Patterns
 * Uses strict naming conventions to match the LLM Taxonomy and prevent duplicates.
 */
const SECURITY_PATTERNS = {
  dangerousFunctions: {
    // Standardized name for RCE/Injection group
    name: 'RCE', 
    severity: 'critical',
    // Catches eval(), exec(), Function(), and setTimeout with strings
    patterns: [
      /\beval\s*\(/, 
      /\bexec\s*\(/, 
      /\bFunction\s*\(/, 
      /setTimeout\s*\(\s*['"`]/
    ],
    languages: ['javascript', 'typescript']
  },
  hardcodedSecrets: {
    // Standardized name for Secrets group
    name: 'SECRET', 
    severity: 'critical',
    patterns: [
      // Catches: password, secret, token, apikey, access_key
      /(password|secret|token|apikey|access_key|private_key)\s*[:=]\s*['"`][^'"]{4,}['"`]/i,
      // Catches common provider prefixes: ghp_ (GitHub), sk_ (Stripe), etc.
      /['"`](ghp_|sk_live_|key-)[a-zA-Z0-9]{20,}/i
    ],
    languages: ['javascript', 'typescript', 'python', 'yaml', 'json']
  },
  sqlInjection: {
    // Standardized name for SQL group
    name: 'SQL_INJECTION', 
    severity: 'high',
    // Catches concatenation or template literals in SQL-like strings
    patterns: [
      /(SELECT|INSERT|UPDATE|DELETE|DROP).*\+.*\s*['"`]/i,
      /(SELECT|INSERT|UPDATE|DELETE|DROP).*?\$\{.*?}/i 
    ],
    languages: ['javascript', 'typescript', 'python']
  }
};

module.exports = {
  quickPatternScan: (code, language) => {
    const findings = [];
    if (!code) return findings;

    const lines = code.split('\n');
    const langKey = language.toLowerCase();
    
    for (const [key, pattern] of Object.entries(SECURITY_PATTERNS)) {
      // 1. Language Guard
      if (!pattern.languages.includes(langKey)) continue;

      lines.forEach((lineText, index) => {
        for (const regex of pattern.patterns) {
          if (regex.test(lineText)) {
            findings.push({
              type: pattern.name, // Now returns "RCE", "SECRET", or "SQL_INJECTION"
              severity: pattern.severity,
              line: index + 1,
              filename: "", 
              description: `Pattern match: ${pattern.name} detected.`,
              fix: "Verify user input sanitization or use environment variables for sensitive data.",
              confidence: 80
            });
            // Once a line matches a specific pattern type, move to next line 
            // to avoid multiple regexes flagging the same line twice.
            break; 
          }
        }
      });
    }
    return findings;
  }
};
