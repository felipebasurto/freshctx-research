import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerForceHostReadExtension } from "./force-host-read-core.mjs";

export default function forceHostReadExtension(pi: ExtensionAPI) {
  registerForceHostReadExtension(pi);
}
