import { describe, it, expect } from "vitest"
import { formatResponse } from "../responses"

describe("formatResponse.noToolsUsed - tool aware", () => {
	it("includes both attempt_completion and ask_followup_question when no tools disabled", () => {
		const result = formatResponse.noToolsUsed()
		expect(result).toContain("attempt_completion")
		expect(result).toContain("ask_followup_question")
		expect(result).toContain("Otherwise, if you have not completed the task")
	})

	it("includes both tools when disabledTools is undefined", () => {
		const result = formatResponse.noToolsUsed(undefined)
		expect(result).toContain("attempt_completion")
		expect(result).toContain("ask_followup_question")
	})

	it("includes both tools when disabledTools is empty", () => {
		const result = formatResponse.noToolsUsed([])
		expect(result).toContain("attempt_completion")
		expect(result).toContain("ask_followup_question")
	})

	it("removes attempt_completion line when it is disabled", () => {
		const result = formatResponse.noToolsUsed(["attempt_completion"])
		expect(result).not.toContain("use the attempt_completion tool")
		expect(result).toContain("ask_followup_question")
		expect(result).toContain("Otherwise, if you have not completed the task")
	})

	it("removes ask_followup_question line when it is disabled", () => {
		const result = formatResponse.noToolsUsed(["ask_followup_question"])
		expect(result).toContain("attempt_completion")
		expect(result).not.toContain("use the ask_followup_question tool")
		expect(result).toContain("Otherwise, if you have not completed the task")
	})

	it("uses generic fallback when both attempt_completion and ask_followup_question are disabled", () => {
		const result = formatResponse.noToolsUsed(["attempt_completion", "ask_followup_question"])
		expect(result).not.toContain("use the attempt_completion tool")
		expect(result).not.toContain("use the ask_followup_question tool")
		expect(result).toContain("Proceed with the next step of the task")
		expect(result).not.toContain("Otherwise, if you have not completed the task")
	})

	it("always includes the error header and instructions reminder", () => {
		const result = formatResponse.noToolsUsed()
		expect(result).toContain("[ERROR] You did not use a tool in your previous response!")
		expect(result).toContain("Reminder: Instructions for Tool Use")
		expect(result).toContain("# Next Steps")
	})
})
