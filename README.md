<p align="center">
  <a href="https://github.com/vi70x3/airo/releases">
    <img src="https://img.shields.io/github/downloads/vi70x3/airo/total?style=flat&logo=vscode" alt="Latest Nightly Release">
  </a>  
</p>

# AiRo Code

<details>
<summary> <h4> ⚠️ Show Disclaimer </h4> </summary>
  
**SECURITY NOTICE:** This fork is optimized for complete automation. Because it bypasses all manual confirmation prompts, it is recommended to run it within an isolated environment, such as a dedicated `code-server` instance or a secure graphical container with VSCode.

</details>

## Key Differences in This Fork
*   **Spec-driven by default:** Replaces Architect mode with [Kiro](http://kiro.dev/)-style Spec mode and Code mode with Vibe mode with appropriate prompt engineering.
*   **Streamlined Automation:** Removes the restrictive "Roo is having trouble" halts to prevent interrupted automation runs.
*   **Instance Separation:** Isolates modes and model configurations per instance, allowing you to run multiple independent AiRo tabs side-by-side.
*   **Asynchronous Subtasks (Alpha, enable in experimental settings):** Introduces the `async_task` toolset to run subtasks concurrently. Each subtask opens in a new editor tab, utilizing git worktrees and merging automatically upon completion.
    *   *Note:* `new_task` and `async_task` are restricted to the Orchestrator or custom modes (not available in standard Vibe, Spec, Ask, or Debug modes).
    *   [ ] Integration with [superpowers](https://github.com/obra/superpowers)
*   **Mode-Switch Control:** Adds a master toggle in settings to gate agent-initiated mode-switch requests (enabled by default; can be disabled for subtask-delegated workflows).
*   **Permissive Defaults:** Enables automated task execution with fewer confirmation prompts by default.
*   **Planned Integration:** 
    *   [ ] Integration with [vi70x3/airi](https://github.com/vi70x3/airi) to append AiRo context snapshots to AIRI heartbeats.

---

## Core Capabilities

*   **Code Generation:** Write code from natural language prompts and specifications.
*   **Context-Aware Modes:** Adapt the assistant's behavior using Code, Architect, Ask, Debug, or Custom modes.
*   **Refactoring & Debugging:** Analyze existing codebases, isolate bugs, and apply fixes.
*   **Documentation:** Generate and maintain inline comments, READMEs, and technical documents.
*   **MCP Support:** Extend functionality using Model Context Protocol (MCP) servers.

---

## Included Modes

AiRo Code tailors its system prompts based on your current task:

*   **Code Mode:** For standard development, editing, and file operations.
*   **Architect Mode:** For system design, planning, and structural changes.
*   **Ask Mode:** For querying the codebase, clarifying concepts, and documentation.
*   **Debug Mode:** For tracing errors, examining logs, and diagnosing issues.
*   **Custom Modes:** For defining specialized instructions tailored to your team's specific workflow.

Learn more: [Using Modes](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes) • [Custom Modes](https://roocodeinc.github.io/Roo-Code/advanced-usage/custom-modes)

---

## Resources

*   **[Documentation](https://roocodeinc.github.io/AiRo-Code/):** Guides for installation, configuration, and feature usage.
