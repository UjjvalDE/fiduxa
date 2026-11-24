import Counter from "../models/counter.model.js";

export const generateBookingReference = async () => {
  const year = new Date().getFullYear();

  const counter = await Counter.findOneAndUpdate(
    { _id: `booking-${year}` },
    { $inc: { sequence: 1 } },
    {
      returnDocument: "after",
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return `FID-${year}-${String(counter.sequence).padStart(5, "0")}`;
};
