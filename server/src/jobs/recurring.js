// Hourly job: create the due occurrences of every active recurring plan and
// hand occurrences whose preferred-cleaner window has passed to the open board.
import { generateDueOccurrences } from "../services/recurring-series.service.js";

export { generateDueOccurrences };

export const recurringJob = {
  name: "recurringSeries",
  everyMs: 3600e3,
  run: () => generateDueOccurrences(),
};

export default recurringJob;
