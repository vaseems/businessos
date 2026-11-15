import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { AdminGuard, AuthController, AuthGuard, SessionService } from './auth';
import { ChatController, ChatService } from './chat';
import { DataService } from './data.service';
import { HistoryController } from './history';
import { SearchController, SearchService } from './search';
import { UsersController } from './users';

@Module({
  controllers: [ApiController, AuthController, UsersController, HistoryController, SearchController, ChatController],
  providers: [DataService, SessionService, AuthGuard, AdminGuard, SearchService, ChatService],
})
export class AppModule {}
