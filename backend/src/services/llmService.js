const axios = require('axios');
const { getPrimaryProvider, getProviderConfig } = require('../config/llm');
const logger = require('../utils/logger');

// =====================================================
// HELPERS (Private to this module)
// =====================================================

function isProviderAvailable(provider) {
  const config = getProviderConfig(provider);
  if (!config.enabled) return false;
  
  if (provider === 'groq' && !process.env.GROQ_API_KEY) return false;
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) return false;
  
  // Ollama is disabled by default in production
  if (provider === 'ollama') return false; 
  
  return true;
}

/**
 * UPGRADED: "Enterprise Minimalist" Prompt
 * Forces a 0-10 Risk Score and scannable 1-line findings.
 */
function buildPrompt(code, filename, language) {
  return `ACT AS A SENIOR CYBERSECURITY AUDITOR. 
Audit the following ${language} code in "${filename}" for critical vulnerabilities.

STRICT DETECTION RULES:
1. SECRETS: Flag hardcoded passwords, API keys, or private tokens.
2. INJECTION: Flag 'eval()', 'exec()', or unsanitized user inputs in queries/system commands.
3. LOGIC: Flag weak crypto, insecure random generators, or broken access control.

RESPONSE REQUIREMENTS:
- You must return ONLY valid JSON.
- Provide a global "riskScore" from 0.0 to 10.0 for the entire file based on severity.
- For each finding, provide exactly one concise sentence for "issue" and "fix_instruction".
- If no issues are found, return "findings": [] and "riskScore": 0.0.

JSON STRUCTURE:
{
  "riskScore": number,
  "findings": [
    {
      "line": number,
      "severity": "critical" | "high" | "medium",
      "type": "Vulnerability Name",
      "issue": "1-sentence technical risk description.",
      "fix_instruction": "1-sentence fix action.",
      "confidence": number
    }
  ]
}

CODE TO AUDIT:
\`\`\`${language}
${code}
\`\`\``;
}

// =====================================================
// PROVIDER CALLS (Direct Functions)
// =====================================================

async function callGroq(prompt, config) {
  const response = await axios.post(
    `${config.baseURL}/chat/completions`,
    {
      model: config.model,
      messages: [
        { 
          role: 'system', 
          content: 'You are a ruthless security scanner. You only speak JSON. Be extremely concise and technical.' 
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0 // Zero temperature for consistent security results
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout || 15000
    }
  );
  
  const content = response.data.choices[0].message.content;
  try {
    return JSON.parse(content);
  } catch (e) {
    logger.error("AI returned invalid JSON: " + content);
    throw new Error("AI JSON parsing failed");
  }
}

// =====================================================
// EXPORTED SERVICE
// =====================================================

module.exports = {
  analyzeCode: async (code, filename, language) => {
    const providers = ['groq', 'openai']; 
    
    for (const provider of providers) {
      try {
        if (!isProviderAvailable(provider)) continue;
        
        const config = getProviderConfig(provider);
        logger.info(`🤖 LLM Security Audit: ${provider} analyzing ${filename}`);

        let result;
        if (provider === 'groq') {
          result = await callGroq(buildPrompt(code, filename, language), config);
        } else {
          continue;
        }
        
        // Final normalization: ensure findings is an array and score exists
        return {
          riskScore: result?.riskScore || 0.0,
          findings: Array.isArray(result?.findings) ? result.findings : [],
          provider,
          model: config.model
        };
        
      } catch (error) {
        logger.error(`LLM Provider ${provider} failed: ${error.message}`);
        continue;
      }
    }
    
    logger.warn("⚠️ All LLM providers failed. Returning safe empty state.");
    return { findings: [], riskScore: 0.0, summary: "LLM Scan Skipped", provider: "none" };
  }
};
