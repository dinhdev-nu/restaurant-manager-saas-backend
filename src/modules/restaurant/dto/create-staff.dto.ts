import { IsDate, IsEmail, IsEnum, IsMongoId, IsNumber, IsOptional, IsPhoneNumber, IsString, Min } from "class-validator";
import { Shift } from "../schemas/staff.schema";
import { Type } from "class-transformer";
import { ROLE, Role, ROLE_LIST } from "src/common/constants/role.constant";


export class CreateStaffDto {

    @IsOptional() // Case staff chưa có tk
    @IsMongoId({ message: 'ID người dùng không hợp lệ' })
    @IsString()
    userId: string;

    @IsMongoId({ message: 'ID nhà hàng không hợp lệ' })
    @IsString()
    restaurantId: string;

    @IsString()
    name: string;

    @IsString()
    @IsEmail({}, { message: 'Email không hợp lệ' })
    email: string;

    @IsString()
    @IsPhoneNumber('VN', { message: 'Số điện thoại không hợp lệ' })
    phone: string;

    @IsOptional()
    @IsString()
    avatar?: string;

    @IsEnum(ROLE_LIST, { message: 'Vai trò nhân viên không hợp lệ' })
    role: Role;

    @IsEnum(Shift, { message: 'Ca làm việc không hợp lệ' })
    shift: Shift;

    @IsString()
    workingHours: string;

    @IsNumber()
    @Min(0, { message: 'Lương phải lớn hơn hoặc bằng 0' })
    salary: number;

    @Type(() => Date)
    @IsDate({ message: 'Ngày tham gia không hợp lệ' })
    joinDate: Date;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    notes?: string;

}
