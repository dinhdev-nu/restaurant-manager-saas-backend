import { OAuthProvider, OAuthProviderDocument } from "../schema/oauth_provider.xxx.schema";
import { BaseRepository, IBaseRepository } from "../../../common/repositories/base.repositories";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

export interface IOAuthProviderRepository extends IBaseRepository<OAuthProviderDocument> {

    findByProviderAndProviderId(provider: string, provider_user_id: string): Promise<OAuthProviderDocument | null>;
}

@Injectable()
export class OAuthProviderRepository 
    extends BaseRepository<OAuthProviderDocument>
    implements IOAuthProviderRepository {
    constructor(
        @InjectModel(OAuthProvider.name)
        private readonly providerModel: Model<OAuthProviderDocument>
    ) {
        super(providerModel);
    }

    async findByProviderAndProviderId(provider: string, provider_user_id: string): Promise<OAuthProviderDocument | null> {
        return this.providerModel.findOne({ provider, provider_user_id }).lean().exec();
    }

}