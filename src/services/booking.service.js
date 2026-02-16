import Booking from '../models/Booking.js';
import Space from '../models/Space.js';
import dayjs from 'dayjs';

/* =========================
   Create Booking
========================= */
export const createBooking = async (bookingData) => {
  try {
    const { space, bookingDuration, resource } = bookingData;

    const spaceExists = await Space.findById(space);
    if (!spaceExists) {
      return { success: false, error: 'Space not found' };
    }

    const hasOverlap = await Booking.checkOverlap(
      space,
      bookingDuration.startDate,
      bookingDuration.endDate,
      resource?.resourceId
    );

    if (hasOverlap) {
      return {
        success: false,
        error: 'Booking conflicts with existing reservation'
      };
    }

    const booking = new Booking(bookingData);
    booking.calculateDuration();
    await booking.save();

    await Space.findByIdAndUpdate(space, {
      $inc: { 'analytics.bookings': 1 }
    });

    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get Booking By ID
========================= */
export const getBookingById = async (id) => {
  try {
    const booking = await Booking.findById(id)
      .populate('space')
      .populate('user.userId');

    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get User Bookings
========================= */
export const getUserBookings = async (userId, filters = {}) => {
  try {
    const { status, upcoming, past, page = 1, limit = 20 } = filters;

    const query = { 'user.userId': userId };

    if (status) query.status = status;
    if (upcoming) query['bookingDuration.startDate'] = { $gte: new Date() };
    if (past) query['bookingDuration.endDate'] = { $lt: new Date() };

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate('space', 'name slug images address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(query);

    return {
      success: true,
      data: {
        bookings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get Space Bookings
========================= */
export const getSpaceBookings = async (spaceId, filters = {}) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = filters;

    const query = { space: spaceId };

    if (status) query.status = status;

    if (startDate || endDate) {
      query['bookingDuration.startDate'] = {};
      if (startDate) query['bookingDuration.startDate'].$gte = new Date(startDate);
      if (endDate) query['bookingDuration.endDate'].$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate('user.userId', 'name email phone')
      .sort({ 'bookingDuration.startDate': 1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(query);

    return {
      success: true,
      data: {
        bookings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Update Booking Status
========================= */
export const updateBookingStatus = async (id, status, notes = '') => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    booking.status = status;
    if (notes) booking.adminNotes = notes;

    if (status === 'confirmed' && booking.payment.status === 'paid') {
      booking.invoice.invoiceDate = new Date();
    }

    await booking.save();
    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Cancel Booking
========================= */
export const cancelBooking = async (id, cancelledBy, reason = '') => {
  try {
    const booking = await Booking.findById(id).populate('space');
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.status === 'cancelled') {
      return { success: false, error: 'Booking already cancelled' };
    }

    const hoursUntilStart = dayjs(booking.bookingDuration.startDate).diff(
      dayjs(),
      'hour'
    );

    let refundAmount = 0;
    if (hoursUntilStart > 24) {
      refundAmount = booking.priceBreakdown.totalAmount;
    } else if (hoursUntilStart > 12) {
      refundAmount = booking.priceBreakdown.totalAmount * 0.5;
    }

    booking.status = 'cancelled';
    booking.cancellation = {
      cancelledBy,
      cancelledAt: new Date(),
      reason,
      refundAmount
    };

    if (refundAmount > 0 && booking.payment.status === 'paid') {
      booking.payment.status = 'refunded';
      booking.payment.refundedAt = new Date();
      booking.payment.refundAmount = refundAmount;
    }

    await booking.save();
    return { success: true, data: booking, refundAmount };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Check In / Check Out
========================= */
export const checkIn = async (id) => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.status !== 'confirmed') {
      return { success: false, error: 'Booking not confirmed' };
    }

    booking.checkIn.status = true;
    booking.checkIn.time = new Date();
    await booking.save();

    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const checkOut = async (id) => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (!booking.checkIn.status) {
      return {
        success: false,
        error: 'Must check in before checking out'
      };
    }

    booking.checkOut.status = true;
    booking.checkOut.time = new Date();
    booking.status = 'completed';
    await booking.save();

    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Update Payment
========================= */
export const updatePaymentStatus = async (id, paymentData) => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    booking.payment = {
      ...booking.payment,
      ...paymentData,
      paidAt:
        paymentData.status === 'paid'
          ? new Date()
          : booking.payment.paidAt
    };

    if (paymentData.status === 'paid') {
      booking.status = 'confirmed';
    }

    await booking.save();
    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Booking Stats
========================= */
export const getBookingStats = async (spaceId, startDate, endDate) => {
  try {
    const query = { space: spaceId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const bookings = await Booking.find(query);

    const stats = {
      total: bookings.length,
      confirmed: bookings.filter(b => b.status === 'confirmed').length,
      cancelled: bookings.filter(b => b.status === 'cancelled').length,
      completed: bookings.filter(b => b.status === 'completed').length,
      pending: bookings.filter(b => b.status === 'pending').length,
      totalRevenue: bookings
        .filter(b => b.payment.status === 'paid')
        .reduce((sum, b) => sum + b.priceBreakdown.totalAmount, 0),
      avgBookingValue: 0
    };

    if (stats.total > 0) {
      stats.avgBookingValue = stats.totalRevenue / stats.total;
    }

    return { success: true, data: stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
