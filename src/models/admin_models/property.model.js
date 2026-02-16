
import mongoose from "mongoose";

const propertySchema = new mongoose.Schema({
  ownerId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  address: String,

  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

propertySchema.index({ location: "2dsphere" });

propertySchema.index({ name: "text", address: "text" });


export const Property = mongoose.model("Property", propertySchema);
