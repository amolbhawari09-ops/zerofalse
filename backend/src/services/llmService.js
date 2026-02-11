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

function buildPrompt(code, filename, language) {
  return `Analyze this ${language} code file "${filename}" for security vulnerabilities.
Focus on SQL Injection, XSS, Hardcoded secrets, Command injection, and Path traversal.

Respond in this exact JSON format:
{
  "findings": [
    {
      "line": 15,
      "severity": "critical",
      "type": "SQL Injection",
      "description": "...",
      "fix": "...",
      "confidence": 95
    }
  ]
}

Code to analyze:
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
        { role: 'system', content: 'You are an expert security engineer. Respond ONLY with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout || 15000
    }
  );
  
  return JSON.parse(response.data.choices[0].message.content);
}

// =====================================================
// EXPORTED SERVICE
// =====================================================

module.exports = {
  analyzeCode: async (code, filename, language) => {
    const providers = ['groq', 'openai']; // Priority list
    
    for (const provider of providers) {
      try {
        if (!isProviderAvailable(provider)) continue;
        
        const config = getProviderConfig(provider);
        logger.info(`LLM Request: ${provider} analyzing ${filename}`);

        let result;
        if (provider === 'groq') {
          result = await callGroq(buildPrompt(code, filename, language), config);
        } else {
          // Add other provider logic here if needed
          continue;
        }
        
        return {
          ...result,
          provider,
          model: config.model
        };
        
      } catch (error) {
        logger.error(`LLM Provider ${provider} failed: ${error.message}`);
        // Continue to next provider in loop
        continue;
      }
    }
    
    // Final Fallback: Return empty findings instead of throwing a hard error
    // This prevents the whole server from crashing and rebooting.
    logger.warn("⚠️ All LLM providers failed or are unavailable. Skipping deep scan.");
    return { findings: [], summary: "LLM Scan Skipped", provider: "none" };
  }
};
