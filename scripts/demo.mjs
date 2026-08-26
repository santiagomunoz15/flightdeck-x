import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const simulator = process.platform === "win32"
  ? "build/generator/Release/flight_simulator.exe"
  : "build/generator/flight_simulator";

if (!existsSync(simulator)) {
  console.error(`Simulator not found at ${simulator}.`);
  console.error("Build it first with: cmake -S . -B build && cmake --build build");
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function launch(command, args, label) {
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  children.push(child);
  child.on("error", (error) => {
    console.error(`Unable to start ${command}: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`${label} ended${signal ? ` from ${signal}` : ` with code ${code ?? 0}`}.`);
    shutdown(code ?? 0);
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

console.log("Starting FlightDeck X server and dashboard...");
launch("npm", ["run", "dev:server"], "Streaming server");
launch("npm", ["run", "dev:dashboard"], "Dashboard");

setTimeout(() => {
  if (shuttingDown) return;
  console.log("Starting the 100 Hz flight simulator...");
  launch(simulator, [], "Simulator");
}, 1500);
