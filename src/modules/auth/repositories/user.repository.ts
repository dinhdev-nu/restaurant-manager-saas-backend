import { Injectable } from "@nestjs/common";
import { BaseRepository, IBaseRepository } from "src/common/repositories/base.repositories";
import { User, UserDocument } from "../schema/user.xxx.schema";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

export interface IUserRepository extends IBaseRepository<UserDocument> {
    findUserExistByEmail(email: string): Promise<UserDocument | null>;
    findUserExistByPhone(phone: string): Promise<UserDocument | null>;
    findUserPendingByEmail(email: string): Promise<UserDocument | null>;
    getUserPendingDocumentByEmail(email: string): Promise<UserDocument | null>;
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

    async findUserExistByEmail(email: string): Promise<UserDocument | null> {
        return this.model.findOne({ email, deleted_at: null }).lean().exec();
    }

    async getUserPendingDocumentByEmail(email: string): Promise<UserDocument | null> {
        return this.model.findOne({ email, deleted_at: null, status: 'pending' }).exec();
    }

    async findUserPendingByEmail(email: string): Promise<UserDocument | null> {
        return this.model.findOne({ email, deleted_at: null, status: 'pending' }).lean().exec();
    }

    async findUserExistByPhone(phone: string): Promise<UserDocument | null> {
        return this.model.findOne({ phone, deleted_at: null }).lean().exec();
    }


}