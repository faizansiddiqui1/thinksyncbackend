export const normalizePhone = (value) => {
  if (!value) return value;

  return value
    .replace(/\D/g, "")   // remove non-digits
    .replace(/^91/, ""); // remove country code if present
};
