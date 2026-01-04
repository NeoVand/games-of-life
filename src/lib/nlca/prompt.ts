import type { NlcaCellRequest, NlcaCellResponse, CellState01 } from './types.js';

/**
 * Prompt strategy for NLCA (Neural-Linguistic Cellular Automata):
 * 
 * Each cell is a binary agent that outputs ONLY 0 or 1:
 * - 1 = ON (active/alive)
 * - 0 = OFF (inactive/dead)
 * 
 * The task and coordination rules are customizable via the prompt config store.
 * System placeholders (cell position, grid size) are filled automatically.
 */

/**
 * Configuration for building cell prompts
 */
export interface PromptConfig {
	/** The task description (what cells should accomplish) */
	taskDescription: string;
	/** Whether to use a custom template */
	useAdvancedMode: boolean;
	/** Custom template with placeholders (advanced mode only) */
	advancedTemplate?: string;
}

// Default task description (forms a filled square in the center)
const DEFAULT_TASK = `Form a filled square in the center of the grid.

Rules:
1. If your x coordinate is between 3 and 7 (inclusive) AND your y coordinate is between 3 and 7 (inclusive) → output 1
2. Otherwise → output 0
3. Your previous state does not matter - only your position determines your state`;

// Default template - provides full context about cellular automata
const DEFAULT_TEMPLATE = `You are an autonomous cell agent in a cellular automaton simulation.

== YOUR IDENTITY ==
Position: ({{CELL_X}}, {{CELL_Y}}) on a {{GRID_WIDTH}}×{{GRID_HEIGHT}} grid
Coordinate system: x increases rightward (0 to {{MAX_X}}), y increases downward (0 to {{MAX_Y}})

== CELLULAR AUTOMATA CONTEXT ==
You are one of {{GRID_WIDTH}}×{{GRID_HEIGHT}} cells operating in parallel.
Each generation, every cell simultaneously decides its next state based on:
- Its position on the grid
- Its current state (0=dead/off, 1=alive/on)
- The states of neighboring cells

This is a synchronous update: all cells read the current state, then all cells update at once.

== YOUR TASK ==
{{TASK}}

== INPUT FORMAT (provided each generation) ==
You will receive a JSON object with:
- "generation": Current time step (0, 1, 2, ...)
- "state": Your current state (0 or 1)
- "neighbors": Count of alive neighbors (0-8 for Moore neighborhood)
- "neighborhood": Array of [dx, dy, state] for each neighbor
  - dx, dy: relative offset from your position (e.g., [-1, -1] is top-left)
  - state: that neighbor's current state (0 or 1)

== OUTPUT FORMAT ==
Respond with ONLY: {"state":0} or {"state":1}
No explanation. No other text.`;

/**
 * Replace all placeholders in a template string
 */
function replacePlaceholders(
	template: string,
	x: number,
	y: number,
	width: number,
	height: number,
	task: string
): string {
	return template
		.replace(/\{\{CELL_X\}\}/g, String(x))
		.replace(/\{\{CELL_Y\}\}/g, String(y))
		.replace(/\{\{GRID_WIDTH\}\}/g, String(width))
		.replace(/\{\{GRID_HEIGHT\}\}/g, String(height))
		.replace(/\{\{MAX_X\}\}/g, String(width - 1))
		.replace(/\{\{MAX_Y\}\}/g, String(height - 1))
		.replace(/\{\{TASK\}\}/g, task);
}

/**
 * Build the system prompt for a cell agent.
 * Uses the provided config or falls back to defaults.
 * 
 * @param cellId - Unique cell identifier
 * @param x - Cell X coordinate
 * @param y - Cell Y coordinate  
 * @param width - Grid width
 * @param height - Grid height
 * @param config - Optional prompt configuration
 */
export function buildCellSystemPrompt(
	cellId: number,
	x: number,
	y: number,
	width: number,
	height: number,
	config?: PromptConfig
): string {
	// Use config if provided, otherwise use defaults
	const task = config?.taskDescription ?? DEFAULT_TASK;
	const template = (config?.useAdvancedMode && config?.advancedTemplate) 
		? config.advancedTemplate 
		: DEFAULT_TEMPLATE;
	
	return replacePlaceholders(template, x, y, width, height, task);
}

/**
 * Legacy function signature for backwards compatibility
 * @deprecated Use buildCellSystemPrompt with config parameter
 */
export function buildCellSystemPromptLegacy(
	cellId: number,
	x: number,
	y: number,
	width: number,
	height: number
): string {
	return buildCellSystemPrompt(cellId, x, y, width, height);
}

/**
 * Build the user prompt for a single cell's decision.
 * Uses clear, descriptive field names so the LLM understands the context.
 */
export function buildCellUserPrompt(req: NlcaCellRequest): string {
	// Count alive neighbors for quick context
	const aliveCount = req.neighbors.filter(n => n.state === 1).length;
	
	// Clear, descriptive format matching what's documented in the system prompt
	const payload = {
		generation: req.generation,
		state: req.self,
		neighbors: aliveCount,
		neighborhood: req.neighbors.map((nn) => [nn.dx, nn.dy, nn.state])
	};
	return JSON.stringify(payload);
}

/**
 * Parse the response from a single cell agent.
 * Handles various response formats gracefully.
 */
export function parseCellResponse(text: string): NlcaCellResponse | null {
	const trimmed = text.trim();
	if (!trimmed) return null;

	try {
		// Try to extract JSON from the response (handle markdown code blocks)
		let jsonStr = trimmed;
		
		// Remove markdown code blocks if present
		const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			jsonStr = jsonMatch[1] ?? trimmed;
		}

		const obj = JSON.parse(jsonStr) as Record<string, unknown>;
		if (!obj || typeof obj !== 'object') return null;

		// Accept "state" or "s" as the key
		const stateRaw = obj.state ?? obj.s;
		const stateNum = Number(stateRaw);
		
		if (!Number.isFinite(stateNum)) return null;
		
		const state: CellState01 = stateNum === 1 ? 1 : 0;

		// Optional confidence
		const confidenceRaw = obj.confidence ?? obj.c;
		const confidence =
			typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
				? Math.max(0, Math.min(1, confidenceRaw))
				: undefined;

		return confidence === undefined ? { state } : { state, confidence };
	} catch {
		// Fallback: try to find just 0 or 1 in the response
		if (/\b1\b/.test(trimmed) && !/\b0\b/.test(trimmed)) {
			return { state: 1 };
		}
		if (/\b0\b/.test(trimmed) && !/\b1\b/.test(trimmed)) {
			return { state: 0 };
		}
		return null;
	}
}


