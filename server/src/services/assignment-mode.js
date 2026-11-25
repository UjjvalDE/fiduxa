// Which assignment flow is active (POLICIES.assignment.mode, admin setting):
//   "auto"  – the system assigns the best suitable cleaner after payment
//   "board" – legacy open-job board: cleaners accept jobs themselves
import { POLICIES } from "../config/pricing.js";

export const assignmentMode = () => (POLICIES.assignment?.mode === "board" ? "board" : "auto");
export const isAutoMode = () => assignmentMode() === "auto";
export const assignmentRules = () => POLICIES.assignment;
