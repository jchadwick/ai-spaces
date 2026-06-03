# Intake Rubric

Use this rubric before accepting new feature work. The goal is not to say no by default; the goal is to make tradeoffs explicit.

## Classification

| Class | Definition | Default Action |
| --- | --- | --- |
| Core path | Directly advances the current active bet | Do or split smaller |
| Enabling | Removes a blocker, risk, or missing dependency for the core path | Do if the blocker is real |
| Validation | Reduces uncertainty about product value, architecture, or feasibility | Timebox |
| Polish | Improves an already-working path | Defer until the path works |
| Side quest | Interesting but not necessary for the active bet | Park |

## Questions

- What user or project outcome does this improve?
- Which active bet, epic, or risk does it support?
- What breaks if this is not done now?
- What is the smallest version that creates useful evidence?
- What task should this displace?
- Does this add privacy, security, architecture, or maintenance risk?
- Can the result be validated locally?

## Recommendation Template

```text
Recommendation:
Classification:
Why now:
Smallest useful version:
Displaces:
Acceptance criteria:
Revisit when:
```
