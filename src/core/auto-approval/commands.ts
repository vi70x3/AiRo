import { parseCommand } from "../../shared/parse-command"

/**
 * Find the longest matching prefix from a list of prefixes for a given command.
 *
 * This is the core function that implements the "longest prefix match" strategy.
 * It searches through all provided prefixes and returns the longest one that
 * matches the beginning of the command (case-insensitive).
 *
 * **Special Cases:**
 * - Wildcard "*" matches any command but is treated as length 1 for comparison
 * - Empty command or empty prefixes list returns null
 * - Matching is case-insensitive and uses startsWith logic
 *
 * **Examples:**
 * ```typescript
 * findLongestPrefixMatch("git push origin", ["git", "git push"])
 * // Returns "git push" (longer match)
 *
 * findLongestPrefixMatch("npm install", ["*", "npm"])
 * // Returns "npm" (specific match preferred over wildcard)
 *
 * findLongestPrefixMatch("unknown command", ["git", "npm"])
 * // Returns null (no match found)
 * ```
 *
 * @param command - The command to match against
 * @param prefixes - List of prefix patterns to search through
 * @returns The longest matching prefix, or null if no match found
 */
export function findLongestPrefixMatch(command: string, prefixes: string[]): string | null {
	if (!command || !prefixes?.length) {
		return null
	}

	const trimmedCommand = command.trim().toLowerCase()
	let longestMatch: string | null = null

	for (const prefix of prefixes) {
		const lowerPrefix = prefix.toLowerCase()
		// Handle wildcard "*" - it matches any command
		if (lowerPrefix === "*" || trimmedCommand.startsWith(lowerPrefix)) {
			if (!longestMatch || lowerPrefix.length > longestMatch.length) {
				longestMatch = lowerPrefix
			}
		}
	}

	return longestMatch
}

/**
 * Check if a single command should be auto-approved.
 * Returns true only for commands that explicitly match the allowlist.
 *
 * Special handling for wildcards: "*" in allowlist allows any command.
 */
export function isAutoApprovedSingleCommand(
	command: string,
	allowedCommands: string[],
): boolean {
	if (!command) {
		return true
	}

	// If no allowlist configured, nothing can be auto-approved
	if (!allowedCommands?.length) {
		return false
	}

	const trimmedCommand = command.trim().toLowerCase()

	return allowedCommands.some((prefix) => {
		const lowerPrefix = prefix.toLowerCase()
		// Handle wildcard "*" - it matches any command
		return lowerPrefix === "*" || trimmedCommand.startsWith(lowerPrefix)
	})
}

/**
 * Command approval decision types
 */
export type CommandDecision = "auto_approve" | "ask_user"

/**
 * Unified command validation that implements the longest prefix match rule.
 * Returns a definitive decision for a command based on allowlist.
 *
 * This is the main entry point for command validation.
 * It handles complex command chains and applies the longest prefix match strategy.
 *
 * **Decision Logic:**
 * 1. **Command Parsing**: Split command chains (&&, ||, ;, |, &) into individual commands
 * 2. **Individual Validation**: For each sub-command, apply longest prefix match rule
 * 3. **Aggregation**: All sub-commands must match for approval
 *
 * **Return Values:**
 * - `"auto_approve"`: All sub-commands are explicitly allowed
 * - `"ask_user"`: Mixed or no matches found, requires user decision
 *
 * **Examples:**
 * ```typescript
 * // Simple approval
 * getCommandDecision("git status", ["git"])
 * // Returns "auto_approve"
 *
 * // No matches - ask user
 * getCommandDecision("unknown command", ["git"])
 * // Returns "ask_user"
 * ```
 *
 * @param command - The full command string to validate
 * @param allowedCommands - List of allowed command prefixes
 * @returns Decision indicating whether to approve or ask user
 */
export function getCommandDecision(
	command: string,
	allowedCommands: string[],
): CommandDecision {
	if (!command?.trim()) {
		return "auto_approve"
	}

	// Parse into sub-commands (split by &&, ||, ;, |)
	const subCommands = parseCommand(command)

	// Check each sub-command and collect decisions
	const decisions: CommandDecision[] = subCommands.map((cmd) => {
		// Remove simple PowerShell-like redirections (e.g. 2>&1) before checking
		const cmdWithoutRedirection = cmd.replace(/\d*>&\d*/, "").trim()

		return getSingleCommandDecision(cmdWithoutRedirection, allowedCommands)
	})

	// If all sub-commands are approved, approve the whole command
	if (decisions.every((decision) => decision === "auto_approve")) {
		return "auto_approve"
	}

	// Otherwise, ask user
	return "ask_user"
}

/**
 * Get the decision for a single command using longest prefix match rule.
 *
 * **Decision Matrix:**
 * | Allowlist Match | Result | Reason |
 * |----------------|---------|---------|
 * | Yes | auto_approve | Allowlist matches |
 * | No | ask_user | No rules apply |
 *
 * **Examples:**
 * ```typescript
 * // Only allowlist matches
 * getSingleCommandDecision("git status", ["git"])
 * // Returns "auto_approve"
 *
 * // No matches
 * getSingleCommandDecision("unknown", ["git"])
 * // Returns "ask_user"
 * ```
 *
 * @param command - Single command to validate (no chaining)
 * @param allowedCommands - List of allowed command prefixes
 * @returns Decision for this specific command
 */
export function getSingleCommandDecision(
	command: string,
	allowedCommands: string[],
): CommandDecision {
	if (!command) return "auto_approve"

	// Find longest matching prefix in allowlist
	const longestAllowedMatch = findLongestPrefixMatch(command, allowedCommands || [])

	// If allowlist has a match, auto-approve
	if (longestAllowedMatch) {
		return "auto_approve"
	}

	// If no match, ask user
	return "ask_user"
}
