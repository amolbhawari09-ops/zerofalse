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
 * UPGRADED: High-Intensity Security Prompt
 * Specifically tuned to eliminate False Negatives
 */
function buildPrompt(code, filename, language) {
  return `ACT AS A SENIOR CYBERSECURITY AUDITOR.
Your mission is to find vulnerabilities in the following ${language} code for the file "${filename}".

STRICT DETECTION RULES:
1. SECRETS: Flag ANY hardcoded string that looks like a password, API key, or secret token.
2. INJECTION: Flag 'eval()', 'exec()', 'Function()', or any unsanitized input used in DB queries or system commands.
3. LOGIC: Flag weak cryptography or insecure random number generators.



RESPONSE REQUIREMENTS:
- You must return ONLY valid JSON.
- If no issues are found, return "findings": [].
- For every finding, provide a production-ready 'fix' string.

JSON STRUCTURE:
{
  "findings": [
    {
      "line": number,
      "severity": "critical" | "high" | "medium" | "low",
      "type": "Vulnerability Category",
      "description": "Short explanation of the risk",
      "fix": "Corrected code snippet",
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
          content: 'You are a ruthless security scanner. You only speak JSON. Your goal is to find risks that others miss.' 
        },
        { role: 'user', content: prompt }
      ],
      // Force JSON mode to prevent "filter is not a function" errors
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
        
        // Final check to ensure findings exists as an array
        return {
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
    return { findings: [], summary: "LLM Scan Skipped", provider: "none" };
  }
};
