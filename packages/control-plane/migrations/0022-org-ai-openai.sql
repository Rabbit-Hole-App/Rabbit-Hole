-- Third AI provider: any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM,
-- corporate gateways) - covers "connect my local LLM" via a tunnel URL.
ALTER TABLE org_ai ADD COLUMN openai_base_url TEXT;
ALTER TABLE org_ai ADD COLUMN openai_api_key TEXT;
