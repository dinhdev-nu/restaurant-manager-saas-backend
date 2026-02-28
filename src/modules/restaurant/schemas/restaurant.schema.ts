import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type RestaurantDocument = HydratedDocument<Restaurant>;

@Schema({ timestamps: true })
export class Restaurant {

  // INFO
  @Prop({ required: true, trim: true, maxlength: 100, minlength: 3 })
  restaurantName: string;
  
  @Prop({ default: "" })
  logo: string;
  
  @Prop({ default: "" })
  coverImage: string;
  
  @Prop({ type: Types.ObjectId, required: true, ref: "User" })
  ownerId: Types.ObjectId;
  
  @Prop({ required: true, match: /^(0|\+84)[0-9]{9,10}$/ })
  phone: string;
  
  @Prop({ required: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })
  email: string;
  
  @Prop({ match: /^https?:\/\/.+\..+/ })
  website?: string; 

  // LOCATION
  @Prop({ minlength: 5 })
  address?: string;
  
  @Prop({ required: true })
  city: string;
  
  @Prop()
  district?: string;

  // Details
  @Prop({ required: true })
  cuisine: string;
  
  @Prop({ min: 1, max: 10000 })
  capacity?: number;

  // OPENING HOURS
  @Prop({ required: true, match: /^([01][0-9]|2[0-3]):[0-5][0-9]$/ })
  openingTime: string; // Format: "HH:MM"
  
  @Prop({ required: true, match: /^([01][0-9]|2[0-3]):[0-5][0-9]$/ })
  closingTime: string; // Format: "HH:MM"
  
  @Prop({ required: true, type: [String], default: [] })
  workingDays: string[]; // ['monday', 'tuesday', 'wednesday', ...]

  // Services & Amenities
  @Prop({ type: [String], default: [] })
  services: string[]; // ['dine_in', 'takeaway', 'delivery', ...]
  
  @Prop({ type: [String], default: [] })
  paymentMethods: string[]; // ['cash', 'card', 'momo', ...]

  // Description
  @Prop({ maxlength: 1000 })
  description?: string;
  
  @Prop({ maxlength: 500 })
  specialties?: string;

  @Prop({ default: true })
  isActive: boolean;

}

export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);