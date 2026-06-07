# Constraints: Reasoning Recovery

## MUST Rules
1. THE Debug FSM SHALL only transition states when conditions (evidence, hypothesis, confirmation) are met.
2. THE system SHALL trigger context compression when loop confidence exceeds 0.7.
3. THE system SHALL re-inject recovery hints for 3 turns after a loop-triggered compression.

## MUST NOT Rules
1. THE system MUST NOT allow edit tools in the "Investigate" or "Hypothesize" states of the Debug FSM.
2. THE system MUST NOT use LLM calls for loop detection or FSM transition validation.

## Assumptions
1. The agent's assistant messages provide enough structural signal (tool names, file paths) for similarity scoring.
2. Mode is explicitly set to "debug" for FSM enforcement.
