// Tiny in-process event bus (no imports → no circular dependencies).
// "changed" on userEvents: a user document was written (see user.model.js);
// availability.service.js clears its slot cache.
import { EventEmitter } from "node:events";

export const userEvents = new EventEmitter();
userEvents.setMaxListeners(20);
