import { Injectable } from "@nestjs/common";
import { BaseRepository, IBaseRepository } from "src/common/repositories/base.repositories";
import { User, UserDocument } from "../schema/user.xxx.schema";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

export interface IUserRepository extends IBaseRepository<UserDocument> {
    findUserExistByEmail(email: string): Promise<UserDocument | null>;
    findUserExistByPhone(phone: string): Promise<UserDocument | null>;
    findUserPendingByEmail(email: string): Promise<UserDocument | null>;
    findUserExistById(id: Types.ObjectId): Promise<UserDocument | null>;
    getUserPendingDocumentByEmail(email: string): Promise<UserDocument | null>;
    getUserProfileById(id: Types.ObjectId): Promise<UserDocument | null>;
    updateUserProfile(id: Types.ObjectId, data: Partial<UserDocument>): Promise<UserDocument | null>;
    updateUserPreferences(id: Types.ObjectId, data: Partial<Record<string, unknown>>): Promise<UserDocument | null>;
}


@Injectable()
export class UserRepository 
    extends BaseRepository<UserDocument> 
    implements IUserRepository 
{

     constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>
    ) {
        super(userModel);
    }

    async updateUserProfile(id: Types.ObjectId, data: Partial<UserDocument>): Promise<UserDocument | null> {
        const update: Record<string, unknown> = {}
        if (data.full_name !== undefined) update['full_name'] = data.full_name;
        if (data.date_of_birth !== undefined) update['date_of_birth'] = data.date_of_birth;
        if (data.gender !== undefined) update['gender'] = data.gender;
        return this.model.findOneAndUpdate(
            { _id: id, deleted_at: null },
            { $set: update },
            { new: true }
        )
        .select('-deleted_at -__v -last_login_ip')
        .lean()
        .exec();
    }

    async updateUserPreferences(id: Types.ObjectId, data: Partial<Record<string, unknown>>): Promise<UserDocument | null> {
        const update: Record<string, unknown> = {};

        if (data.language !== undefined) update['preferences.language'] = data.language;
        if (data.theme !== undefined) update['preferences.theme'] = data.theme;

        const notifications = data.notifications as Record<string, unknown> | undefined;
        if (notifications?.email !== undefined) update['preferences.notifications.email'] = notifications.email;
        if (notifications?.phone !== undefined) update['preferences.notifications.sms'] = notifications.phone;
        if (notifications?.sms !== undefined) update['preferences.notifications.sms'] = notifications.sms;
        if (notifications?.push !== undefined) update['preferences.notifications.push'] = notifications.push;

        if (Object.keys(update).length === 0) {
            return this.getUserProfileById(id);
        }

        return this.model.findOneAndUpdate(
            { _id: id, deleted_at: null },
            { $set: update },
            { new: true }
        )
        .select('-deleted_at -__v -last_login_ip')
        .lean()
        .exec();
    }

    async getUserProfileById(id: Types.ObjectId): Promise<UserDocument | null> {
        return this.model.findOne({ _id: id, deleted_at: null })
            .select('-deleted_at -__v -last_login_ip')
            .lean()
            .exec();
    }

    async findUserExistById(id: Types.ObjectId): Promise<UserDocument | null> {
        return this.model.findOne({ _id: id, deleted_at: null })
            .select('+password_hash')
            .lean()
            .exec();
    }

    async findUserExistByEmail(email: string): Promise<UserDocument | null> {
        return this.model.findOne({ email, deleted_at: null })
            .select('+password_hash')
            .lean()
            .exec();
    }
    
    async findUserExistByPhone(phone: string): Promise<UserDocument | null> {
        return this.model.findOne({ phone, deleted_at: null })
            .select('+password_hash')
            .lean()
            .exec();
    }

    async getUserPendingDocumentByEmail(email: string): Promise<UserDocument | null> {
        return this.model.findOne({ email, deleted_at: null, status: 'pending' })
            .select('+password_hash')
            .exec();
    }

    async findUserPendingByEmail(email: string): Promise<UserDocument | null> {
        return this.model.findOne({ email, deleted_at: null, status: 'pending' })
            .select('+password_hash')
            .lean()
            .exec();
    }


}