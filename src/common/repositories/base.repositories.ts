import { Document, FilterQuery, Model, UpdateQuery } from "mongoose";
import { Types } from "mongoose";

export interface IBaseRepository<T> {
    findAll(filter?: Partial<T>): Promise<T[]>;
    findById(id: Types.ObjectId): Promise<T | null>;
    findOne(filter: Partial<T>): Promise<T | null>;
    create(data: Partial<T>): Promise<T>;
    update(id: Types.ObjectId, data: Partial<T>): Promise<T | null>;
    delete(id: Types.ObjectId): Promise<boolean>;
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

    async create(data: Partial<T>): Promise<T> {
        const doc = new this.model(data);
        return doc.save() as Promise<T>;
    }

    async update(id: Types.ObjectId, data: UpdateQuery<T>): Promise<T | null> {
        return this.model.findByIdAndUpdate(
            id,
            data,
            { new: true }
        ).lean()
        .exec() as Promise<T | null>; 
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await this.model.findByIdAndDelete(id).exec()
        return result !== null;
    }

    async count(filter: FilterQuery<T> = {}): Promise<number> {
        return this.model.countDocuments(filter).exec();
    }
}