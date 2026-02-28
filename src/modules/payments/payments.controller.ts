import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentByCashDto, CreatePaymentDto } from './dto/create-payment.dto';
import { Protected, Roles } from 'src/common/decorator';
import { Role } from 'src/common/enums/roles.enum';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('/cash')
  @Protected()
  @Roles(Role.ADMIN, Role.CUSTOMER)
  async paymentByCash(@Body() createPaymentDto: CreatePaymentByCashDto) {
    const restaurantId = createPaymentDto.restaurantId;
    return this.paymentsService.paymentByCash(createPaymentDto, restaurantId);
  }

  @Post('/qr-code')
  @Protected()
  @Roles(Role.ADMIN, Role.CUSTOMER)
  async paymentByQrCode(@Body() createPaymentDto: CreatePaymentDto) {
    const restaurantId = createPaymentDto.restaurantId;
    return this.paymentsService.paymentByQrCode(createPaymentDto, restaurantId);
  }
}