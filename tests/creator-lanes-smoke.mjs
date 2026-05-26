#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listCreatorLanes,
  creatorLaneTemplate,
  readCreatorImportFile,
  previewCreatorOnboarding,
} from "../client.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lanes = listCreatorLanes().body.lanes;
const failures = [];

if (!lanes.length) {
  failures.push("no creator lanes found");
}

for (const lane of lanes) {
  if (!lane.id || !lane.label || !lane.contentType || !lane.sampleFile) {
    failures.push(`lane missing required metadata: ${JSON.stringify(lane)}`);
    continue;
  }
  if (!["markdown", "csv", "json"].includes(lane.contentType)) {
    failures.push(`${lane.id} has unsupported contentType ${lane.contentType}`);
  }
  const samplePath = path.join(repoRoot, "examples", "creator-imports", lane.sampleFile);
  if (!fs.existsSync(samplePath)) {
    failures.push(`${lane.id} sample missing: ${samplePath}`);
    continue;
  }
  const template = creatorLaneTemplate(lane.id);
  if (!template.body.content || !template.body.safetyNote) {
    failures.push(`${lane.id} template missing content or safety note`);
  }
  const payload = readCreatorImportFile(samplePath, {
    sourceLane: lane.id,
    creatorId: `lane-smoke-${lane.id}`,
  });
  if (payload.sourceLane !== lane.id) {
    failures.push(`${lane.id} payload sourceLane mismatch: ${payload.sourceLane}`);
  }
  if (payload.contentType !== lane.contentType) {
    failures.push(`${lane.id} payload contentType mismatch: ${payload.contentType}`);
  }
  if (!payload.importSource?.laneLabel) {
    failures.push(`${lane.id} payload missing importSource`);
  }
  try {
    const preview = await previewCreatorOnboarding(payload);
    const body = preview.body || {};
    const itemCount = body.catalog?.items?.length || body.items?.length || 0;
    if (preview.status !== 200 || body.schema !== "wisely.creator-onboarding.preview.v1" || itemCount < 1) {
      failures.push(`${lane.id} preview unexpected response: ${preview.status} ${JSON.stringify(body).slice(0, 300)}`);
    }
    console.log(`ok ${lane.id} preview items=${itemCount}`);
  } catch (error) {
    failures.push(`${lane.id} preview failed: ${error.message}`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}

console.log(`ok creator-lanes ${lanes.length}`);
