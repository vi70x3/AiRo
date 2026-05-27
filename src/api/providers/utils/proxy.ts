import { ProxyAgent as UndiciProxyAgent } from "undici"
import { HttpsProxyAgent } from "https-proxy-agent"
import { HttpProxyAgent } from "http-proxy-agent"

export function getUndiciProxyAgent(proxyUrl: string | undefined): UndiciProxyAgent | undefined {
	if (!proxyUrl) {
		return undefined
	}
	try {
		return new UndiciProxyAgent(proxyUrl)
	} catch (error) {
		console.error(`Failed to create Undici ProxyAgent for ${proxyUrl}:`, error)
		return undefined
	}
}

export function getHttpsProxyAgent(proxyUrl: string | undefined): HttpsProxyAgent<string> | undefined {
	if (!proxyUrl) {
		return undefined
	}
	try {
		return new HttpsProxyAgent(proxyUrl)
	} catch (error) {
		console.error(`Failed to create HttpsProxyAgent for ${proxyUrl}:`, error)
		return undefined
	}
}

export function getHttpProxyAgent(proxyUrl: string | undefined): HttpProxyAgent<string> | undefined {
	if (!proxyUrl) {
		return undefined
	}
	try {
		return new HttpProxyAgent(proxyUrl)
	} catch (error) {
		console.error(`Failed to create HttpProxyAgent for ${proxyUrl}:`, error)
		return undefined
	}
}

/**
 * Returns a fetch-compatible function that uses the provided proxy.
 * This can be passed to SDKs that accept a custom fetch implementation.
 */
export function getProxyFetch(proxyUrl: string | undefined) {
	const agent = getUndiciProxyAgent(proxyUrl)
	if (!agent) {
		return undefined
	}

	return (input: RequestInfo | URL, init?: RequestInit) => {
		return fetch(input, {
			...init,
			// @ts-ignore - undici dispatcher is compatible with dispatcher in some fetch implementations
			dispatcher: agent,
		})
	}
}
