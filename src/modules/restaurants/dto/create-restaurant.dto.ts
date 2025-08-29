import { IsEmail, IsOptional, IsPhoneNumber, IsString, Length } from "class-validator";

export class CreateRestaurantDto {

  @IsString()
  @Length(3, 25)
  name: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsPhoneNumber()
  @Length(7, 15)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @Length(5, 100)
  email?: string;
  
}
