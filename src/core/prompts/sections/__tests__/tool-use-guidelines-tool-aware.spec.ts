import { describe, it, expect } from "vitest"
import { getToolUseGuidelinesSection } from "../tool-use-guidelines"
import { ToolAvailabilityContext } from "../../tools/tool-availability-context"

describe("getToolUseGuidelinesSection - tool aware", () => {
	it("produces original content when toolContext is undefined", () => {
		const result = getToolUseGuidelinesSection(undefined)
		expect(result).toContain("list_files tool")
		expect(result).toContain("`ls`")
	})

	it("produces original content when no tools are disabled", () => {
		const ctx = new ToolAvailabilityContext([])
		const result = getToolUseGuidelinesSection(ctx)
		expect(result).toContain("list_files tool")
	})

	it("uses list_files example when list_files is available", () => {
		const ctx = new ToolAvailabilityContext(["execute_command"])
		const result = getToolUseGuidelinesSection(ctx)
		expect(result).toContain("list_files tool")
		expect(result).toContain("`ls`")
	})

	it("falls back to read_file example when list_files is disabled", () => {
		const ctx = new ToolAvailabilityContext(["list_files"])
		const result = getToolUseGuidelinesSection(ctx)
		expect(result).toContain("read_file tool")
		expect(result).toContain("`cat`")
		expect(result).not.toContain("list_files tool")
	})

	it("falls back to search_files example when list_files and read_file are disabled", () => {
		const ctx = new ToolAvailabilityContext(["list_files", "read_file"])
		const result = getToolUseGuidelinesSection(ctx)
		expect(result).toContain("search_files tool")
		expect(result).toContain("`grep`")
	})

	it("falls back to execute_command example when list_files, read_file, search_files are disabled", () => {
		const ctx = new ToolAvailabilityContext(["list_files", "read_file", "search_files"])
		const result = getToolUseGuidelinesSection(ctx)
		expect(result).toContain("execute_command tool")
		expect(result).toContain("complex operations directly")
	})

	it("omits example sentence when all example tools are disabled", () => {
		const ctx = new ToolAvailabilityContext(["list_files", "read_file", "search_files", "execute_command"])
		const result = getToolUseGuidelinesSection(ctx)
		expect(result).not.toContain("list_files")
		expect(result).not.toContain("read_file")
		expect(result).not.toContain("search_files")
		expect(result).not.toContain("execute_command")
		// The guidelines should still have the core content
		expect(result).toContain("Assess what information you already have")
		expect(result).toContain("Choose the most appropriate tool")
	})

	it("always includes the core guideline structure", () => {
		const ctx = new ToolAvailabilityContext([])
		const result = getToolUseGuidelinesSection(ctx)
		expect(result).toContain("# Tool Use Guidelines")
		expect(result).toContain("1.")
		expect(result).toContain("2.")
		expect(result).toContain("3.")
	})
})
