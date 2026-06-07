import React from "react"

import { render, screen } from "@/utils/test-utils"

import Announcement from "../Announcement"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("@roo/package", () => ({
	Package: {
		version: "3.53.0",
	},
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeLink: ({ children, href, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a href={href} onClick={onClick} {...props}>
			{children}
		</a>
	),
}))

vi.mock("react-i18next", () => ({
	Trans: ({ i18nKey }: { i18nKey: string; components?: Record<string, React.ReactElement> }) => {
		if (i18nKey === "chat:announcement.finalRelease.intro") {
			return (
				<span>
					This release brings powerful new capabilities: <strong>Swarm Architecture</strong> for structured
					multi-agent coordination with crash recovery, intent avoidance, and semantic conflict detection;{" "}
					<strong>Semantic Loop Detection</strong> that identifies reasoning loops and wandering behaviors,
					auto-condensing context on model switch; <strong>Asynchronous Subtasks</strong> (Alpha) for
					concurrent parallel task execution with automatic git worktree merging; and{" "}
					<strong>Spec-driven development</strong> with Kiro-style Spec mode replacing Architect mode.
				</span>
			)
		}

		if (i18nKey === "chat:announcement.finalRelease.alternatives") {
			return (
				<span>
					Explore the full feature set including Vibe, Spec, Ask, Debug, and Custom modes, MCP support, and the
					new Tools Control settings panel.
				</span>
			)
		}

		return <span>{i18nKey}</span>
	},
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: { version?: string }) => {
			const translations: Record<string, string> = {
				"chat:announcement.finalRelease.title": "New Features in airiOS Code",
				"chat:announcement.finalRelease.continuity":
					"airiOS Code continues to evolve with new features, model provider updates, and community contributions. Stay tuned for more!",
				"chat:announcement.finalRelease.signoff": "Happy coding!",
			}

			if (key === "chat:announcement.finalRelease.title") {
				return `${translations[key]}${options?.version ? "" : ""}`
			}

			return translations[key] ?? key
		},
	}),
}))

describe("Announcement", () => {
	it("renders the new features announcement", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByText("New Features in airiOS Code")).toBeInTheDocument()
		expect(screen.getByText(/This release brings powerful new capabilities/)).toBeInTheDocument()
		expect(
			screen.getByText(
				"airiOS Code continues to evolve with new features, model provider updates, and community contributions. Stay tuned for more!",
			),
		).toBeInTheDocument()
		expect(screen.getByText("Happy coding!")).toBeInTheDocument()
	})

	it("renders feature highlights", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByText(/Swarm Architecture/)).toBeInTheDocument()
		expect(screen.getByText(/Semantic Loop Detection/)).toBeInTheDocument()
		expect(screen.getByText(/Asynchronous Subtasks/)).toBeInTheDocument()
		expect(screen.getByText(/Spec-driven development/)).toBeInTheDocument()
	})

	it("renders the alternatives text", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(
			screen.getByText(
				/Explore the full feature set including Vibe, Spec, Ask, Debug, and Custom modes/,
			),
		).toBeInTheDocument()
	})
})
