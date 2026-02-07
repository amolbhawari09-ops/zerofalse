// Multi-LLM configuration - NOT dependent on OpenAI
const LLM_CONFIG = {
  // PRIMARY: Groq (FREE, fast, no OpenAI dependency)
  groq: {
    enabled: true,
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    maxTokens: 4000,
    temperature: 0.1,
    timeout: 15000
  },
  
  // FALLBACK 1: Local Ollama (100% free, private)
  ollama: {
    enabled: false, // Enable if running locally
    name: 'Ollama',
    baseURL: 'http://localhost:11434',
    model: 'codellama:7b-code',
    maxTokens: 4000,
    temperature: 0.1
  },
  
  // FALLBACK 2: OpenAI (optional, paid)
  openai: {
    enabled: false,
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: 0.1
  }
};

function getPrimaryProvider() {
  if (LLM_CONFIG.groq.enabled && process.env.GROQ_API_KEY) {
    return 'groq';
  }
  if (LLM_CONFIG.ollama.enabled) {
    return 'ollama';
  }
  if (LLM_CONFIG.openai.enabled && process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  throw new Error('No LLM provider configured');
}

function getProviderConfig(provider) {
  return LLM_CONFIG[provider];
}

module.exports = { LLM_CONFIG, getPrimaryProvider, getProviderConfig };
