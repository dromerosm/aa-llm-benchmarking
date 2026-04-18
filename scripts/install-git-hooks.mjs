import { execFileSync } from "node:child_process";
import process from "node:process";

try {
  execFileSync("git", ["rev-parse", "--show-toplevel"], {
    stdio: "ignore",
  });
} catch {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "ignore",
  });
  console.log("Configured Git hooks path: .githooks");
} catch (error) {
  console.warn(`Could not configure Git hooks path: ${error.message}`);
}
