import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { NlcaCellRequest, NlcaCellResponse, NlcaOrchestratorConfig, CellState01 } from './types.js';
import { buildCellSystemPrompt, buildCellUserPrompt, parseCellResponse, type PromptConfig } from './prompt.js';
import { CellAgent } from './agentManager.js';

export interface CellDecisionResult {
	state: CellState01;
	confidence?: number;
	latencyMs: number;
	raw: string;
	success: boolean;
	inputTokens?: number;
	outputTokens?: number;
	cost?: number;
}

export interface DebugLogEntry {
	timestamp: number;
	cellId: number;
	x: number;
	y: number;
	generation: number;
	input: string; // User prompt (for backward compatibility)
	fullPrompt: string; // Full prompt including system message
	output: string;
	latencyMs: number;
	success: boolean;
	cost?: number;
}

export interface NlcaCostStats {
	totalCost: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	callCount: number;
}

export class NlcaOrchestrator {
	private llm: ChatOpenAI;
	private cfg: NlcaOrchestratorConfig;
	private callCount = 0;
	private costStats: NlcaCostStats = {
		totalCost: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		callCount: 0
	};
	private debugLog: DebugLogEntry[] = [];
	private maxDebugLogSize = 500; // Keep last 500 entries
	private debugEnabled = true;

	constructor(cfg: NlcaOrchestratorConfig) {
		this.cfg = cfg;
		this.llm = this.createLLM();
		console.log(`[NLCA] Orchestrator initialized with model: ${cfg.model.model}`);
	}

	private createLLM(): ChatOpenAI {
		return new ChatOpenAI({
			apiKey: this.cfg.apiKey,
			model: this.cfg.model.model,
			temperature: this.cfg.model.temperature,
			maxTokens: this.cfg.model.maxOutputTokens,
			timeout: this.cfg.cellTimeoutMs,
			maxRetries: 2,
			configuration: {
				baseURL: 'https://openrouter.ai/api/v1',
				defaultHeaders: {
					'HTTP-Referer': 'http://localhost',
					'X-Title': 'games-of-life-nlca'
				}
			}
		});
	}

	updateConfig(partial: Partial<NlcaOrchestratorConfig>) {
		this.cfg = { ...this.cfg, ...partial };
		if (partial.apiKey || partial.model || partial.cellTimeoutMs) {
			this.llm = this.createLLM();
			console.log(`[NLCA] Orchestrator config updated, model: ${this.cfg.model.model}`);
		}
	}

	/** Get total LLM calls made */
	getCallCount(): number {
		return this.callCount;
	}

	/** Reset call counter and cost stats */
	resetCallCount(): void {
		this.callCount = 0;
		this.costStats = {
			totalCost: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			callCount: 0
		};
	}

	/** Get accumulated cost statistics */
	getCostStats(): NlcaCostStats {
		return { ...this.costStats };
	}

	/** Get debug log entries */
	getDebugLog(): DebugLogEntry[] {
		return [...this.debugLog];
	}

	/** Clear debug log */
	clearDebugLog(): void {
		this.debugLog = [];
	}

	/** Enable/disable debug logging */
	setDebugEnabled(enabled: boolean): void {
		this.debugEnabled = enabled;
	}

	/** Check if debug logging is enabled */
	isDebugEnabled(): boolean {
		return this.debugEnabled;
	}

	/**
	 * Execute a single cell's decision.
	 * Uses the agent's conversation history for context.
	 * @param agent - The cell agent making the decision
	 * @param req - The cell request with context
	 * @param promptConfig - Optional custom prompt configuration
	 */
	async decideCell(agent: CellAgent, req: NlcaCellRequest, promptConfig?: PromptConfig): Promise<CellDecisionResult> {
		this.callCount++;

		// Build system prompt if not already in history
		if (!agent.hasSystemPrompt()) {
			const systemPrompt = buildCellSystemPrompt(
				agent.cellId,
				agent.x,
				agent.y,
				req.width,
				req.height,
				promptConfig
			);
			agent.addMessage({ role: 'system', content: systemPrompt });
		}

		// Build user prompt for this generation
		const userPrompt = buildCellUserPrompt(req);
		agent.addMessage({ role: 'user', content: userPrompt });

		// Build LangChain messages from history
		const messages = agent.getHistory().map((msg) => {
			switch (msg.role) {
				case 'system':
					return new SystemMessage(msg.content);
				case 'user':
					return new HumanMessage(msg.content);
				case 'assistant':
					return new AIMessage(msg.content);
			}
		});

		const t0 = performance.now();
		let raw = '';
		let success = false;
		let state: CellState01 = req.self; // Default: keep current state
		let confidence: number | undefined;
		let inputTokens: number | undefined;
		let outputTokens: number | undefined;
		let cost: number | undefined;

		try {
			const res = await this.llm.invoke(messages);
			raw = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);

			// Extract token usage from response metadata (OpenRouter provides this)
			// Type assertion needed because LangChain types don't include OpenRouter-specific fields
			const responseMetadata = res.response_metadata as Record<string, unknown> | undefined;
			const usageMetadata = res.usage_metadata as Record<string, number> | undefined;
			const usage = (responseMetadata?.usage ?? usageMetadata) as Record<string, number> | undefined;
			
			if (usage) {
				inputTokens = (usage.prompt_tokens ?? usage.input_tokens) as number | undefined;
				outputTokens = (usage.completion_tokens ?? usage.output_tokens) as number | undefined;
				
				// Calculate cost based on typical OpenRouter pricing
				// Most models: ~$0.001-0.01 per 1K tokens
				// Using conservative estimate for gpt-4.1-mini: $0.0001/1K input, $0.0003/1K output
				const inputCost = (inputTokens ?? 0) * 0.0000001; // $0.0001/1K
				const outputCost = (outputTokens ?? 0) * 0.0000003; // $0.0003/1K
				cost = inputCost + outputCost;
				
				// Update cumulative cost stats
				this.costStats.totalInputTokens += inputTokens ?? 0;
				this.costStats.totalOutputTokens += outputTokens ?? 0;
				this.costStats.totalCost += cost;
				this.costStats.callCount++;
			}

			const parsed = parseCellResponse(raw);
			if (parsed) {
				state = parsed.state;
				confidence = parsed.confidence;
				success = true;
			} else {
				console.warn(`[NLCA] Cell ${agent.cellId} (${agent.x},${agent.y}): Failed to parse response: ${raw}`);
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			console.error(`[NLCA] Cell ${agent.cellId} (${agent.x},${agent.y}): LLM error: ${errMsg}`);
			raw = `ERROR: ${errMsg}`;
		}

		const latencyMs = performance.now() - t0;

		// Add assistant response to history
		agent.addMessage({ role: 'assistant', content: raw || `{"state":${state}}` });

		// Add debug log entry if enabled
		if (this.debugEnabled) {
			// Build full prompt string (system + user) for debugging
			const systemPrompt = agent.getHistory().find(m => m.role === 'system')?.content || '';
			const fullPrompt = systemPrompt 
				? `[SYSTEM PROMPT]\n${systemPrompt}\n\n[USER PROMPT]\n${userPrompt}`
				: userPrompt;
			
			const entry: DebugLogEntry = {
				timestamp: Date.now(),
				cellId: agent.cellId,
				x: agent.x,
				y: agent.y,
				generation: req.generation,
				input: userPrompt, // Keep for backward compatibility
				fullPrompt: fullPrompt, // Full prompt with system message
				output: raw,
				latencyMs,
				success,
				cost
			};
			this.debugLog.push(entry);
			
			// Trim log if it exceeds max size
			if (this.debugLog.length > this.maxDebugLogSize) {
				this.debugLog = this.debugLog.slice(-this.maxDebugLogSize);
			}
		}

		return { state, confidence, latencyMs, raw, success, inputTokens, outputTokens, cost };
	}
}


