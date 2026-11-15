import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { AuthController } from './auth';
import { DataService } from './data.service';

@Module({
  controllers: [ApiController, AuthController],
  providers: [DataService],
})
export class AppModule {}
