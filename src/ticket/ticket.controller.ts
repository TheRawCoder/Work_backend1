import { Controller, Post, Get, Body, UploadedFile, UseInterceptors, Query, Res, } from '@nestjs/common';
import { TicketMasterService } from './ticket.service';
import { Ticket } from './ticket.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Express } from 'express';
import type { Response } from 'express';

@Controller('ticket-master')
export class TicketMasterController {
  constructor(private readonly ticketMasterService: TicketMasterService) { }

  @Post('create')
  async create(@Body() ticketData: any): Promise<Ticket> {
    return this.ticketMasterService.create(ticketData);
  }

  @Post('get')
  async findAll(): Promise<Ticket[]> {
    return this.ticketMasterService.findAll();
  }

  @Post('getByRefId')
  async getByRefId(
    @Body('ticketRefId') ticketRefId: string,
  ): Promise<Ticket | null> {
    return this.ticketMasterService.findByRefId(ticketRefId);
  }

  @Post('updateById')
  async updateById(
    @Body('ticketRefId') ticketRefId: string,
    @Body() updateData: Partial<Ticket>,
  ): Promise<Ticket | null> {
    return this.ticketMasterService.updateByRefId(ticketRefId, updateData);
  }

  @Post('filter')
  async filterTickets(@Body() filters: any): Promise<Ticket[]> {
    return this.ticketMasterService.filterTickets(filters);
  }

  @Get('counts')
  async getCounts() {
    return this.ticketMasterService.getCounts();
  }

}