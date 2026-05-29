import * as vscode from "vscode"

import {
	type GroupEntry,
	type ModeConfig,
	type CustomModePrompts,
	type ToolGroup,
	type PromptComponent,
	DEFAULT_MODES,
} from "@roo-code/types"

import { addCustomInstructions } from "../core/prompts/sections/custom-instructions"

import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS } from "./tools"

export type Mode = string

// Slug aliases for backward compatibility with old mode slugs
const SLUG_ALIASES: Record<string, string> = {
	architect: "spec",
	code: "vibe",
}

// Resolve a slug alias to its current slug
export function resolveModeSlug(slug: string): string {
	return SLUG_ALIASES[slug] || slug
}

// Helper to extract group name regardless of format
export function getGroupName(group: GroupEntry): ToolGroup {
	if (typeof group === "string") {
		return group
	}

	return group[0]
}

// Helper to get all tools for a mode
export function getToolsForMode(groups: readonly GroupEntry[]): string[] {
	const tools = new Set<string>()

	// Add tools from each group (excluding customTools which are opt-in only)
	groups.forEach((group) => {
		const groupName = getGroupName(group)
		const groupConfig = TOOL_GROUPS[groupName]
		groupConfig.tools.forEach((tool: string) => tools.add(tool))
	})

	// Always add required tools
	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool))

	return Array.from(tools)
}

// Main modes configuration as an ordered array
export const modes = DEFAULT_MODES

// Export the default mode slug
export const defaultModeSlug = modes[0].slug

// Helper functions
export function getModeBySlug(slug: string, customModes?: ModeConfig[]): ModeConfig | undefined {
	// Resolve slug aliases for backward compatibility
	const resolvedSlug = resolveModeSlug(slug)

	// Check custom modes first — resolve each custom mode's slug to handle
	// bidirectional backward compat (e.g., custom mode with slug "architect"
	// should be found when requesting "spec")
	const customMode = customModes?.find((mode) => {
		const customResolved = resolveModeSlug(mode.slug)
		return customResolved === resolvedSlug
	})
	if (customMode) {
		return customMode
	}
	// Then check built-in modes
	return modes.find((mode) => mode.slug === resolvedSlug)
}

export function getModeConfig(slug: string, customModes?: ModeConfig[]): ModeConfig {
	const mode = getModeBySlug(slug, customModes)
	if (!mode) {
		throw new Error(`No mode found for slug: ${slug}`)
	}
	return mode
}

// Get all available modes, with custom modes overriding built-in modes.
// Uses bidirectional slug resolution so custom modes with legacy slugs
// (e.g., "architect") correctly override built-in modes (e.g., "spec").
export function getAllModes(customModes?: ModeConfig[]): ModeConfig[] {
	if (!customModes?.length) {
		return [...modes]
	}

	// Start with built-in modes
	const allModes = [...modes]

	// Process custom modes
	customModes.forEach((customMode) => {
		const customResolved = resolveModeSlug(customMode.slug)
		const index = allModes.findIndex((mode) => resolveModeSlug(mode.slug) === customResolved)
		if (index !== -1) {
			// Override existing mode
			allModes[index] = customMode
		} else {
			// Add new mode
			allModes.push(customMode)
		}
	})

	return allModes
}

// Check if a mode is custom or an override.
// Uses bidirectional slug resolution so legacy slugs (e.g., "architect")
// are recognized as custom when compared against built-in slugs (e.g., "spec").
export function isCustomMode(slug: string, customModes?: ModeConfig[]): boolean {
	const resolvedSlug = resolveModeSlug(slug)
	return !!customModes?.some((mode) => resolveModeSlug(mode.slug) === resolvedSlug)
}

/**
 * Find a mode by its slug, don't fall back to built-in modes
 */
export function findModeBySlug(slug: string, modes: readonly ModeConfig[] | undefined): ModeConfig | undefined {
	return modes?.find((mode) => mode.slug === slug)
}

/**
 * Get the mode selection based on the provided mode slug, prompt component, and custom modes.
 * If a custom mode is found, it takes precedence over the built-in modes.
 * If no custom mode is found, the built-in mode is used with partial merging from promptComponent.
 * If neither is found, the default mode is used.
 */
export function getModeSelection(mode: string, promptComponent?: PromptComponent, customModes?: ModeConfig[]) {
	// Resolve slug aliases for backward compatibility
	const resolvedMode = resolveModeSlug(mode)

	// Check custom modes — resolve each custom mode's slug to handle
	// bidirectional backward compat (e.g., custom mode with slug "architect"
	// should be found when requesting "spec")
	const customMode = customModes?.find((m) => resolveModeSlug(m.slug) === resolvedMode)
	const builtInMode = findModeBySlug(resolvedMode, modes)

	// If we have a custom mode, use it entirely
	if (customMode) {
		return {
			roleDefinition: customMode.roleDefinition || "",
			baseInstructions: customMode.customInstructions || "",
			description: customMode.description || "",
		}
	}

	// Otherwise, use built-in mode as base and merge with promptComponent
	const baseMode = builtInMode || modes[0] // fallback to default mode

	return {
		roleDefinition: promptComponent?.roleDefinition || baseMode.roleDefinition || "",
		baseInstructions: promptComponent?.customInstructions || baseMode.customInstructions || "",
		description: baseMode.description || "",
	}
}

// Custom error class for file restrictions
export class FileRestrictionError extends Error {
	constructor(mode: string, pattern: string, description: string | undefined, filePath: string, tool?: string) {
		const toolInfo = tool ? `Tool '${tool}' in mode '${mode}'` : `This mode (${mode})`
		super(
			`${toolInfo} can only edit files matching pattern: ${pattern}${description ? ` (${description})` : ""}. Got: ${filePath}`,
		)
		this.name = "FileRestrictionError"
	}
}

// Create the mode-specific default prompts
export const defaultPrompts: Readonly<CustomModePrompts> = Object.freeze(
	Object.fromEntries(
		modes.map((mode) => [
			mode.slug,
			{
				roleDefinition: mode.roleDefinition,
				whenToUse: mode.whenToUse,
				customInstructions: mode.customInstructions,
				description: mode.description,
			},
		]),
	),
)

// Helper function to get all modes with their prompt overrides from extension state.
// Uses bidirectional slug resolution so prompts stored under legacy slugs
// (e.g., "architect") are applied to the correct built-in mode (e.g., "spec").
export async function getAllModesWithPrompts(context: vscode.ExtensionContext): Promise<ModeConfig[]> {
	const customModes = (await context.globalState.get<ModeConfig[]>("customModes")) || []
	const customModePrompts = (await context.globalState.get<CustomModePrompts>("customModePrompts")) || {}

	const allModes = getAllModes(customModes)
	return allModes.map((mode) => {
		const resolvedSlug = resolveModeSlug(mode.slug)
		// Check prompts by resolved slug, then original slug, then any legacy alias key
		const prompts = customModePrompts[resolvedSlug] || customModePrompts[mode.slug] || (() => {
			const legacyKey = Object.keys(customModePrompts).find(k => resolveModeSlug(k) === resolvedSlug)
			return legacyKey ? customModePrompts[legacyKey] : undefined
		})()
		return {
			...mode,
			roleDefinition: prompts?.roleDefinition ?? mode.roleDefinition,
			whenToUse: prompts?.whenToUse ?? mode.whenToUse,
			customInstructions: prompts?.customInstructions ?? mode.customInstructions,
			// description is not overridable via customModePrompts, so we keep the original
		}
	})
}

// Helper function to get complete mode details with all overrides
export async function getFullModeDetails(
	modeSlug: string,
	customModes?: ModeConfig[],
	customModePrompts?: CustomModePrompts,
	options?: {
		cwd?: string
		globalCustomInstructions?: string
		language?: string
	},
): Promise<ModeConfig> {
	// Resolve slug aliases for backward compatibility
	const resolvedSlug = resolveModeSlug(modeSlug)

	// First get the base mode config from custom modes or built-in modes
	const baseMode = getModeBySlug(resolvedSlug, customModes) || modes.find((m) => m.slug === resolvedSlug) || modes[0]

	// Check for any prompt component overrides using the resolved slug, then fall back to legacy aliases
	const promptComponent = customModePrompts?.[resolvedSlug] || customModePrompts?.[modeSlug]

	// Get the base custom instructions
	const baseCustomInstructions = promptComponent?.customInstructions || baseMode.customInstructions || ""
	const baseWhenToUse = promptComponent?.whenToUse || baseMode.whenToUse || ""
	const baseDescription = promptComponent?.description || baseMode.description || ""

	// If we have cwd, load and combine all custom instructions
	let fullCustomInstructions = baseCustomInstructions
	if (options?.cwd) {
		fullCustomInstructions = await addCustomInstructions(
			baseCustomInstructions,
			options.globalCustomInstructions || "",
			options.cwd,
			resolvedSlug,
			{ language: options.language },
		)
	}

	// Return mode with any overrides applied
	return {
		...baseMode,
		roleDefinition: promptComponent?.roleDefinition || baseMode.roleDefinition,
		whenToUse: baseWhenToUse,
		description: baseDescription,
		customInstructions: fullCustomInstructions,
	}
}

// Helper function to safely get role definition
export function getRoleDefinition(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`No mode found for slug: ${modeSlug}`)
		return ""
	}
	return mode.roleDefinition
}

// Helper function to safely get description
export function getDescription(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`No mode found for slug: ${modeSlug}`)
		return ""
	}
	return mode.description ?? ""
}

// Helper function to safely get whenToUse
export function getWhenToUse(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`No mode found for slug: ${modeSlug}`)
		return ""
	}
	return mode.whenToUse ?? ""
}

// Helper function to safely get custom instructions
export function getCustomInstructions(modeSlug: string, customModes?: ModeConfig[]): string {
	const mode = getModeBySlug(modeSlug, customModes)
	if (!mode) {
		console.warn(`No mode found for slug: ${modeSlug}`)
		return ""
	}
	return mode.customInstructions ?? ""
}
