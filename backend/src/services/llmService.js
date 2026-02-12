const axios = require('axios');
const { getPrimaryProvider, getProviderConfig } = require('../config/llm');
const logger = require('../utils/logger');

// =====================================================
// HELPERS
// =====================================================

function isProviderAvailable(provider) {
  const config = getProviderConfig(provider);
  if (!config.enabled) return false;
  
  if (provider === 'groq' && !process.env.GROQ_API_KEY) return false;
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) return false;
  
  if (provider === 'ollama') return false; 
  
  return true;
}

/**
 * 🎯 THE SYNCED PROMPT
 * Forces the AI to use a strict naming convention that matches patterns.js
 */
function buildPrompt(code, filename, language) {
  return `ACT AS A SENIOR SECURITY AUDITOR. 
Audit this ${language} code for critical vulnerabilities.

STRICT TAXONOMY (You must use these exact strings for "type"):
1. "RCE": For eval, exec, code injection, or command execution.
2. "SQL_INJECTION": For unsanitized database queries.
3. "SECRET": For hardcoded passwords, tokens, or keys.
4. "LOGIC": For weak crypto or broken access control.

RESPONSE REQUIREMENTS:
- Return ONLY valid JSON.
- Global "riskScore" (0.0 - 10.0).
- "findings": An array of objects.
- Keep "issue" and "fix_instruction" to exactly one technical sentence.

JSON STRUCTURE:
{
  "riskScore": number,
  "findings": [
    {
      "line": number,
      "severity": "critical" | "high" | "medium",
      "type": "RCE" | "SQL_INJECTION" | "SECRET" | "LOGIC",
      "issue": "string",
      "fix_instruction": "string"
    }
  ]
}

CODE TO AUDIT:
\`\`\`${language}
${code}
\`\`\``;
}

// =====================================================
// PROVIDER CALLS
// =====================================================

async function callGroq(prompt, config) {
  const response = await axios.post(
    `${config.baseURL}/chat/completions`,
    {
      model: config.model,
      messages: [
        { 
          role: 'system', 
          content: 'You are a technical security JSON generator. No prose. No conversational text. Use the provided taxonomy.' 
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0 // Crucial for consistency
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
  
  const content = response.data.choices[0].message.content;
  try {
    return JSON.parse(content);
  } catch (e) {
    logger.error("AI returned invalid JSON");
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
        logger.info(`🤖 LLM Audit: ${provider} analyzing ${filename}`);

        let result;
        if (provider === 'groq') {
          result = await callGroq(buildPrompt(code, filename, language), config);
        } else {
          continue; 
        }
        
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
    
    return { findings: [], riskScore: 0.0, provider: "none" };
  }
};
