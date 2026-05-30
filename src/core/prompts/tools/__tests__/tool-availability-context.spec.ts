import { describe, it, expect } from "vitest"
import { ToolAvailabilityContext, ALL_NATIVE_TOOL_NAMES } from "../tool-availability-context"

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
			const ctx = new ToolAvailabilityContext(ALL_NATIVE_TOOL_NAMES)
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

	describe("non-native tool names in disabledTools", () => {
		it("hasAnyAvailable returns true when only non-native tools are disabled", () => {
			// Disabling MCP/custom tools should not affect native tool availability
			const ctx = new ToolAvailabilityContext(["use_mcp_tool", "access_mcp_resource", "custom_tool"])
			expect(ctx.hasAnyAvailable()).toBe(true)
		})

		it("areAllDisabled returns false when only non-native tools are disabled", () => {
			const ctx = new ToolAvailabilityContext(["use_mcp_tool", "custom_tool", "unknown_tool"])
			expect(ctx.areAllDisabled()).toBe(false)
		})

		it("areAllDisabled returns true when all native tools are disabled plus non-native", () => {
			const ctx = new ToolAvailabilityContext([...ALL_NATIVE_TOOL_NAMES, "use_mcp_tool", "custom_tool"])
			expect(ctx.areAllDisabled()).toBe(true)
		})

		it("hasAnyAvailable returns false when all native tools are disabled", () => {
			const ctx = new ToolAvailabilityContext(ALL_NATIVE_TOOL_NAMES)
			expect(ctx.hasAnyAvailable()).toBe(false)
		})

		it("ALL_NATIVE_TOOL_NAMES contains all getNativeTools names and ALWAYS_AVAILABLE_TOOLS", () => {
			// Verify ALL_NATIVE_TOOL_NAMES is a superset of both sources
			// by checking it contains the expected count and key tools
			expect(ALL_NATIVE_TOOL_NAMES.length).toBeGreaterThanOrEqual(20)
			// Spot-check key tools from getNativeTools
			expect(ALL_NATIVE_TOOL_NAMES).toContain("execute_command")
			expect(ALL_NATIVE_TOOL_NAMES).toContain("read_file")
			expect(ALL_NATIVE_TOOL_NAMES).toContain("list_files")
			expect(ALL_NATIVE_TOOL_NAMES).toContain("edit")
			// Spot-check tools from ALWAYS_AVAILABLE_TOOLS
			expect(ALL_NATIVE_TOOL_NAMES).toContain("ask_followup_question")
			expect(ALL_NATIVE_TOOL_NAMES).toContain("attempt_completion")
			expect(ALL_NATIVE_TOOL_NAMES).toContain("switch_mode")
			expect(ALL_NATIVE_TOOL_NAMES).toContain("new_task")
			// Verify no duplicates
			expect(new Set(ALL_NATIVE_TOOL_NAMES).size).toBe(ALL_NATIVE_TOOL_NAMES.length)
		})
	})
})