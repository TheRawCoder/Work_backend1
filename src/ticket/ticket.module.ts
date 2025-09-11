import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from './ticket.schema';
import { TicketMasterService } from './ticket.service';
import { TicketMasterController } from './ticket.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
  ],
  providers: [TicketMasterService],
  controllers: [TicketMasterController],
})
export class TicketMasterModule { }
