import { 
  IsEmail, 
  IsOptional, 
  IsString, 
  Length, 
  Matches, 
  IsArray, 
  IsInt, 
  Min, 
  Max, 
  ArrayMinSize,
  IsPhoneNumber, 
} from "class-validator";

export class CreateRestaurantDto {

  // INFO
  @IsString()
  @Length(3, 100, { message: 'Tên nhà hàng phải từ 3-100 ký tự' })
  restaurantName: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsPhoneNumber("VN", { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsOptional()
  @Matches(/^https?:\/\/.+\..+/, { 
    message: 'Website phải bắt đầu bằng http:// hoặc https://' 
  })
  website?: string;

  // LOCATION
  @IsOptional()
  @IsString()
  @Length(5, 200, { message: 'Địa chỉ phải từ 5-200 ký tự' })
  address?: string;
 
  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  district?: string;  

  // DETAILS
  @IsString()
  cuisine: string;

  @IsOptional()
  @IsInt({ message: 'Sức chứa phải là số nguyên' })
  @Min(1, { message: 'Sức chứa phải ít nhất 1 người' })
  @Max(10000, { message: 'Sức chứa tối đa 10000 người' })
  capacity?: number;

  // OPENING HOURS
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'Giờ mở cửa phải theo định dạng HH:MM (VD: 08:00)' 
  })
  openingTime: string;

  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'Giờ đóng cửa phải theo định dạng HH:MM (VD: 22:00)' 
  })
  closingTime: string;

  @IsArray({ message: 'Ngày làm việc phải là mảng' })
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất một ngày làm việc' })
  @IsString({ each: true })
  workingDays: string[]; // ['monday', 'tuesday', ...]

  // SERVICES & AMENITIES
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[]; // ['dine_in', 'takeaway', 'delivery', ...]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethods?: string[]; // ['cash', 'card', 'momo', ...]

  // DESCRIPTION
  @IsOptional()
  @IsString()
  @Length(0, 1000, { message: 'Mô tả không được vượt quá 1000 ký tự' })
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500, { message: 'Món đặc sản không được vượt quá 500 ký tự' })
  specialties?: string;
  
}

export class UpdateRestaurantDto extends CreateRestaurantDto {}