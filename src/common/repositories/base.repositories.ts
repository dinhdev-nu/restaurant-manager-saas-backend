import { ClientSession, Document, FilterQuery, Model, UpdateQuery } from "mongoose";
import { Types } from "mongoose";

export interface IBaseRepository<T> {
    findAll(filter?: Partial<T>): Promise<T[]>;
    findById(id: Types.ObjectId): Promise<T | null>;
    findOne(filter: Partial<T>): Promise<T | null>;
    findByIdAndUpdate(id: Types.ObjectId, data: Partial<T>, session?: ClientSession): Promise<T | null>;
    create(data: Partial<T>, session?: ClientSession): Promise<T>;
    update(id: Types.ObjectId, data: Partial<T>, session?: ClientSession): Promise<T | null>;
    delete(id: Types.ObjectId, session?: ClientSession): Promise<boolean>;
    count(filter?: Partial<T>): Promise<number>;
}

export abstract class BaseRepository<T extends Document> implements IBaseRepository<T> {
    constructor(protected readonly model: Model<T>){}

    async findAll(filter: FilterQuery<T> = {}): Promise<T[]> {
        return this.model.find(filter).lean().exec() as Promise<T[]>;
    }

    async findById(id: Types.ObjectId): Promise<T | null> {
        return this.model.findById(id).lean().exec() as Promise<T | null>;
    }

    async findOne(filter: FilterQuery<T>): Promise<T | null> {
        return this.model.findOne(filter).lean().exec() as Promise<T | null>;
    }

    async findByIdAndUpdate(id: Types.ObjectId, data: UpdateQuery<T>, session?: ClientSession): Promise<T | null> {
        return this.model.findByIdAndUpdate(id, data, { new: true, session }).lean().exec() as Promise<T | null>;
    }

    async create(data: Partial<T>, session?: ClientSession): Promise<T> {
        const doc = new this.model(data);
        return doc.save({ session }) as Promise<T>;
    }

    async update(id: Types.ObjectId, data: UpdateQuery<T>, session?: ClientSession): Promise<T | null> {
        return this.model.findByIdAndUpdate(
            id,
            data,
            { new: true, session }
        ).lean()
        .exec() as Promise<T | null>; 
    }

    async delete(id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
        const result = await this.model.findByIdAndDelete(id, { session }).exec()
        return result !== null;
    }

    async count(filter: FilterQuery<T> = {}): Promise<number> {
        return this.model.countDocuments(filter).exec();
    }
}