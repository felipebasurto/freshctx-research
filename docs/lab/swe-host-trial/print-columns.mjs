#!/usr/bin/env node
/** Print host-eval columns. Scores stay null until a live capture exists. */

import { measuredSweScores, printColumnNames } from "./pack.mjs";

console.log(printColumnNames().join("\t"));
if (measuredSweScores() === null) {
  console.log("not measured");
}
