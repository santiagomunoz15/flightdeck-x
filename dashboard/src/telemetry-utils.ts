import type { TelemetrySample } from "./types";

export function dynamicPressureKpa(sample: TelemetrySample): number {
  const altitude = Math.max(0, sample.positionM[2]);
  const density = 1.225 * Math.exp(-altitude / 8500);
  const [vx, vy, vz] = sample.velocityMps;
  return 0.5 * density * (vx * vx + vy * vy + vz * vz) / 1000;
}

export function speedMps(sample: TelemetrySample): number {
  return Math.hypot(...sample.velocityMps);
}

export function startsNewFlight(previous: TelemetrySample | undefined, current: TelemetrySample): boolean {
  if (!previous) return false;
  const sequenceRestarted = current.sequence === 0 && previous.sequence !== 0;
  const simulationClockRestarted = current.timestampUs + 1_000_000 < previous.timestampUs;
  return sequenceRestarted || simulationClockRestarted;
}

export function shouldRetainSample(previous: TelemetrySample | undefined, current: TelemetrySample, stride = 5): boolean {
  return !previous || current.sequence % stride === 0 ||
    current.missionPhase !== previous.missionPhase ||
    current.faultFlags !== previous.faultFlags || current.missionPhase === "LANDED" || current.missionPhase === "TERMINATED";
}

export function displaySamples(samples: TelemetrySample[], stride = 5): TelemetrySample[] {
  const retained: TelemetrySample[] = [];
  for (const sample of samples) {
    if (shouldRetainSample(retained.at(-1), sample, stride)) retained.push(sample);
  }
  const latest = samples.at(-1);
  if (latest && retained.at(-1) !== latest) retained.push(latest);
  return retained;
}

export function chartSamples(samples: TelemetrySample[], maximum = 360): TelemetrySample[] {
  if (samples.length <= maximum) return samples;
  const stride = Math.ceil(samples.length / maximum);
  const result = samples.filter((_, index) => index % stride === 0);
  const latest = samples.at(-1);
  if (latest && result.at(-1) !== latest) result.push(latest);
  return result;
}
