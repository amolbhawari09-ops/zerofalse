const axios = require('axios');
const { getPrimaryProvider, getProviderConfig } = require('../config/llm');
const logger = require('../utils/logger');

class LLMService {
  constructor() {
    this.provider = getPrimaryProvider();
    this.config = getProviderConfig(this.provider);
  }
  
  /**
   * Main analysis method - tries primary, falls back to others
   */
  async analyzeCode(code, filename, language) {
    const providers = ['groq', 'ollama', 'openai'];
    
    for (const provider of providers) {
      try {
        if (!this.isProviderAvailable(provider)) continue;
        
        logger.info(`Trying LLM provider: ${provider}`, { filename });
        const result = await this.callProvider(provider, code, filename, language);
        
        logger.info(`Successfully used ${provider}`, { 
          filename,
          findingsCount: result.findings?.length || 0 
        });
        
        return {
          ...result,
          provider,
          model: getProviderConfig(provider).model
        };
        
      } catch (error) {
        logger.error(`${provider} failed:`, { error: error.message });
        continue;
      }
    }
    
    throw new Error('All LLM providers failed');
  }
  
  isProviderAvailable(provider) {
    const config = getProviderConfig(provider);
    if (!config.enabled) return false;
    
    if (provider === 'groq' && !process.env.GROQ_API_KEY) return false;
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) return false;
    if (provider === 'ollama') {
      // Check if ollama is running
      return false; // Disabled by default
    }
    
    return true;
  }
  
  async callProvider(provider, code, filename, language) {
    const config = getProviderConfig(provider);
    const prompt = this.buildPrompt(code, filename, language);
    
    if (provider === 'groq') {
      return this.callGroq(prompt);
    } else if (provider === 'openai') {
      return this.callOpenAI(prompt);
    } else if (provider === 'ollama') {
      return this.callOllama(prompt);
    }
    
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  async callGroq(prompt) {
    const response = await axios.post(
      `${this.config.baseURL}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert security engineer. Analyze code for vulnerabilities. Respond ONLY with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout
      }
    );
    
    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  }
  
  async callOpenAI(prompt) {
    const response = await axios.post(
      `${this.config.baseURL}/chat/completions`,
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert security engineer. Analyze code for vulnerabilities. Respond ONLY with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  }
  
  async callOllama(prompt) {
    const response = await axios.post(
      `${this.config.baseURL}/api/generate`,
      {
        model: 'codellama:7b-code',
        prompt: prompt,
        format: 'json',
        stream: false
      },
      {
        timeout: 30000
      }
    );
    
    return JSON.parse(response.data.response);
  }
  
  buildPrompt(code, filename, language) {
    return `Analyze this ${language} code file "${filename}" for security vulnerabilities.

Focus on:
1. SQL Injection (string concatenation in SQL queries)
2. XSS (unescaped user input in HTML/JS)
3. Hardcoded secrets (API keys, passwords, tokens)
4. Command injection (unsanitized exec/eval)
5. Path traversal (user input in file paths)
6. Insecure deserialization
7. Missing authentication/authorization

For each vulnerability found, provide:
- line: exact line number
- severity: critical/high/medium/low
- type: vulnerability category
- description: detailed explanation of the risk
- fix: specific code fix with corrected code
- confidence: 0-100

Code to analyze:
\`\`\`${language}
${code}
\`\`\`

Respond in this exact JSON format:
{
  "findings": [
    {
      "line": 15,
      "severity": "critical",
      "type": "SQL Injection",
      "description": "User input directly concatenated into SQL query allows attackers to execute arbitrary SQL commands",
      "fix": "Use parameterized query: db.query('SELECT * FROM users WHERE id = ?', [userId])",
      "confidence": 95
    }
  ],
  "summary": "Found 1 critical vulnerability",
  "recommendations": ["Use parameterized queries", "Validate all inputs"]
}`;
  }
}

module.exports = new LLMService();
