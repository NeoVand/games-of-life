/**
 * NLCA Prompt Configuration Store
 * Manages editable prompt settings for Neural-Linguistic Cellular Automata
 */

// Default task description
const DEFAULT_TASK = `Form a filled square in the center of the grid.

Rules:
1. If your x coordinate is between 3 and 7 (inclusive) AND your y coordinate is between 3 and 7 (inclusive) → output 1
2. Otherwise → output 0
3. Your previous state does not matter - only your position determines your state`;

// Default advanced template with placeholders - provides full CA context
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

// Placeholders that will be replaced by the system
export const SYSTEM_PLACEHOLDERS = [
	{ key: '{{CELL_X}}', description: 'Cell X coordinate', editable: false },
	{ key: '{{CELL_Y}}', description: 'Cell Y coordinate', editable: false },
	{ key: '{{GRID_WIDTH}}', description: 'Grid width', editable: false },
	{ key: '{{GRID_HEIGHT}}', description: 'Grid height', editable: false },
	{ key: '{{MAX_X}}', description: 'Maximum X (width - 1)', editable: false },
	{ key: '{{MAX_Y}}', description: 'Maximum Y (height - 1)', editable: false },
] as const;

// Placeholders that are user-editable
export const USER_PLACEHOLDERS = [
	{ key: '{{TASK}}', description: 'Your task description', editable: true },
] as const;

export interface NlcaPromptConfig {
	/** Simple mode: task description only */
	taskDescription: string;
	/** Whether to use advanced template mode */
	useAdvancedMode: boolean;
	/** Full template with placeholders (advanced mode) */
	advancedTemplate: string;
}

// Reactive state
let taskDescription = $state(DEFAULT_TASK);
let useAdvancedMode = $state(false);
let advancedTemplate = $state(DEFAULT_TEMPLATE);

// LocalStorage persistence key
const STORAGE_KEY = 'nlca-prompt-config';

/**
 * Load saved prompt config from localStorage
 */
function loadFromStorage(): void {
	if (typeof window === 'undefined') return;
	
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const config = JSON.parse(saved) as Partial<NlcaPromptConfig>;
			if (config.taskDescription) taskDescription = config.taskDescription;
			if (config.useAdvancedMode !== undefined) useAdvancedMode = config.useAdvancedMode;
			if (config.advancedTemplate) advancedTemplate = config.advancedTemplate;
		}
	} catch (e) {
		console.warn('[NLCA Prompt] Failed to load saved config:', e);
	}
}

/**
 * Save current prompt config to localStorage
 */
function saveToStorage(): void {
	if (typeof window === 'undefined') return;
	
	try {
		const config: NlcaPromptConfig = {
			taskDescription,
			useAdvancedMode,
			advancedTemplate
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch (e) {
		console.warn('[NLCA Prompt] Failed to save config:', e);
	}
}

// Initialize from storage on first access
let initialized = false;
function ensureInitialized() {
	if (!initialized) {
		initialized = true;
		loadFromStorage();
	}
}

/**
 * Get the NLCA prompt state (reactive)
 */
export function getNlcaPromptState() {
	ensureInitialized();
	
	return {
		// Getters
		get taskDescription() { return taskDescription; },
		get useAdvancedMode() { return useAdvancedMode; },
		get advancedTemplate() { return advancedTemplate; },
		get defaultTask() { return DEFAULT_TASK; },
		get defaultTemplate() { return DEFAULT_TEMPLATE; },
		
		// Setters
		set taskDescription(value: string) {
			taskDescription = value;
			saveToStorage();
		},
		set useAdvancedMode(value: boolean) {
			useAdvancedMode = value;
			saveToStorage();
		},
		set advancedTemplate(value: string) {
			advancedTemplate = value;
			saveToStorage();
		},
		
		// Actions
		resetToDefaults() {
			taskDescription = DEFAULT_TASK;
			useAdvancedMode = false;
			advancedTemplate = DEFAULT_TEMPLATE;
			saveToStorage();
		},
		
		resetTaskOnly() {
			taskDescription = DEFAULT_TASK;
			saveToStorage();
		},
		
		resetTemplateOnly() {
			advancedTemplate = DEFAULT_TEMPLATE;
			saveToStorage();
		},
		
		/**
		 * Build the final system prompt by replacing placeholders
		 */
		buildSystemPrompt(cellX: number, cellY: number, gridWidth: number, gridHeight: number): string {
			const template = useAdvancedMode ? advancedTemplate : DEFAULT_TEMPLATE;
			const task = taskDescription;
			
			return template
				.replace(/\{\{CELL_X\}\}/g, String(cellX))
				.replace(/\{\{CELL_Y\}\}/g, String(cellY))
				.replace(/\{\{GRID_WIDTH\}\}/g, String(gridWidth))
				.replace(/\{\{GRID_HEIGHT\}\}/g, String(gridHeight))
				.replace(/\{\{MAX_X\}\}/g, String(gridWidth - 1))
				.replace(/\{\{MAX_Y\}\}/g, String(gridHeight - 1))
				.replace(/\{\{TASK\}\}/g, task);
		},
		
		/**
		 * Get a preview of the prompt with sample values
		 */
		getPreview(sampleX = 5, sampleY = 5, width = 10, height = 10): string {
			return this.buildSystemPrompt(sampleX, sampleY, width, height);
		}
	};
}

// Export default values for reference
export { DEFAULT_TASK, DEFAULT_TEMPLATE };

