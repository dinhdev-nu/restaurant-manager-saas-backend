import { Schema } from "@nestjs/mongoose";
import { Document, HydrateOptions } from "mongoose";



export type AuthDocument = Document & Auths;

@Schema()
export class Auths {

    

    email: string;
    password: string;
}