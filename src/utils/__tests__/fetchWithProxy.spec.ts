import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createFetchWithProxy } from "../fetchWithProxy"

// Mock the undici ProxyAgent
vi.mock("undici", () => ({
	ProxyAgent: vi.fn().mockImplementation(({ uri }: { uri: string }) => ({
		uri,
	})),
}))

describe("fetchWithProxy", () => {
	const originalFetch = globalThis.fetch

	afterEach(() => {
		globalThis.fetch = originalFetch
		vi.restoreAllMocks()
	})

	it("should return undefined when no proxy URL is provided", () => {
		const result = createFetchWithProxy(undefined)
		expect(result).toBeUndefined()
	})

	it("should return undefined when empty proxy URL is provided", () => {
		const result = createFetchWithProxy("")
		expect(result).toBeUndefined()
	})

	it("should return a fetch function when proxy URL is provided", () => {
		const result = createFetchWithProxy("http://127.0.0.1:8888")
		expect(result).toBeDefined()
		expect(typeof result).toBe("function")
	})

	it("should use ProxyAgent with the provided proxy URL", async () => {
		const { ProxyAgent } = await import("undici")
		const proxyUrl = "http://proxy.example.com:3128"

		const mockFetch = vi.fn().mockResolvedValue(new Response("test"))
		globalThis.fetch = mockFetch

		const fetchFn = createFetchWithProxy(proxyUrl)
		expect(fetchFn).toBeDefined()

		await fetchFn!("https://api.example.com/v1/chat", {
			method: "POST",
			body: JSON.stringify({ test: true }),
		})

		expect(ProxyAgent).toHaveBeenCalledWith({ uri: proxyUrl })
		expect(mockFetch).toHaveBeenCalledWith(
			"https://api.example.com/v1/chat",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ test: true }),
			})
		)
	})

	it("should handle ProxyAgent creation errors gracefully", async () => {
		const { ProxyAgent } = await import("undici")
		;(ProxyAgent as any).mockImplementationOnce(() => {
			throw new Error("Invalid proxy URL")
		})

		const result = createFetchWithProxy("invalid-url")
		expect(result).toBeUndefined()
	})
})
