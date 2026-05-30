import { describe, it, expect } from "vitest"
import { ToolAvailabilityContext } from "../tool-availability-context"

describe("ToolAvailabilityContext", () => {
	describe("constructor", () => {
		it("treats undefined as empty disabled set (all available)", () => {
			const ctx = new ToolAvailabilityContext(undefined)
			expect(ctx.isToolAvailable("execute_command")).toBe(true)
			expect(ctx.isToolAvailable("list_files")).toBe(true)
			expect(ctx.isToolDisabled("execute_command")).toBe(false)
		})

		it("treats null as empty disabled set (all available)", () => {
			const ctx = new ToolAvailabilityContext(null)
			expect(ctx.isToolAvailable("execute_command")).toBe(true)
		})

		it("treats empty array as all available", () => {
			const ctx = new ToolAvailabilityContext([])
			expect(ctx.isToolAvailable("execute_command")).toBe(true)
		})
	})

	describe("isToolAvailable / isToolDisabled", () => {
		it("returns true/false for disabled tools", () => {
			const ctx = new ToolAvailabilityContext(["execute_command"])
			expect(ctx.isToolAvailable("execute_command")).toBe(false)
			expect(ctx.isToolDisabled("execute_command")).toBe(true)
		})

		it("returns true for non-disabled tools", () => {
			const ctx = new ToolAvailabilityContext(["execute_command"])
			expect(ctx.isToolAvailable("list_files")).toBe(true)
			expect(ctx.isToolDisabled("list_files")).toBe(false)
		})

		it("handles multiple disabled tools", () => {
			const ctx = new ToolAvailabilityContext(["execute_command", "list_files"])
			expect(ctx.isToolAvailable("execute_command")).toBe(false)
			expect(ctx.isToolAvailable("list_files")).toBe(false)
			expect(ctx.isToolAvailable("read_file")).toBe(true)
		})
	})

	describe("alias resolution", () => {
		it("resolves alias to canonical tool (search_and_replace -> edit)", () => {
			const ctx = new ToolAvailabilityContext(["search_and_replace"])
			expect(ctx.isToolDisabled("edit")).toBe(true)
			expect(ctx.isToolAvailable("edit")).toBe(false)
		})

		it("resolves alias to canonical tool (write_file -> write_to_file)", () => {
			const ctx = new ToolAvailabilityContext(["write_file"])
			expect(ctx.isToolDisabled("write_to_file")).toBe(true)
			expect(ctx.isToolAvailable("write_to_file")).toBe(false)
		})

		it("resolves alias at construction time, not query time", () => {
			// Disabling the canonical name should also match the alias
			const ctx = new ToolAvailabilityContext(["edit"])
			expect(ctx.isToolDisabled("edit")).toBe(true)
		})
	})

	describe("hasAnyAvailable / areAllDisabled", () => {
		it("hasAnyAvailable returns true when some tools are disabled", () => {
			const ctx = new ToolAvailabilityContext(["execute_command"])
			expect(ctx.hasAnyAvailable()).toBe(true)
		})

		it("hasAnyAvailable returns true when no tools are disabled", () => {
			const ctx = new ToolAvailabilityContext([])
			expect(ctx.hasAnyAvailable()).toBe(true)
		})

		it("areAllDisabled returns false when some tools are available", () => {
			const ctx = new ToolAvailabilityContext(["execute_command"])
			expect(ctx.areAllDisabled()).toBe(false)
		})

		it("areAllDisabled returns true when all known tools are disabled", () => {
			const allTools = [
				"access_mcp_resource", "apply_diff", "apply_patch", "ask_followup_question",
				"attempt_completion", "async_task", "codebase_search", "execute_command",
				"generate_image", "list_files", "new_task", "read_command_output",
				"read_file", "run_slash_command", "skill", "search_replace",
				"edit_file", "edit", "search_files", "switch_mode",
				"update_todo_list", "write_to_file",
			]
			const ctx = new ToolAvailabilityContext(allTools)
			expect(ctx.areAllDisabled()).toBe(true)
		})
	})

	describe("getDisabledToolNames", () => {
		it("returns empty array when no tools disabled", () => {
			const ctx = new ToolAvailabilityContext([])
			expect(ctx.getDisabledToolNames()).toEqual([])
		})

		it("returns resolved canonical names", () => {
			const ctx = new ToolAvailabilityContext(["search_and_replace"])
			expect(ctx.getDisabledToolNames()).toEqual(["edit"])
		})

		it("returns all disabled tool names", () => {
			const ctx = new ToolAvailabilityContext(["execute_command", "list_files"])
			const names = ctx.getDisabledToolNames()
			expect(names).toContain("execute_command")
			expect(names).toContain("list_files")
			expect(names).toHaveLength(2)
		})
	})
})
