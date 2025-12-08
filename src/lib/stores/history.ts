import type { Simulation } from '../webgpu/simulation.js';
import type { CARule } from '../utils/rules.js';
import type { BoundaryMode } from './simulation.svelte.js';
import { getSimulationState } from './simulation.svelte.js';

// Branch-aware history with snapshots per node (full-grid snapshots).
// Future: optimize to region patches and thumbnails.

export type HistoryKind = 'brush' | 'rule';

export interface HistoryNode {
	id: string;
	parentId: string | null;
	name: string;
	createdAt: number;
	kind: HistoryKind;
	snapshot: Uint32Array;
	rule: CARule;
	boundaryMode: BoundaryMode;
}

const MAX_HISTORY = 12;

let nodes = new Map<string, HistoryNode>();
let headId: string | null = null;
let rootId: string | null = null;
let counter = 0;
// Track how we navigated last to decide pruning behavior
// 'normal' = new nodes appended linearly
// 'undo' = we moved back with undo/redo (prune future on next add)
// 'jump' = user jumped to an arbitrary node (do NOT prune future when branching)
let lastNav: 'normal' | 'undo' | 'jump' = 'normal';

// Simple subscription system for reactive updates
type HistoryListener = () => void;
const listeners = new Set<HistoryListener>();

export function subscribeHistory(fn: HistoryListener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

function notifyListeners() {
	listeners.forEach(fn => fn());
}

function genId() {
	return `h-${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

function getChildren(id: string): HistoryNode[] {
	return Array.from(nodes.values()).filter(n => n.parentId === id).sort((a, b) => a.createdAt - b.createdAt);
}

function getDepth(id: string): number {
	let d = 0;
	let cur = nodes.get(id);
	while (cur && cur.parentId) {
		d += 1;
		cur = nodes.get(cur.parentId);
	}
	return d;
}

export async function resetHistory(sim?: Simulation) {
	nodes.clear();
	headId = null;
	rootId = null;
	counter = 0;
	if (sim) {
		const snap = await sim.getCellDataAsync();
		const id = genId();
		const node: HistoryNode = {
			id,
			parentId: null,
			name: 'Start',
			createdAt: Date.now(),
			kind: 'brush',
			snapshot: snap
		};
		nodes.set(id, node);
		headId = id;
		rootId = id;
	}
	notifyListeners();
}

function ensureRoot(sim: Simulation) {
	if (!headId || !rootId || nodes.size === 0) {
		resetHistory(sim);
	}
}

function enforceLimit() {
	// Remove oldest leaf nodes (not root/head) until within limit
	while (nodes.size > MAX_HISTORY) {
		const leaves = Array.from(nodes.values()).filter(n => getChildren(n.id).length === 0 && n.id !== rootId && n.id !== headId);
		if (leaves.length === 0) break;
		leaves.sort((a, b) => a.createdAt - b.createdAt);
		nodes.delete(leaves[0].id);
	}
}

function deleteSubtree(id: string) {
	getChildren(id).forEach(child => deleteSubtree(child.id));
	nodes.delete(id);
}

// Prune any future/redo branches when we're extending the current head (e.g., after undo).
// For branching operations (when parentIdOverride is provided), we skip pruning.
function pruneFutureFrom(parentId: string | null) {
	if (!parentId) return;
	const children = getChildren(parentId);
	children.forEach(child => deleteSubtree(child.id));
}

function markNavUndo() {
	lastNav = 'undo';
}

function markNavJump() {
	lastNav = 'jump';
}

function markNavNormal() {
	lastNav = 'normal';
}

export async function addSnapshot(sim: Simulation, name = 'Stroke', kind: HistoryKind = 'brush', parentIdOverride?: string | null) {
	ensureRoot(sim);
	const simState = getSimulationState();
	const snap = await sim.getCellDataAsync();
	const id = genId();
	const node: HistoryNode = {
		id,
		parentId: parentIdOverride ?? headId,
		name,
		createdAt: Date.now(),
		kind,
		snapshot: snap,
		rule: { ...simState.currentRule },
		boundaryMode: simState.boundaryMode
	};
	// If we're extending the current head (no explicit parent override) AND last nav was undo,
	// drop redo branches. If last nav was jump, we branch instead and keep existing children.
	if (!parentIdOverride && headId && lastNav === 'undo') {
		pruneFutureFrom(headId);
	}

	nodes.set(id, node);
	headId = id;
	markNavNormal();
	enforceLimit();
	notifyListeners();
}

export async function addSnapshotWithBefore(
	sim: Simulation,
	beforeSnapshot: Uint32Array | null,
	name = 'Stroke',
	kind: HistoryKind = 'brush',
	parentIdOverride?: string | null
) {
	ensureRoot(sim);
	const simState = getSimulationState();
	const parentId = parentIdOverride ?? headId;

	// If we're extending the current head (no explicit parent override) AND last nav was undo,
	// drop redo branches. If last nav was jump, we branch instead and keep existing children.
	if (!parentIdOverride && parentId && lastNav === 'undo') {
		pruneFutureFrom(parentId);
	}

	const beforeSnap = beforeSnapshot ?? (await sim.getCellDataAsync());
	const beforeId = genId();
	const beforeNode: HistoryNode = {
		id: beforeId,
		parentId,
		name: `${name} (pre)`,
		createdAt: Date.now(),
		kind,
		snapshot: beforeSnap,
		rule: { ...simState.currentRule },
		boundaryMode: simState.boundaryMode
	};
	nodes.set(beforeId, beforeNode);

	const afterSnap = await sim.getCellDataAsync();
	const afterId = genId();
	const afterNode: HistoryNode = {
		id: afterId,
		parentId: beforeId,
		name,
		createdAt: Date.now(),
		kind,
		snapshot: afterSnap,
		rule: { ...simState.currentRule },
		boundaryMode: simState.boundaryMode
	};
	nodes.set(afterId, afterNode);

	headId = afterId;
	markNavNormal();
	enforceLimit();
	notifyListeners();
}

export function canUndo(): boolean {
	if (!headId) return false;
	const cur = nodes.get(headId);
	return !!cur && !!cur.parentId;
}

export function canRedo(): boolean {
	if (!headId) return false;
	// Redo = pick most recent child of head (if any)
	return getChildren(headId).length > 0;
}

export async function undo(sim: Simulation): Promise<boolean> {
	if (!canUndo() || !headId) return false;
	const cur = nodes.get(headId);
	if (!cur || !cur.parentId) return false;
	const parent = nodes.get(cur.parentId);
	if (!parent) return false;
	sim.setCellData(parent.snapshot);
	const simState = getSimulationState();
	simState.currentRule = parent.rule;
	simState.boundaryMode = parent.boundaryMode;
	sim.setRule(parent.rule);
	headId = parent.id;
	markNavUndo();
	notifyListeners();
	return true;
}

export async function redo(sim: Simulation): Promise<boolean> {
	if (!canRedo() || !headId) return false;
	const children = getChildren(headId);
	if (children.length === 0) return false;
	// pick most recent child
	const next = children[children.length - 1];
	sim.setCellData(next.snapshot);
	const simState = getSimulationState();
	simState.currentRule = next.rule;
	simState.boundaryMode = next.boundaryMode;
	sim.setRule(next.rule);
	headId = next.id;
	markNavUndo();
	notifyListeners();
	return true;
}

export function getNodes(): HistoryNode[] {
	return Array.from(nodes.values()).sort((a, b) => a.createdAt - b.createdAt);
}

export function getHeadId(): string | null {
	return headId;
}

export function getRootId(): string | null {
	return rootId;
}

export function getMaxHistory(): number {
	return MAX_HISTORY;
}

export function getNode(id: string): HistoryNode | undefined {
	return nodes.get(id);
}

export function renameNode(id: string, name: string) {
	const node = nodes.get(id);
	if (node) {
		node.name = name;
		notifyListeners();
	}
}

export function deleteNode(id: string) {
	if (id === rootId) return false;
	const node = nodes.get(id);
	if (!node) return false;
	const parentId = node.parentId;
	const children = getChildren(id);
	children.forEach(child => {
		child.parentId = parentId;
	});
	if (headId === id) {
		headId = parentId;
	}
	nodes.delete(id);
	notifyListeners();
	return true;
}

export function jumpToNode(sim: Simulation, id: string): boolean {
	const node = nodes.get(id);
	if (!node) return false;
	sim.setCellData(node.snapshot);
	const simState = getSimulationState();
	simState.currentRule = node.rule;
	simState.boundaryMode = node.boundaryMode;
	sim.setRule(node.rule);
	headId = id;
	markNavJump();
	notifyListeners();
	return true;
}

