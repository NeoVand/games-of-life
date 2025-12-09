import { driver, type DriveStep, type Config } from 'driver.js';

// Track if rule editor tour is currently active
let ruleEditorTourActive = false;

export function isRuleEditorTourActive(): boolean {
	return ruleEditorTourActive;
}

// Get CSS color from CSS variable - try .app element first, then documentElement
function getCSSVariable(name: string): string {
	if (typeof document === 'undefined') return '#2dd4bf';
	// First try to get from .app element where the variable is actually set
	const appEl = document.querySelector('.app');
	if (appEl) {
		const value = getComputedStyle(appEl).getPropertyValue(name).trim();
		if (value) return value;
	}
	// Fallback to documentElement
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2dd4bf';
}

// SVG Icons for the tour
const icons = {
	// Rules/function icon (bold italic f)
	rules: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<path d="M16.5 3C14 3 12.5 4.5 11.8 7L10.5 11H7.5C7 11 6.5 11.4 6.5 12s.5 1 1 1h2.3l-1.6 5.5C7.7 20 6.8 21 5.5 21c-.5 0-.9-.1-1.2-.3-.4-.2-.9-.1-1.1.3-.2.4-.1.9.3 1.1.6.3 1.3.5 2 .5 2.5 0 4-1.5 4.8-4.2L12 13h3.5c.5 0 1-.4 1-1s-.5-1-1-1h-2.8l1.1-3.5C14.3 5.8 15.2 5 16.5 5c.4 0 .8.1 1.1.2.4.2.9 0 1.1-.4.2-.4 0-.9-.4-1.1-.6-.4-1.4-.7-2.3-.7z"/>
	</svg>`,
	// Grid icon
	grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<rect x="4" y="4" width="6" height="6" />
		<rect x="14" y="4" width="6" height="6" />
		<rect x="4" y="14" width="6" height="6" />
		<rect x="14" y="14" width="6" height="6" />
	</svg>`,
	// Hexagon icon
	hexagon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
	</svg>`,
	// Birth icon (plus in circle)
	birth: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<circle cx="12" cy="12" r="9" />
		<path d="M12 8v8M8 12h8" />
	</svg>`,
	// Survive icon (check in circle)
	survive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<circle cx="12" cy="12" r="9" />
		<path d="M9 12l2 2 4-4" />
	</svg>`,
	// Preview/play icon
	preview: `<svg viewBox="0 0 24 24" fill="currentColor" class="tour-icon">
		<path d="M8 5v14l11-7-11-7z"/>
	</svg>`,
	// Dropdown/filter icon
	filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
	</svg>`,
	// Sliders/states icon
	sliders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<line x1="4" y1="21" x2="4" y2="14" />
		<line x1="4" y1="10" x2="4" y2="3" />
		<line x1="12" y1="21" x2="12" y2="12" />
		<line x1="12" y1="8" x2="12" y2="3" />
		<line x1="20" y1="21" x2="20" y2="16" />
		<line x1="20" y1="12" x2="20" y2="3" />
		<line x1="1" y1="14" x2="7" y2="14" />
		<line x1="9" y1="8" x2="15" y2="8" />
		<line x1="17" y1="16" x2="23" y2="16" />
	</svg>`,
	// Boundary icon
	boundary: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.5" />
	</svg>`,
	// Vitality/heart icon
	vitality: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
	</svg>`,
	// Checkmark/done icon
	check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<path d="M20 6L9 17l-5-5"/>
	</svg>`,
	// Neighborhood icon
	neighborhood: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tour-icon">
		<circle cx="12" cy="12" r="3" />
		<circle cx="12" cy="5" r="2" />
		<circle cx="19" cy="12" r="2" />
		<circle cx="12" cy="19" r="2" />
		<circle cx="5" cy="12" r="2" />
	</svg>`
};

// Helper to create title with icon
function titleWithIcon(icon: string, text: string): string {
	return `<span class="tour-title-wrapper">${icon}<span>${text}</span></span>`;
}

// Tour step definitions for Rule Editor
function getRuleEditorTourSteps(): DriveStep[] {
	const steps: DriveStep[] = [
		// 1. Welcome to Rule Editor
		{
			popover: {
				title: titleWithIcon(icons.rules, 'Rule Editor'),
				description: 'This is where you control the rules that govern cell behavior. Let me show you around!',
				side: 'over',
				align: 'center'
			}
		},
		// 2. Grid Type Toggle
		{
			element: '.grid-type-toggle',
			popover: {
				title: titleWithIcon(icons.grid, 'Grid Type'),
				description: 'Choose between <strong>Square</strong> grids (traditional) or <strong>Hexagonal</strong> grids (honeycomb pattern). Different grid types offer different neighbor configurations.',
				side: 'bottom',
				align: 'center'
			}
		},
		// 3. Selectors Row
		{
			element: '.selectors-row',
			popover: {
				title: titleWithIcon(icons.filter, 'Rule Selection'),
				description: `<p><strong>Type</strong>: Filter rules by category, neighborhood, or trail length.</p>
				<p><strong>Rule</strong>: Choose from 100+ preset rules, or search by name.</p>
				<p><strong>Neighborhood</strong>: Select how many neighbors influence each cell (4, 6, 8, 18, or 24).</p>`,
				side: 'bottom',
				align: 'center'
			}
		},
		// 4. Birth Grid
		{
			element: '.grid-col:first-child',
			popover: {
				title: titleWithIcon(icons.birth, 'Birth Conditions'),
				description: 'Select which neighbor counts cause a <strong>dead cell to become alive</strong>. For example, in Conway\'s Game of Life, a dead cell with exactly 3 neighbors is born.',
				side: 'right',
				align: 'center'
			}
		},
		// 5. Survive Grid
		{
			element: '.grid-col:nth-child(2)',
			popover: {
				title: titleWithIcon(icons.survive, 'Survival Conditions'),
				description: 'Select which neighbor counts allow an <strong>alive cell to survive</strong>. In Conway\'s Life, a cell survives with 2 or 3 neighbors.',
				side: 'left',
				align: 'center'
			}
		},
		// 6. Preview
		{
			element: '.preview-col',
			popover: {
				title: titleWithIcon(icons.preview, 'Live Preview'),
				description: 'Test your rule here! Use the controls to <strong>play</strong>, <strong>step</strong>, or <strong>reset</strong> the preview simulation.',
				side: 'left',
				align: 'center'
			}
		},
		// 7. Footer (States & Rule String)
		{
			element: '.footer',
			popover: {
				title: titleWithIcon(icons.sliders, 'States & Rule String'),
				description: `<p><strong>States</strong>: Number of cell states (2 = binary on/off, more = colorful trails as cells decay).</p>
				<p><strong>Rule</strong>: The rule in B/S notation. Edit directly for custom rules!</p>`,
				side: 'top',
				align: 'center'
			}
		},
		// 8. Boundary Section
		{
			element: '.boundary-section',
			popover: {
				title: titleWithIcon(icons.boundary, 'Boundary Modes'),
				description: 'Choose how the grid edges behave: <strong>Torus</strong> (wraps around), <strong>Mirror</strong> (reflects), <strong>Dead</strong> (edge is dead), <strong>Alive</strong> (edge is alive), or <strong>Infinite</strong> (extends).',
				side: 'top',
				align: 'center'
			}
		},
		// 9. Vitality Section (conditional - will be skipped if not visible)
		{
			element: '.vitality-section',
			popover: {
				title: titleWithIcon(icons.vitality, 'Vitality Influence'),
				description: 'With multi-state rules, dying cells can influence their neighbors. Choose how vitality (decay state) affects neighbor counting for unique behaviors.',
				side: 'top',
				align: 'center'
			}
		},
		// 10. Final step
		{
			popover: {
				title: titleWithIcon(icons.check, 'Ready to Experiment!'),
				description: 'Changes apply in real-time. Try different rules and watch the canvas update instantly. Click the checkmark to apply and close, or ✕ to cancel.',
				side: 'over',
				align: 'center'
			}
		}
	];
	
	return steps;
}

// Filter steps to only include visible elements
function getVisibleSteps(): DriveStep[] {
	const allSteps = getRuleEditorTourSteps();
	
	return allSteps.filter(step => {
		// Steps without elements are always included
		if (!step.element) return true;
		
		// Check if element exists and is visible
		const el = document.querySelector(step.element as string);
		if (!el) return false;
		
		// Check if element is actually visible
		const rect = el.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	});
}

// Generate CSS for the Rule Editor tour
export function getRuleEditorTourStyles(accentColor: string, isLightTheme: boolean): string {
	const bgColor = isLightTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(16, 16, 24, 0.95)';
	const textColor = isLightTheme ? '#1a1a1a' : '#e0e0e0';
	const mutedColor = isLightTheme ? '#666' : '#999';
	const borderColor = isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
	
	return `
		/* Ensure driver.js elements are above all modals */
		.driver-active .driver-overlay {
			z-index: 100000 !important;
		}
		
		.driver-active .driver-active-element {
			z-index: 100001 !important;
			position: relative !important;
		}
		
		/* When tour is active, lower the modal backdrop z-index */
		body.rule-editor-tour-active .modal-backdrop {
			z-index: 99999 !important;
			pointer-events: none !important;
		}
		
		body.rule-editor-tour-active .modal-backdrop .editor {
			pointer-events: auto !important;
		}
		
		.driver-popover.rule-editor-tour-popover {
			background: ${bgColor} !important;
			backdrop-filter: blur(12px) !important;
			border: 1px solid ${borderColor} !important;
			border-radius: 12px !important;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
			max-width: 300px !important;
			z-index: 100002 !important;
			pointer-events: auto !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-title {
			color: ${textColor} !important;
			font-size: 0.95rem !important;
			font-weight: 600 !important;
			margin-bottom: 0.5rem !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-description {
			color: ${mutedColor} !important;
			font-size: 0.8rem !important;
			line-height: 1.5 !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-description p {
			margin: 0 0 0.4rem 0 !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-description p:last-child {
			margin-bottom: 0 !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-description strong {
			color: ${textColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-progress-text {
			color: ${mutedColor} !important;
			font-size: 0.65rem !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-navigation-btns {
			gap: 0.5rem !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-prev-btn,
		.driver-popover.rule-editor-tour-popover .driver-popover-next-btn {
			background: transparent !important;
			color: ${mutedColor} !important;
			border: 1px solid ${borderColor} !important;
			border-radius: 6px !important;
			padding: 0.4rem 0.8rem !important;
			font-size: 0.75rem !important;
			font-weight: 500 !important;
			cursor: pointer !important;
			transition: all 0.15s !important;
			box-shadow: none !important;
			text-shadow: none !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-prev-btn:hover,
		.driver-popover.rule-editor-tour-popover .driver-popover-next-btn:hover {
			color: ${textColor} !important;
			border-color: ${accentColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-next-btn {
			background: ${isLightTheme ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)'} !important;
			color: ${accentColor} !important;
			border: 1px solid ${accentColor}40 !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-next-btn:hover {
			background: ${accentColor}15 !important;
			border-color: ${accentColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover button {
			box-shadow: none !important;
			text-shadow: none !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-close-btn {
			color: ${mutedColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-close-btn:hover {
			color: ${textColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-arrow-side-left {
			border-left-color: ${bgColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-arrow-side-right {
			border-right-color: ${bgColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-arrow-side-top {
			border-top-color: ${bgColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .driver-popover-arrow-side-bottom {
			border-bottom-color: ${bgColor} !important;
		}
		
		/* Tour icon styling */
		.driver-popover.rule-editor-tour-popover .tour-title-wrapper {
			display: flex !important;
			align-items: center !important;
			gap: 0.5rem !important;
		}
		
		.driver-popover.rule-editor-tour-popover .tour-icon {
			width: 18px !important;
			height: 18px !important;
			flex-shrink: 0 !important;
			color: ${accentColor} !important;
			fill: ${accentColor} !important;
			stroke: ${accentColor} !important;
		}
		
		.driver-popover.rule-editor-tour-popover .tour-icon[fill="currentColor"] {
			fill: ${accentColor} !important;
			stroke: none !important;
		}
		
		.driver-popover.rule-editor-tour-popover .tour-icon[fill="none"] {
			fill: none !important;
			stroke: ${accentColor} !important;
		}
		
		/* Mobile adjustments */
		@media (max-width: 768px) {
			.driver-popover.rule-editor-tour-popover {
				max-width: 260px !important;
			}
			
			.driver-popover.rule-editor-tour-popover .driver-popover-title {
				font-size: 0.9rem !important;
			}
			
			.driver-popover.rule-editor-tour-popover .driver-popover-description {
				font-size: 0.75rem !important;
			}
			
			.driver-popover.rule-editor-tour-popover .tour-icon {
				width: 16px !important;
				height: 16px !important;
			}
		}
	`;
}

// Create and configure the driver instance for Rule Editor
export function createRuleEditorTour(options?: { 
	onComplete?: () => void;
	onSkip?: () => void;
	accentColor?: string;
	isLightTheme?: boolean;
}): ReturnType<typeof driver> {
	const accentColor = options?.accentColor || getCSSVariable('--ui-accent');
	const isLight = options?.isLightTheme ?? false;
	
	let driverObj: ReturnType<typeof driver>;
	
	const config: Config = {
		showProgress: true,
		animate: true,
		smoothScroll: false, // Disable smooth scroll since we're inside a modal
		allowClose: true,
		stagePadding: 4,
		stageRadius: 8,
		popoverClass: `rule-editor-tour-popover ${isLight ? 'light-theme' : 'dark-theme'}`,
		overlayColor: isLight ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.7)',
		steps: getVisibleSteps(),
		nextBtnText: 'Next',
		prevBtnText: 'Back',
		doneBtnText: 'Done',
		disableActiveInteraction: false,
		onHighlightStarted: () => {
			// Add class to body when tour is active to adjust z-index
			document.body.classList.add('rule-editor-tour-active');
		},
		onDestroyed: () => {
			document.body.classList.remove('rule-editor-tour-active');
			ruleEditorTourActive = false;
			options?.onComplete?.();
		},
		onCloseClick: () => {
			document.body.classList.remove('rule-editor-tour-active');
			ruleEditorTourActive = false;
			options?.onSkip?.();
			driverObj.destroy();
		}
	};
	
	driverObj = driver(config);
	return driverObj;
}

// Start the Rule Editor tour
export function startRuleEditorTour(options?: Parameters<typeof createRuleEditorTour>[0]): void {
	ruleEditorTourActive = true;
	const driverObj = createRuleEditorTour(options);
	driverObj.drive();
}

