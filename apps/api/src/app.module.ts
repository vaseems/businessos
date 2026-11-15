import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { AdminGuard, AuthController, AuthGuard, SessionService } from './auth';
import { UsersController } from './users';
import { DataService } from './data.service';

@Module({
  controllers: [ApiController, AuthController, UsersController],
  providers: [DataService, SessionService, AuthGuard, AdminGuard],
})
export class AppModule {}
