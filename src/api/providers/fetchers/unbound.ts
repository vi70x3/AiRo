import axios from "axios"

import type { ModelInfo } from "@roo-code/types"

import { parseApiPrice } from "../../../shared/cost"

import { getHttpsProxyAgent, getHttpProxyAgent } from "../utils/proxy"

export async function getUnboundModels(apiKey?: string | null, proxyUrl?: string): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}

	try {
		const headers: Record<string, string> = {}

		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`
		}

		const config: any = { headers }
		if (proxyUrl) {
			config.httpsAgent = getHttpsProxyAgent(proxyUrl)
			config.httpAgent = getHttpProxyAgent(proxyUrl)
		}

		const response = await axios.get("https://api.getunbound.ai/models", config)
		const rawModels = response.data?.data ?? response.data

		for (const rawModel of rawModels) {
			const modelInfo: ModelInfo = {
				maxTokens: rawModel.max_output_tokens ?? 8192,
				contextWindow: rawModel.context_window ?? 200_000,
				supportsPromptCache: rawModel.supports_caching ?? false,
				supportsImages: rawModel.supports_vision ?? false,
				inputPrice: parseApiPrice(rawModel.input_price),
				outputPrice: parseApiPrice(rawModel.output_price),
				description: rawModel.description,
				cacheWritesPrice: parseApiPrice(rawModel.caching_price),
				cacheReadsPrice: parseApiPrice(rawModel.cached_price),
			}

			models[rawModel.id] = modelInfo
		}
	} catch (error) {
		console.error(`Error fetching Unbound models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
	}

	return models
}
