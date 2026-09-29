You've been iterating for a while after the last user message.

If a closed portion is unlikely to be referenced immediately (for example, finished research before implementation), use the compress tool on it now.
Compress each completed task range as it closes instead of accumulating many of them.

FRONTIER RULES:
- Advance the frontier: target completed content that is not yet inside an existing compressed block.
- Never reuse an endId that is at or before an existing block's end - that only regrows the summary without freeing context.
- If you must include an existing compressed block, set startId to that block's ID and endId to a strictly newer message; include the block placeholder exactly once.
