/**
 * Lists cache_control blocks on the research system prompts.
 * Prints lengths and whether the block is shared. No model call.
 */
import { createHash } from "node:crypto";
import {
  anthropicSystemBlocks,
  estimateTokens,
  sixFilterChecklistSystem,
  sixFilterFullSystem,
} from "../lib/skills/loadSkill.js";

const labels = [
  ["filter1", sixFilterFullSystem("FILTER 1 TASK")],
  ["filter4", sixFilterFullSystem("FILTER 4 TASK")],
  ["f5-sizing", sixFilterChecklistSystem("F5 TASK")],
  ["f2-cost", sixFilterChecklistSystem("F2 TASK")],
  ["f3-category-avg-price", sixFilterChecklistSystem("F3 PRICE TASK")],
  ["f3-volume-loss", sixFilterChecklistSystem("F3 VOLUME TASK")],
];

const seen = new Map();
for (const [label, system] of labels) {
  const blocks = anthropicSystemBlocks(system) || [];
  blocks.forEach((block, index) => {
    const hash = createHash("sha256").update(block.text).digest("hex").slice(0, 12);
    const users = seen.get(hash) || [];
    users.push(label);
    seen.set(hash, users);
    console.log(
      `label=${label} block=${index} cache=${block.cache_control ? "yes" : "no"} ` +
        `tokens~${estimateTokens(block.text)} hash=${hash}`
    );
  });
}
for (const [hash, users] of seen) {
  console.log(`shared hash=${hash} calls=${users.length} labels=${users.join(",")}`);
}
