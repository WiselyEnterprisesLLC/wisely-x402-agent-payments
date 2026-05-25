# Creator Import Templates

These templates show the smallest safe path from creator-owned exports into a Wisely creator catalog.

Every file normalizes to the same fields:

```text
title, summary, itemType, tags, entitlement, sourceRef, subscriberInputPrompt, priceUsd, paidActionSlug, approved
```

Use exports, transcripts, public links, or approved pasted text. Do not upload private student data, platform passwords, Discord tokens, raw API keys, seed phrases, or content the creator does not have rights to use.

Suggested flow:

```bash
wisely-x402 creator preview examples/creator-imports/skool-community.csv skool-demo
wisely-x402 creator preview examples/creator-imports/notion-playbook.md notion-demo
```

Then publish with a scoped builder key only after reviewing every row in the creator onboarding wizard.
