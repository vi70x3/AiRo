import { EXPERIMENT_IDS, experimentConfigsMap, experimentDefault, experiments } from "../experiments"

describe("ASYNC_SUBTASKS experiment", () => {
	it("should include ASYNC_SUBTASKS in EXPERIMENT_IDS", () => {
		expect(EXPERIMENT_IDS.ASYNC_SUBTASKS).toBe("asyncSubtasks")
	})

	it("should have ASYNC_SUBTASKS in experimentConfigsMap", () => {
		expect(experimentConfigsMap.ASYNC_SUBTASKS).toBeDefined()
		expect(experimentConfigsMap.ASYNC_SUBTASKS.enabled).toBe(false)
	})

	it("should have ASYNC_SUBTASKS in experimentDefault", () => {
		expect(experimentDefault.asyncSubtasks).toBe(false)
	})

	it("should correctly check if ASYNC_SUBTASKS is enabled", () => {
		// Test when experiment is disabled (explicit override)
		const disabledConfig = { asyncSubtasks: false }
		expect(experiments.isEnabled(disabledConfig, EXPERIMENT_IDS.ASYNC_SUBTASKS)).toBe(false)

		// Test when experiment is enabled
		const enabledConfig = { asyncSubtasks: true }
		expect(experiments.isEnabled(enabledConfig, EXPERIMENT_IDS.ASYNC_SUBTASKS)).toBe(true)

		// Test when experiment is not in config (should use default, which is false)
		const emptyConfig = {}
		expect(experiments.isEnabled(emptyConfig, EXPERIMENT_IDS.ASYNC_SUBTASKS)).toBe(false)
	})
})
