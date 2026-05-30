import { describe, it, expect } from "vitest"
import { ToolAvailabilityContext } from "../tool-availability-context"
import { stripDisabledToolReferences } from "../strip-tool-references"

describe("stripDisabledToolReferences", () => {
	it("returns identical output when no tools are disabled", () => {
		const ctx = new ToolAvailabilityContext([])
		const input = "Use `execute_command` to run commands.\nUse `list_files` to explore."
		expect(stripDisabledToolReferences(input, ctx)).toBe(input)
	})

	it("removes bullet-point lines referencing disabled execute_command", () => {
		const ctx = new ToolAvailabilityContext(["execute_command"])
		const input = "Some instructions.\n- Use `execute_command` to run shell commands.\n- Use `list_files` to explore.\nMore text."
		const result = stripDisabledToolReferences(input, ctx)
		expect(result).not.toContain("execute_command")
		expect(result).toContain("list_files")
		expect(result).toContain("Some instructions.")
		expect(result).toContain("More text.")
	})

	it("removes bullet-point lines referencing disabled list_files", () => {
		const ctx = new ToolAvailabilityContext(["list_files"])
		const input = "Instructions:\n- Use `list_files` to list directory contents.\n- Use `read_file` to read files."
		const result = stripDisabledToolReferences(input, ctx)
		expect(result).not.toContain("list_files")
		expect(result).toContain("read_file")
	})

	it("handles multiple disabled tools", () => {
		const ctx = new ToolAvailabilityContext(["execute_command", "list_files"])
		const input = "Start.\n- Use `execute_command` for commands.\n- Use `list_files` for listing.\n- Use `read_file` for reading.\nEnd."
		const result = stripDisabledToolReferences(input, ctx)
		expect(result).not.toContain("execute_command")
		expect(result).not.toContain("list_files")
		expect(result).toContain("read_file")
		expect(result).toContain("Start.")
		expect(result).toContain("End.")
	})

	it("resolves aliases (search_and_replace -> edit)", () => {
		const ctx = new ToolAvailabilityContext(["search_and_replace"])
		const input = "Use `edit` to make changes.\nUse `read_file` to read."
		const result = stripDisabledToolReferences(input, ctx)
		expect(result).not.toContain("`edit`")
		expect(result).toContain("read_file")
	})

	it("does not over-strip text that happens to contain tool name in non-tool context", () => {
		// The patterns only match lines with backtick-wrapped tool names
		const ctx = new ToolAvailabilityContext(["edit"])
		const input = "The word edit appears in normal text.\n- Use `edit` for editing."
		const result = stripDisabledToolReferences(input, ctx)
		// The backtick-wrapped reference should be removed
		expect(result).not.toContain("`edit`")
		// But the plain text mention should remain (pattern requires backticks)
		expect(result).toContain("The word edit appears in normal text.")
	})

	it("collapses excessive blank lines after removals", () => {
		const ctx = new ToolAvailabilityContext(["execute_command"])
		const input = "Line 1.\n\n\n- Use `execute_command`.\n\n\nLine 2."
		const result = stripDisabledToolReferences(input, ctx)
		// Should not have 3+ consecutive newlines
		expect(result).not.toMatch(/\n{3,}/)
	})

	it("trims leading/trailing whitespace from result", () => {
		const ctx = new ToolAvailabilityContext(["execute_command"])
		const input = "- Use `execute_command`.\n- Use `read_file`."
		const result = stripDisabledToolReferences(input, ctx)
		expect(result).not.toMatch(/^\s/)
		expect(result).not.toMatch(/\s$/)
	})

	it("handles empty instructions string", () => {
		const ctx = new ToolAvailabilityContext(["execute_command"])
		expect(stripDisabledToolReferences("", ctx)).toBe("")
	})

	it("handles instructions with no tool references", () => {
		const ctx = new ToolAvailabilityContext(["execute_command"])
		const input = "Just some general instructions without any tool mentions."
		expect(stripDisabledToolReferences(input, ctx)).toBe(input)
	})
})
