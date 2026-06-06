# Runtime Compatibility Report: `crypto.randomUUID()` in Swarm Architecture

**Phase 3 — RuntimeCompatibilityAgent**
**Date:** 2025-07-01

---

## 1. Executive Summary

The project pins Node.js to **20.19.2**, which fully supports `crypto.randomUUID()` natively. All usages are **compatible** with the runtime. However, the codebase exhibits **inconsistent ID generation patterns**, mixing `crypto.randomUUID()`, the `uuid` npm package, and `Math.random().toString(36)` across different modules.

**Verdict: ✅ COMPATIBLE** — No runtime errors expected.

---

## 2. All Files Using `crypto.randomUUID()`

### Primary Scope (7 files requested)

| File | Call Sites | Line(s) | Purpose |
|------|-----------|---------|---------|
| `src/core/swarm/coordinator/plan-creation.ts` | 3 | 93, 100, 198 | Task IDs, Plan IDs, Checkpoint IDs |
| `src/core/swarm/agent/conflict-strategies.ts` | 1 | 249 | Resolution message IDs |
| `src/core/swarm/worktree-manager/conflict-resolver.ts` | 5 | 202, 229, 238, 272, 314 | Negotiation IDs, DM message IDs, escalation message IDs |
| `src/core/swarm/coordinator/coordinator.ts` | 1 | 57 | Initial plan ID |
| `src/core/swarm/coordinator/spawn-manager.ts` | 2 | 85, 108 | Worktree manager IDs, Agent IDs |
| `src/core/swarm/coordinator/lifecycle-tracker.ts` | 2 | 62, 223 | Lifecycle event IDs |
| `src/core/swarm/worktree-manager/cross-worktree-coordinator.ts` | 0 | — | Uses `Math.random().toString(36)` instead |

### Additional Files Discovered (outside original scope)

| File | Call Sites | Line(s) | Purpose |
|------|-----------|---------|---------|
| `src/core/swarm/worktree-manager/conflict-detector.ts` | 2 | 104, 150 | Conflict IDs |

**Total: 16 call sites across 8 files**

---

## 3. Detailed Call Site Breakdown

### `src/core/swarm/coordinator/plan-creation.ts`
```typescript
// Line 93 — generateTaskId()
`task-${this.taskIdCounter}-${crypto.randomUUID().slice(0, 8)}`

// Line 100 — generatePlanId()
`plan-${crypto.randomUUID()}`

// Line 198 — createCheckpoints()
`checkpoint-${crypto.randomUUID().slice(0, 8)}`
```

### `src/core/swarm/agent/conflict-strategies.ts`
```typescript
// Line 249 — reportResolution()
messageId: crypto.randomUUID()
```

### `src/core/swarm/worktree-manager/conflict-resolver.ts`
```typescript
// Line 202 — initiateNegotiation()
const negotiationId = crypto.randomUUID()

// Line 229 — initiateNegotiation() DM to agent A
messageId: crypto.randomUUID()

// Line 238 — initiateNegotiation() DM to agent B
messageId: crypto.randomUUID()

// Line 272 — escalateToCoordinator()
messageId: crypto.randomUUID()

// Line 314 — checkNegotiationTimeouts()
messageId: crypto.randomUUID()
```

### `src/core/swarm/coordinator/coordinator.ts`
```typescript
// Line 57 — createInitialPlan()
planId: crypto.randomUUID()
```

### `src/core/swarm/coordinator/spawn-manager.ts`
```typescript
// Line 85 — spawnWorktreeManager()
const wmId = crypto.randomUUID()

// Line 108 — spawnAgent()
const agentId = crypto.randomUUID()
```

### `src/core/swarm/coordinator/lifecycle-tracker.ts`
```typescript
// Line 62 — trackStateChange()
eventId: crypto.randomUUID()

// Line 223 — handleTerminalState()
eventId: crypto.randomUUID()
```

### `src/core/swarm/worktree-manager/conflict-detector.ts`
```typescript
// Line 104 — detectFromTouch()
conflictId: crypto.randomUUID()

// Line 150 — detectFromIntent()
conflictId: crypto.randomUUID()
```

---

## 4. Runtime Environment Analysis

### Node.js Version Requirements

| Source | `engines` Field |
|--------|----------------|
| Root `package.json` | `"node": "20.19.2"` |
| `src/package.json` | `"node": "20.19.2"`, `"vscode": "^1.84.0"` |

**Project requires Node.js 20.19.2** (pinned, not a range).

### TypeScript Configuration (`src/tsconfig.json`)

| Setting | Value |
|---------|-------|
| `target` | `ES2022` |
| `lib` | `["es2022", "esnext.disposable", "DOM"]` |
| `module` | `esnext` |
| `moduleResolution` | `Bundler` |

The `"DOM"` lib inclusion provides TypeScript type definitions for the Web Crypto API, including `crypto.randomUUID()`.

### `crypto.randomUUID()` Availability

| Milestone | Node.js Version |
|-----------|----------------|
| Experimental (behind `--experimental-webcrypto`) | Node 15.x |
| Stable on `crypto` module | Node 16.7+ |
| Available on `globalThis.crypto` | Node 19+ |
| **Project's pinned version** | **Node 20.19.2** ✅ |

---

## 5. Polyfill / Fallback Analysis

**No polyfill or fallback mechanism exists.** All usages call `crypto.randomUUID()` directly without:
- Feature detection (`typeof crypto !== 'undefined'`)
- Try/catch with fallback
- Abstraction layer or utility wrapper
- Conditional import of the `uuid` package as backup

The project relies entirely on the native implementation being available.

---

## 6. Inconsistent ID Generation Patterns

The swarm codebase uses **three different ID generation strategies** across modules:

| Strategy | Files | Method |
|----------|-------|--------|
| `crypto.randomUUID()` | 8 files (see §2) | Native Web Crypto API |
| `uuid` npm package (`uuidv4()`) | `src/core/swarm/agent/agent.ts` | `import { v4 as uuidv4 } from 'uuid'` |
| `Math.random().toString(36)` | `daemon.ts`, `cross-worktree-coordinator.ts`, `plan-distributor.ts` | Non-cryptographic random |

The `uuid` package (v11.1.0) is listed in `src/package.json` dependencies but is only used in `agent.ts`. This inconsistency suggests the swarm modules were developed incrementally without a unified ID generation strategy.

---

## 7. Recommendations

1. **No immediate action required** — Node 20.19.2 fully supports `crypto.randomUUID()`.
2. **Standardize ID generation** — Consider creating a shared `generateId()` utility to replace the three current strategies. This would:
   - Provide a single point of control for ID format changes
   - Allow easy swapping of the underlying implementation
   - Ensure consistent ID entropy across the codebase
3. **Add a fallback** — If the project ever needs to support Node < 16.7, wrap `crypto.randomUUID()` with a fallback to the `uuid` package (already in dependencies).

---

## 8. Risk Assessment

| Risk | Level | Notes |
|------|-------|-------|
| Runtime incompatibility | **None** | Node 20.19.2 >> Node 16.7 minimum |
| Missing polyfill | **Low** | Not needed for current engine |
| Inconsistent ID generation | **Medium** | Maintenance concern, not runtime |
| Type safety | **Low** | `DOM` lib provides types |
