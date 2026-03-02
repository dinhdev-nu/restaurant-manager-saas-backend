import { UserDocument } from './schema/user.schema';
import { SessionDocument } from './schema/session.schema';

export type JWTPayloadAT = { sid: string; sub: string; roles: string[] };
export type JWTPayloadRT = { sid: string; sub: string; version: number; jti: string; roles?: string[] };

export class UserHeaderRequest {
    ATPayload: JWTPayloadAT;
    info: UserDocument;
    session: SessionDocument;
}
