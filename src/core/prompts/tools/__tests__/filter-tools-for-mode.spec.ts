// npx vitest run core/prompts/tools/__tests__/filter-tools-for-mode.spec.ts

import type OpenAI from "openai"

import { filterNativeToolsForMode } from "../filter-tools-for-mode"

function makeTool(name: string): OpenAI.Chat.ChatCompletionTool {
	return {
		type: "function",
		function: {
			name,
			description: `${name} tool`,
			parameters: { type: "object", properties: {} },
		},
	} as OpenAI.Chat.ChatCompletionTool
}

describe("filterNativeToolsForMode - disabledTools", () => {
	const nativeTools: OpenAI.Chat.ChatCompletionTool[] = [
		makeTool("execute_command"),
		makeTool("read_file"),
		makeTool("write_to_file"),
		makeTool("apply_diff"),
		makeTool("edit"),
	]

	it("removes tools listed in settings.disabledTools", () => {
		const settings = {
			disabledTools: ["execute_command"],
		}

		const result = filterNativeToolsForMode(nativeTools, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).not.toContain("execute_command")
		expect(resultNames).toContain("read_file")
		expect(resultNames).toContain("write_to_file")
		expect(resultNames).toContain("apply_diff")
	})

	it("does not remove any tools when disabledTools is empty", () => {
		const settings = {
			disabledTools: [],
		}

		const result = filterNativeToolsForMode(nativeTools, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).toContain("execute_command")
		expect(resultNames).toContain("read_file")
		expect(resultNames).toContain("write_to_file")
		expect(resultNames).toContain("apply_diff")
	})

	it("does not remove any tools when disabledTools is undefined", () => {
		const settings = {}

		const result = filterNativeToolsForMode(nativeTools, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).toContain("execute_command")
		expect(resultNames).toContain("read_file")
	})

	it("combines disabledTools with other setting-based exclusions", () => {
		const settings = {
			disabledTools: ["execute_command"],
		}

		const result = filterNativeToolsForMode(nativeTools, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).not.toContain("execute_command")
		expect(resultNames).toContain("read_file")
	})

	it("disables canonical tool when disabledTools contains alias name", () => {
		const settings = {
			disabledTools: ["search_and_replace"],
			modelInfo: {
				includedTools: ["search_and_replace"],
			},
		}

		const result = filterNativeToolsForMode(nativeTools, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).not.toContain("search_and_replace")
		expect(resultNames).not.toContain("edit")
	})
})

describe("filterNativeToolsForMode - modeSwitchingEnabled", () => {
	const nativeToolsWithSwitch: OpenAI.Chat.ChatCompletionTool[] = [
		makeTool("execute_command"),
		makeTool("read_file"),
		makeTool("switch_mode"),
		makeTool("write_to_file"),
	]

	it("removes switch_mode when modeSwitchingEnabled is false", () => {
		const settings = {
			modeSwitchingEnabled: false,
		}

		const result = filterNativeToolsForMode(nativeToolsWithSwitch, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).not.toContain("switch_mode")
		expect(resultNames).toContain("execute_command")
		expect(resultNames).toContain("read_file")
	})

	it("includes switch_mode when modeSwitchingEnabled is true", () => {
		const settings = {
			modeSwitchingEnabled: true,
		}

		const result = filterNativeToolsForMode(nativeToolsWithSwitch, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).toContain("switch_mode")
	})

	it("includes switch_mode when modeSwitchingEnabled is undefined (default behavior)", () => {
		const settings = {}

		const result = filterNativeToolsForMode(nativeToolsWithSwitch, "code", undefined, undefined, undefined, settings)

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).toContain("switch_mode")
	})
})

describe("filterNativeToolsForMode - asyncSubtasks experiment", () => {
	const nativeTools: OpenAI.Chat.ChatCompletionTool[] = [
		makeTool("async_task"),
		makeTool("new_task"),
		makeTool("read_file"),
	]

	it("removes async_task when asyncSubtasks experiment is disabled", () => {
		const experiments = {
			asyncSubtasks: false,
		}

		const result = filterNativeToolsForMode(nativeTools, "orchestrator", undefined, experiments, undefined, {})

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).not.toContain("async_task")
		expect(resultNames).toContain("new_task")
	})

	it("removes async_task when experiments are undefined", () => {
		const result = filterNativeToolsForMode(nativeTools, "orchestrator", undefined, undefined, undefined, {})

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).not.toContain("async_task")
		expect(resultNames).toContain("new_task")
	})

	it("includes async_task when asyncSubtasks experiment is enabled", () => {
		const experiments = {
			asyncSubtasks: true,
		}

		const result = filterNativeToolsForMode(nativeTools, "orchestrator", undefined, experiments, undefined, {})

		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).toContain("async_task")
		expect(resultNames).toContain("new_task")
	})

	it("removes new_task and async_task for standard modes", () => {
		const experiments = {
			asyncSubtasks: true,
		}

		const standardModes = ["code", "architect", "ask", "debug"]
		standardModes.forEach((mode) => {
			const result = filterNativeToolsForMode(nativeTools, mode, undefined, experiments, undefined, {})
			const resultNames = result.map((t) => (t as any).function.name)
			expect(resultNames).not.toContain("new_task")
			expect(resultNames).not.toContain("async_task")
		})
	})

	it("includes new_task and async_task for custom modes", () => {
		const experiments = {
			asyncSubtasks: true,
		}
		const customModes = [
			{
				slug: "custom-mode",
				name: "Custom Mode",
				roleDefinition: "Custom role",
				groups: ["read"] as const,
			},
		]

		const result = filterNativeToolsForMode(nativeTools, "custom-mode", customModes, experiments, undefined, {})
		const resultNames = result.map((t) => (t as any).function.name)
		expect(resultNames).toContain("new_task")
		expect(resultNames).toContain("async_task")
	})
})
