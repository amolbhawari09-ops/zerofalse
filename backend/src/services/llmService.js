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
 * UPGRADED: "Concise Security Engineer" Prompt
 * Forces 1-2 line explanations and includes 'impact' field.
 */
function buildPrompt(code, filename, language) {
  return `ACT AS A SENIOR CYBERSECURITY AUDITOR. 
Find critical vulnerabilities in the following ${language} code: "${filename}".

STRICT DETECTION RULES:
1. SECRETS: Flag any hardcoded passwords, tokens, or private keys.
2. INJECTION: Flag 'eval()', 'exec()', or unsanitized user inputs in queries/commands.
3. LOGIC: Flag weak crypto or insecure random generators.

RESPONSE REQUIREMENTS:
- You must return ONLY valid JSON.
- For 'description' and 'impact', keep text to 1-2 concise lines maximum.
- If no issues are found, return "findings": [].

JSON STRUCTURE:
{
  "findings": [
    {
      "line": number,
      "severity": "critical" | "high" | "medium" | "low",
      "type": "Vulnerability Category",
      "description": "Short 1-line technical reason why this is dangerous.",
      "impact": "1-line consequence if exploited.",
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
          content: 'You are a ruthless security scanner. You only speak JSON. Be concise and technical.' 
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
        
        // Final normalization: ensure findings is an array
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
