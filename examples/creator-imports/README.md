# Creator Import Templates

These templates show the smallest safe path from creator-owned exports into a Wisely creator catalog.

Every file normalizes to the same fields:

```text
title, summary, itemType, tags, entitlement, sourceRef, subscriberInputPrompt, priceUsd, paidActionSlug, approved
```

Use exports, transcripts, public links, or approved pasted text. Do not upload private student data, platform passwords, Discord tokens, raw API keys, seed phrases, raw cards, or content the creator does not have rights to use.

`creator-lanes.json` is the lane registry used by the CLI and agent instructions.

## Lanes

| Lane | Sample |
| --- | --- |
| `markdown_outline` | `notion-playbook.md` |
| `video_transcript` | `video-transcript.md` |
| `pdf_text` | `pdf-text.md` |
| `notion_export` | `notion-playbook.md` |
| `kajabi_export` | `kajabi-export.csv` |
| `teachable_export` | `teachable-export.csv` |
| `skool_community` | `skool-community.csv` |
| `discord_community` | `discord-community-faq.csv` |
| `membership_export` | `membership-export.csv` |
| `teams_training` | `teams-training.csv` |
| `affiliate_offer` | `affiliate-offer.csv` |
| `revenue_split` | `revenue-split.json` |
| `token_gated_content` | `token-gated-content.csv` |
| `marketplace_listing` | `marketplace-listing.csv` |

Suggested flow:

```bash
wisely-x402 creator preview examples/creator-imports/skool-community.csv skool-demo
wisely-x402 creator preview examples/creator-imports/notion-playbook.md notion-demo
wisely-x402 creator preview-lane kajabi_export examples/creator-imports/kajabi-export.csv kajabi-demo
wisely-x402 creator template discord_community
```

Then publish with a scoped builder key only after reviewing every row in the creator onboarding wizard.
