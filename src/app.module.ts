import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TicketMasterModule } from './ticket/ticket.module'; 
import { UploadDataModule } from './upload/upload.module'; 
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TicketMasterModule,   
    UploadDataModule,     
    UsersModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
