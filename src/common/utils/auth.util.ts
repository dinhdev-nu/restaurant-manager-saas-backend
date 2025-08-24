import * as bycrypt from "bcrypt"

export const GenerateSalt = async (): Promise<string> => {
    return await bycrypt.genSalt(10);
}

export const HashPassword = async (password: string, salt: string): Promise<string> => {
    return await bycrypt.hash(password, salt);
}


export const ComparePassword = async (password: string, hashedPassword: string): Promise<Boolean> => {
    return await bycrypt.compare(password, hashedPassword); // hashedPassword => salt => ( Compare( HashPassword(salt + password), hashedPassword ) )
}