/**
 * Modal Manager Store
 * Manages multiple draggable modals with position persistence and z-index management
 */

export type ModalId = 'ruleEditor' | 'initialize' | 'about' | 'settings' | 'help' | 'brushEditor' | 'historyTimeline' | 'audio';

export interface ModalState {
	isOpen: boolean;
	position: { x: number; y: number } | null;
	zIndex: number;
}

// Base z-index for modals
const BASE_Z_INDEX = 1000;

// Create modal states
const modalStates = $state<Record<ModalId, ModalState>>({
	ruleEditor: { isOpen: false, position: null, zIndex: BASE_Z_INDEX },
	initialize: { isOpen: false, position: null, zIndex: BASE_Z_INDEX },
	about: { isOpen: false, position: null, zIndex: BASE_Z_INDEX },
	settings: { isOpen: false, position: null, zIndex: BASE_Z_INDEX },
	help: { isOpen: false, position: null, zIndex: BASE_Z_INDEX },
	brushEditor: { isOpen: false, position: null, zIndex: BASE_Z_INDEX },
	historyTimeline: { isOpen: false, position: null, zIndex: BASE_Z_INDEX },
	audio: { isOpen: false, position: null, zIndex: BASE_Z_INDEX }
});

// Track the highest z-index used
let highestZIndex = $state(BASE_Z_INDEX);

/**
 * Open a modal and bring it to front
 */
export function openModal(id: ModalId) {
	highestZIndex++;
	modalStates[id] = {
		...modalStates[id],
		isOpen: true,
		zIndex: highestZIndex
	};
}

/**
 * Close a modal (preserves position)
 */
export function closeModal(id: ModalId) {
	modalStates[id] = {
		...modalStates[id],
		isOpen: false
	};
}

/**
 * Toggle a modal's visibility
 */
export function toggleModal(id: ModalId) {
	if (modalStates[id].isOpen) {
		closeModal(id);
	} else {
		openModal(id);
	}
}

/**
 * Bring a modal to the front (when clicked/focused)
 */
export function bringToFront(id: ModalId) {
	if (modalStates[id].zIndex < highestZIndex) {
		highestZIndex++;
		modalStates[id] = {
			...modalStates[id],
			zIndex: highestZIndex
		};
	}
}

/**
 * Update modal position (for persistence after dragging)
 */
export function setModalPosition(id: ModalId, position: { x: number; y: number }) {
	modalStates[id] = {
		...modalStates[id],
		position
	};
}

/**
 * Reset a modal's position to center
 */
export function resetModalPosition(id: ModalId) {
	modalStates[id] = {
		...modalStates[id],
		position: null
	};
}

/**
 * Close all modals
 */
export function closeAllModals() {
	for (const id of Object.keys(modalStates) as ModalId[]) {
		modalStates[id] = {
			...modalStates[id],
			isOpen: false
		};
	}
}

/**
 * Check if any modal is open
 */
export function isAnyModalOpen(): boolean {
	return Object.values(modalStates).some(state => state.isOpen);
}

/**
 * Get the current state of all modals
 */
export function getModalStates() {
	return modalStates;
}

/**
 * Get a specific modal's state
 */
export function getModalState(id: ModalId): ModalState {
	return modalStates[id];
}

/**
 * Check if a specific modal is open
 */
export function isModalOpen(id: ModalId): boolean {
	return modalStates[id].isOpen;
}



