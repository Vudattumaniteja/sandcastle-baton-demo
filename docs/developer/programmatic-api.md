# Programmatic API Reference

Sandcastle can be imported and executed as a typed TypeScript/JavaScript library in any Node.js (>= 18.0.0) application, CI script, or agent harness.

---

## Context Pointers

| Document | Description | Reached When |
| :--- | :--- | :--- |
| [overview.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/architecture/overview.md) | High-level system architecture and modular layer breakdown. | Seeking architectural design context. |
| [baton-orchestrator.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/architecture/baton-orchestrator.md) | Deep dive into `BatonRunner` state machine and event maps. | Handling granular runner events. |
| [gating-and-safety.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/architecture/gating-and-safety.md) | Deep dive into `GatingEvaluator` and the 4 Baton Gates. | Customizing gating logic or label policies. |
| [contributing.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/developer/contributing.md) | Contributor setup, build pipeline, and tests. | Developing or contributing to Sandcastle. |

---

## Installation & Import

```bash
npm install sandcastle
```

### Module Import
```typescript
import {
  BatonRunner,
  GatingEvaluator,
  ProcessSupervisor,
  TranscriptTailer,
  GitHubService,
  AntigravityService,
  ConfigService,
  DoctorService,
  VERSION,
} from 'sandcastle';
```

---

## Core Classes & Services Reference

### 1. `BatonRunner`
The primary orchestrator managing sequential issue execution.

#### Constructor
```typescript
const runner = new BatonRunner(options?: BatonRunnerOptions);
```

#### Methods
- **`run(): Promise<BatonFinishPayload>`**: Executes the sequential issue baton state machine.
- **`on<E extends keyof BatonEventMap>(event: E, listener: BatonEventMap[E]): this`**: Registers typed event listeners.

#### Key Options (`BatonRunnerOptions`)
| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `issues` | `number[]` | `undefined` | Explicit list of issue numbers to process in order. |
| `all` | `boolean` | `false` | When true, fetches and executes all open ready issues in backlog order. |
| `repo` | `string` | Auto-detected | Target GitHub repository (`owner/repo`). |
| `mode` | `'afk' \| 'supervised' \| 'dry-run'` | `'afk'` | Execution mode. |
| `model` | `string` | `'Gemini 3.7 Flash'` | LLM model identifier or alias. |
| `reasoningEffort` | `'low' \| 'medium' \| 'high'` | `'high'` | Model reasoning effort level. |
| `timeout` | `string` | `'30m'` | Execution timeout per issue (e.g. `'30m'`, `'45m'`). |
| `retries` | `number` | `2` | Max retries per issue upon test/verification failure (total 3 attempts). |
| `autoPr` | `boolean` | `true` | Automatically create Pull Request upon test verification. |
| `autoMerge` | `boolean` | `true` | Automatically merge Pull Request upon creation. |
| `cwd` | `string` | `process.cwd()` | Working directory of the target repository. |
| `signal` | `AbortSignal` | `undefined` | AbortSignal to cancel execution. |

---

### 2. `GatingEvaluator`
Validates issue gates and builds prerequisite dependency graphs in memory.

#### Constructor
```typescript
const evaluator = new GatingEvaluator(options?: { githubService?: GitHubService });
```

#### Methods
- **`parsePrerequisites(body: string): number[]`**: Parses prerequisite issue numbers from markdown text.
- **`evaluateIssue(issue: GitHubIssue, repo?: string, backlogMap?: Map<number, GitHubIssue>): Promise<GatingEvaluation>`**: Evaluates the 4 Baton Gates for a single issue.
- **`evaluateBacklog(issues: GitHubIssue[], repo?: string): Promise<Map<number, GatingEvaluation>>`**: In-memory evaluation of an entire backlog batch.

---

### 3. `ProcessSupervisor`
Supervises isolated subagent processes with dual timeouts, retries, and quota backoff.

#### Constructor
```typescript
const supervisor = new ProcessSupervisor(options?: ProcessSupervisorOptions);
```

#### Key Methods
- **`execute(options: AntigravityWorkerOptions, parentSignal?: AbortSignal): Promise<SuperviseResult>`**: Executes a worker with retries and quota resilience.
- **`isQuotaError(result: { exitCode?: number; stderr?: string; stdout?: string }): boolean`**: Checks if output represents an HTTP 429 quota exhaustion.
- **`resolveQuotaDelayMs(): Promise<number>`**: Reads `reset_in_seconds` from statusline snapshot.

---

### 4. `TranscriptTailer`
Incrementally polls and extracts real-time thoughts, tool calls, and tokens from JSONL logs.

#### Constructor
```typescript
const tailer = new TranscriptTailer(options?: TranscriptTailerOptions);
```

#### Methods & Events
- **`start(): this`**: Begins periodic polling of the active transcript.
- **`stop(): void`**: Stops polling timer.
- **`getSummary(): TranscriptSummary`**: Returns current aggregated stream summary.
- **`on('step', (step: TranscriptStep) => void)`**: Emits every parsed step.
- **`on('thought', (thought: string) => void)`**: Emits live agent reasoning text.
- **`on('tool_call', (toolCall: ParsedToolCall) => void)`**: Emits parsed tool invocations.
- **`on('tokens', (usage: { total?: number }) => void)`**: Emits token updates.

---

### 5. `GitHubService`
High-level wrapper around GitHub CLI (`gh`).

```typescript
const gh = new GitHubService({ repo?: string });

const repo = await gh.getRepo();
const isAuthed = await gh.checkAuth();
const issue = await gh.getIssue(42);
const openIssues = await gh.listIssues({ state: 'open' });
await gh.addLabels(42, ['status blocked']);
await gh.reportBlocker({ issueNumber: 42, reason: 'Test failed', evidence: '...' });
```

---

## TypeScript Contracts & Interfaces

### `BatonFinishPayload`
```typescript
export interface BatonFinishPayload {
  success: boolean;
  totalProcessed: number;
  closedIssues: number[];
  blockedIssues: number[];
  durationMs: number;
}
```

### `GatingEvaluation`
```typescript
export type GatingStatus = 'READY' | 'WAITING' | 'BLOCKED' | 'UNGATED' | 'CLOSED';

export interface GatingEvaluation {
  issueNumber: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  status: GatingStatus;
  isReady: boolean;
  hasReadyLabel: boolean;
  hasAfkLabel: boolean;
  isBlockedLabelPresent: boolean;
  missingLabels: string[];
  prerequisiteIssueNumbers: number[];
  blockingIssueNumbers: number[];
  reasons: string[];
}
```

### `DoctorReport`
```typescript
export interface DoctorCheck {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  fatal?: boolean;
  remediation?: string;
}

export interface DoctorReport {
  healthy: boolean;
  checks: DoctorCheck[];
}
```

---

## Code Examples

### Example 1: Run an Autonomous Baton with Custom Event Logging

```typescript
import { BatonRunner } from 'sandcastle';

async function main() {
  const runner = new BatonRunner({
    all: true,
    mode: 'afk',
    model: 'Gemini 3.7 Flash',
    reasoningEffort: 'high',
    retries: 2,
  });

  runner.on('baton:start', ({ repo, issues }) => {
    console.log(`Starting baton for ${repo} (${issues.length} issues in queue)`);
  });

  runner.on('baton:gating', ({ issueNumber, evaluation }) => {
    console.log(`Gate evaluation #${issueNumber}: ${evaluation.status}`);
  });

  runner.on('worker:start', ({ issueNumber, title, attempt }) => {
    console.log(`Executing Issue #${issueNumber}: ${title} (Attempt ${attempt})`);
  });

  runner.on('worker:phase', ({ phase, message }) => {
    console.log(`  Phase [${phase}]: ${message}`);
  });

  runner.on('worker:complete', ({ issueNumber, durationMs }) => {
    console.log(`Completed #${issueNumber} in ${(durationMs / 1000).toFixed(1)}s`);
  });

  runner.on('baton:blocked', ({ issueNumber, reason }) => {
    console.error(`Blocked on #${issueNumber}: ${reason}`);
  });

  const result = await runner.run();
  console.log(`Baton finished. Success: ${result.success}. Closed: ${result.closedIssues.length}`);
}

main().catch(console.error);
```

### Example 2: Inspecting Backlog Gating Programmatically

```typescript
import { GitHubService, GatingEvaluator } from 'sandcastle';

async function auditBacklog() {
  const github = new GitHubService();
  const evaluator = new GatingEvaluator({ githubService: github });

  const issues = await github.listIssues({ state: 'open' });
  const evaluationMap = await evaluator.evaluateBacklog(issues);

  for (const [issueNum, evalResult] of evaluationMap.entries()) {
    console.log(`Issue #${issueNum} [${evalResult.status}] - Ready: ${evalResult.isReady}`);
    if (!evalResult.isReady) {
      console.log(`  Reasons: ${evalResult.reasons.join(', ')}`);
    }
  }
}

auditBacklog();
```

### Example 3: Streaming Agent Thoughts and Tool Calls

```typescript
import { TranscriptTailer } from 'sandcastle';

const tailer = new TranscriptTailer({ pollIntervalMs: 250 });

tailer.on('thought', (thought) => {
  console.log(`[Agent Reasoning]: ${thought}`);
});

tailer.on('tool_call', (toolCall) => {
  console.log(`[Tool Call]: ${toolCall.name} - ${toolCall.action || toolCall.summary || ''}`);
});

tailer.on('tokens', (tokens) => {
  console.log(`[Tokens Total]: ${tokens.total}`);
});

tailer.start();

// Stop tailing after 60 seconds
setTimeout(() => {
  tailer.stop();
  console.log('Finished streaming transcript.');
}, 60000);
```
