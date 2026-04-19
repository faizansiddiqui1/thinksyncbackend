import mongoose from "mongoose";
const { Schema } = mongoose;

const amenitySchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, default: "other" },
    available: { type: Boolean, default: true },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const imageSchema = new Schema(
  {
    url: { type: String },
    s3Key: { type: String },
    altText: { type: String, default: "" },
    caption: { type: String, default: "" },
    order: { type: Number, default: 0 },
    size: Number,
  },
  { _id: true },
);

const resourceSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    }, // link to Space
    name: { type: String, required: true, trim: true },

    foodPrice: { type: Number, trim: true },
    type: {
      type: String,
      enum: [
        "meeting_room",
        "private_cabin",
        "conference_room",
        "food",
        "lounge",
        "open_space",
        "informal_area",
        "desk",
      ],
      required: true,
    },
    images: [imageSchema],

    prices: {
      hourly: { type: Number, min: 0, default: null },
      daily: { type: Number, min: 0, default: null },
      weekly: { type: Number, min: 0, default: null },
      monthly: { type: Number, min: 0, default: null },
    },

    // inventory: {
    //   total: { type: Number, default: 0 },
    //   available: { type: Number, default: 0 }, // available now
    //   booked: { type: Number, default: 0 }, // already booked
    // },

    bookingRules: {
      supportsHourly: { type: Boolean, default: true },
      supportsDaily: { type: Boolean, default: true },
      supportsWeekly: { type: Boolean, default: true },
      supportsMonthly: { type: Boolean, default: true },
      bufferMinutes: { type: Number, default: 0 },
    },
    
    currency: { type: String, default: "INR" },

    isActive: { type: Boolean, default: true },

    capacity: {
      min: { type: Number, required: true, min: 1 },
      max: {
        type: Number,
        required: true,
        validate: {
          validator: function (v) {
            return v >= this.capacity.min;
          },
          message: "Max capacity must be >= min capacity",
        },
      },
    },

    area: Number,
    amenities: [amenitySchema],

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

// helpful index for queries by space + active
resourceSchema.index({ space: 1, isActive: 1 });
resourceSchema.index({ "prices.hourly": 1 });

export default mongoose.model("Resource", resourceSchema);