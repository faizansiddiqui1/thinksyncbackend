/* =========================
   Calculate GST
========================= */
export const calculateGST = (amount, gstPercentage = 18) => {
  return (amount * gstPercentage) / 100;
};

/* =========================
   Calculate Total With GST
========================= */
export const calculateTotalWithGST = (amount, gstPercentage = 18) => {
  const gst = calculateGST(amount, gstPercentage);
  return amount + gst;
};

/* =========================
   Calculate Discount
========================= */
export const calculateDiscount = (amount, discountPercentage) => {
  return (amount * discountPercentage) / 100;
};

/* =========================
   Calculate Final Price
========================= */
export const calculateFinalPrice = (
  basePrice,
  gstPercentage = 18,
  discountPercentage = 0,
  deposit = 0
) => {
  const discountAmount = calculateDiscount(basePrice, discountPercentage);
  const priceAfterDiscount = basePrice - discountAmount;
  const gstAmount = calculateGST(priceAfterDiscount, gstPercentage);
  const totalAmount = priceAfterDiscount + gstAmount;

  return {
    basePrice,
    discount: discountAmount,
    priceAfterDiscount,
    gstPercentage,
    gstAmount,
    deposit,
    totalAmount
  };
};

/* =========================
   Calculate Refund
========================= */
export const calculateRefund = (totalAmount, cancellationHours) => {
  if (cancellationHours > 24) {
    return totalAmount;
  }
  if (cancellationHours > 12) {
    return totalAmount * 0.5;
  }
  if (cancellationHours > 6) {
    return totalAmount * 0.25;
  }
  return 0;
};
