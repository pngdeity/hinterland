CONTEXT IS HIGH - you MUST compress now to avoid truncation.

RANGE SELECTION REQUIREMENTS:
1. Scan through the ENTIRE conversation history, not just recent messages.
2. Identify ALL closed task boundaries - completed goals, resolved questions, finished implementations.
3. Prefer content that is NOT yet compressed. Advance the frontier forward instead of re-absorbing existing compressed blocks.
4. If a compressed block already exists, target completed ranges that lie after it. Never reuse an endId that is at or before that block's end.
5. If a range must include an existing compressed block, set its startId to the block's ID and endId to a message strictly newer than everything the block covers; include the block placeholder exactly once.
6. Batch multiple independent closed ranges into a single compress tool call using the `content` array.
7. Prefer wider ranges that encompass complete tasks rather than narrow slices of partial work.
8. If uncertain whether a range is closed, compress it anyway - compression is reversible via /dcp decompress.
9. Do NOT wait for all tasks to complete. Compress EACH closed task range as you find it.
10. A range is "closed" when: its goal was achieved, tests pass, files are written, TODOs are checked off, or the user moved on to a different topic.

Do not skip this. Context is approaching the limit and uncompressed stale content will cause truncation.
