// Marks records created by the dummy-data seeder (src/scripts/seed-dummy.js).
// Real records never carry this field; cleanup deletes ONLY tagged records.
export const TEST_DATA_TAG = "fiduxa-dummy-v1";

export const testDataPlugin = (schema) => {
  schema.add({ testData: { type: String, default: undefined } });
  schema.index({ testData: 1 }, { sparse: true });
};
