import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { IsInt, IsString, Length } from 'class-validator';
import { BadRequestException } from './common/exceptions/http-exception';
import { Request, Response } from 'express';
import { ResponseToClient } from './common/utils/response.util';


class User {
  @IsInt()
  id: number;

  @IsString()
  @Length(5, 10)
  name: string;
}

@Controller()
export class AppController {
  private readonly Users: User[] = [];
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    // throw new BadRequestException("This is a bad request example", 4004);
    // return this.appService.getHello();
    return this.appService.getHello();
  }

  @Get("ping/:abc")
  getPing(@Param("abc", ParseIntPipe) abc: number): string {
    return `Ping received with value: ${abc}`;
  }

  @Post("users")
  createUser(@Body() user: User): string {
    this.Users.push(user);
    return `User created with ID: ${user.id}`;
  }

}
