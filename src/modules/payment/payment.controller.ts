import { Body, Controller, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentByCashDto, CreatePaymentDto } from './dto/create-payment.dto';
import { Protected, Roles } from 'src/common/decorator';
import { Role } from 'src/common/enums/roles.enum';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('/cash')
  @Protected()
  @Roles(Role.ADMIN, Role.CUSTOMER)
  async paymentByCash(@Body() createPaymentDto: CreatePaymentByCashDto) {
    const restaurantId = createPaymentDto.restaurantId;
    return this.paymentService.paymentByCash(createPaymentDto, restaurantId);
  }

  @Post('/qr-code')
  @Protected()
  @Roles(Role.ADMIN, Role.CUSTOMER)
  async paymentByQrCode(@Body() createPaymentDto: CreatePaymentDto) {
    const restaurantId = createPaymentDto.restaurantId;
    return this.paymentService.paymentByQrCode(createPaymentDto, restaurantId);
  }
}