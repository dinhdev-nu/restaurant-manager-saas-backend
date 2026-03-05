import { Body, Controller, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentByCashDto, CreatePaymentDto } from './dto/create-payment.dto';
import { Roles } from 'src/common/decorators';
import { ROLE } from 'src/common/constants/role.constant';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('/cash')
  @Roles(ROLE.ADMIN, ROLE.USER)
  async paymentByCash(@Body() dto: CreatePaymentByCashDto) {
    const restaurantId = dto.restaurantId;
    return this.paymentService.paymentByCash(dto, restaurantId);
  }

  @Post('/qr-code')
  @Roles(ROLE.ADMIN, ROLE.USER)
  async paymentByQrCode(@Body() dto: CreatePaymentDto) {
    const restaurantId = dto.restaurantId;
    return this.paymentService.paymentByQrCode(dto, restaurantId);
  }
}