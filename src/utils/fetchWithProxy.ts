/**
 * Fetch with Proxy Utility
 *
 * Provides a fetch function that routes HTTP/HTTPS requests through a proxy server.
 * Uses undici's ProxyAgent for proxy support.
 */

import { ProxyAgent } from "undici"

/**
 * Create a fetch function that routes requests through a proxy.
 *
 * @param proxyUrl The proxy server URL (e.g., http://127.0.0.1:8888)
 * @returns A fetch function that routes requests through the proxy, or undefined if no proxy URL is provided
 */
export function createFetchWithProxy(proxyUrl: string | undefined): typeof fetch | undefined {
	if (!proxyUrl) {
		return undefined
	}

	try {
		const proxyAgent = new ProxyAgent({
			uri: proxyUrl,
		})

		return (input: string | URL | Request, init?: RequestInit) => {
			return fetch(input, {
				...init,
				dispatcher: proxyAgent,
			} as RequestInit)
		}
	} catch (error) {
		console.error(`[fetchWithProxy] Failed to create proxy agent for ${proxyUrl}:`, error)
		return undefined
	}
}
