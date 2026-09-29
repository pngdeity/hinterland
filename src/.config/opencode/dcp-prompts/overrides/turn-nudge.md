Evaluate the conversation for compressible ranges.

If any messages are cleanly closed and unlikely to be needed again, use the compress tool on them now. Do not wait for a user request.
After completing and verifying a task, compress that finished range before starting the next one.

FRONTIER RULES:
- Prefer content that is NOT yet compressed - advance the frontier forward.
- Do not re-absorb an existing compressed block just to widen a range, and never reuse an endId at or before an existing block's end.
- If a new range must include an existing compressed block, set startId to that block's ID and endId to a message strictly newer than everything it covers; include the block placeholder exactly once.

The goal is to filter noise and distill key information so context accumulation stays under control.
Keep active context uncompressed.
