// A new entry URL bypasses the obsolete v5 shell during the first upgrade.
import { pwaReady } from "./pwa.js?release=alignment-v6";

await pwaReady;
await import("./app.js");
