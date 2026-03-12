import { BaseRepository, IBaseRepository } from "src/common/repositories/base.repositories";
import { UserSession, UserSessionDocument } from "../schema/user_session.xxx.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

export interface ISessionRepository extends IBaseRepository<UserSessionDocument> {
    findSessionByTokenHash(token_hash: string): Promise<UserSessionDocument | null>;
    updateSessionLogoutByTokenHash(token_hash: string): Promise<UserSessionDocument | null>;
    findAllByUserId(user_id: Types.ObjectId): Promise<UserSessionDocument[]>;
    updateSessionsLogoutByUserId(user_id: Types.ObjectId): Promise<{ modifiedCount: number }>;
    findSessionsExcludingTokenHash(user_id: Types.ObjectId, token_hash: string): Promise<UserSessionDocument[]>;
    UpdateSessionsExcludingTokenHash(user_id: Types.ObjectId, token_hash: string): Promise<{ modifiedCount: number }>;
}

@Injectable()
export class SessionRepository 
    extends BaseRepository<UserSessionDocument>
    implements ISessionRepository 
{
    constructor(
        @InjectModel(UserSession.name) 
        private readonly sessionModel: Model<UserSessionDocument>
    ) {
        super(sessionModel);
    }

    async findSessionsExcludingTokenHash(user_id: Types.ObjectId, token_hash: string): Promise<UserSessionDocument[]> {
        return this.sessionModel.find({
            user_id,
            token_hash: { $ne: token_hash },
            is_revoked: false,
            expires_at: { $gte: new Date() }
        })
    }
    
    async UpdateSessionsExcludingTokenHash(user_id: Types.ObjectId, token_hash: string): Promise<{ modifiedCount: number }> {
        const result = await this.sessionModel.updateMany(
            {
                user_id,
                token_hash: { $ne: token_hash },
                is_revoked: false,
                expires_at: { $gte: new Date() }
            },
            {
                is_revoked: true
            }
        );
        return { modifiedCount: result.modifiedCount };
    }

    async findSessionByTokenHash(token_hash: string): Promise<UserSessionDocument | null> {
        return this.sessionModel.findOne({
            token_hash,
            is_revoked: false,
            expires_at: { $gte: new Date() }
        }).lean().exec();
    }

    async updateSessionLogoutByTokenHash(token_hash: string): Promise<UserSessionDocument | null> {
        return this.sessionModel.findOneAndUpdate(
            { token_hash},
            { is_revoked: true },
            { new: true }
        ).lean().exec();
    }

    async findAllByUserId(user_id: Types.ObjectId): Promise<UserSessionDocument[]> {
        return this.sessionModel.find(
            { 
                user_id,
                is_revoked: false,
                expires_at: { $gte: new Date() }
            },
        ).lean().exec();
    }


    async updateSessionsLogoutByUserId(user_id: Types.ObjectId): Promise<{ modifiedCount: number }> {
        const result = await this.sessionModel.updateMany(
            { user_id, is_revoked: false, expires_at: { $gte: new Date() } },
            { is_revoked: true }
        );
        return { modifiedCount: result.modifiedCount };
    }
}