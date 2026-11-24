export const createId = () => {
  return crypto.randomUUID();
};

export const createBookingReference = (number) => {
  const year = new Date().getFullYear();

  return `FID-${year}-${String(number).padStart(5, "0")}`;
};
