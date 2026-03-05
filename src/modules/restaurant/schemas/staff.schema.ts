import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { RESTAURANT_ROLE, RESTAURANT_ROLE_LIST, RestaurantRole } from "src/common/constants/restaurant-role.constant";

export type StaffDocument = HydratedDocument<Staff>;

export enum Shift {
    MORNING = "morning",
    AFTERNOON = "afternoon",
    NIGHT = "night",
    PARTTIME = "part-time",
    FULLTIME = "full-time",
}

enum Status {
    ACTIVE = "active",
    INACTIVE = "inactive",
    ON_BREAK = "on_break",
}

@Schema({ timestamps: true })
export class Staff {

    @Prop({ type: Types.ObjectId, ref: "User" })
    userId: Types.ObjectId

    @Prop({ type: Types.ObjectId, required: true, ref: "Restaurant" })
    restaurantId: Types.ObjectId

    @Prop({ required: true, trim: true })
    name: string

    @Prop()
    avatar?: string

    @Prop({ required: true })
    email: string

    @Prop({ required: true })
    phone: string

    @Prop({ type: String, enum: RESTAURANT_ROLE_LIST, required: true })
    role: RestaurantRole

    @Prop({ enum: Shift, required: true, default: Shift.FULLTIME })
    shift: string

    @Prop({ required: true })
    workingHours: string

    @Prop({ required: true, min: 0 })
    salary: number

    @Prop({ required: true })
    joinDate: Date

    @Prop()
    address?: string

    @Prop()
    notes?: string

    @Prop({ default: true })
    isActive: boolean

    @Prop({ enum: Status, default: Status.INACTIVE })
    status: string

    @Prop({ default: new Date() })
    lastWorkDate?: Date

    @Prop({ default: 0 })
    accumulatedMinutes?: number

}

export const StaffSchema = SchemaFactory.createForClass(Staff)

