import { UserDocument } from './schema/user.schema';
import { SessionDocument } from './schema/session.schema';
import { Types } from 'mongoose';
import { Role } from 'src/common/constants/role.constant';

export type JWTPayloadAT = { sid: string; sub: Types.ObjectId; role: Role };
export type JWTPayloadRT = { sid: string; sub: Types.ObjectId; version: number; jti: string; role: Role };

export class UserHeaderRequest {
    ATPayload: JWTPayloadAT;
    info: UserDocument;
    session: SessionDocument;
}
