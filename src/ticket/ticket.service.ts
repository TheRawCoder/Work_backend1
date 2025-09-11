import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketDocument } from './ticket.schema';

@Injectable()
export class TicketMasterService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
  ) { }

  // Generate unique 6-digit ticket ID
  private async generateUniqueId(): Promise<string> {
    let id: string;
    let exists: Ticket | null;
    do {
      id = Math.floor(100000 + Math.random() * 900000).toString();
      exists = await this.ticketModel.findOne({ ticketRefId: id }).exec();
    } while (exists);
    return id;
  }

  // Create a new ticket
  async create(ticketData: any): Promise<Ticket> {
    const existing = await this.ticketModel.findOne({
      description: ticketData.description,
      category: ticketData.category,
      subCategory: ticketData.subCategory,
    });

    if (existing) throw new BadRequestException('Duplicate ticket already exists');

    const ticketRefId = await this.generateUniqueId();

    const newTicket = new this.ticketModel({
      ...ticketData,
      ticketRefId,
    });

    return newTicket.save();
  }

  // Fetch all tickets
  async findAll(): Promise<any[]> {
    const tickets = await this.ticketModel.find().lean();
    return tickets.map((ticket, index) => ({ srNo: index + 1, ...ticket }));
  }

  // Fetch by ticketRefId
  async findByRefId(ticketRefId: string): Promise<Ticket | null> {
    return this.ticketModel.findOne({ ticketRefId }).exec();
  }

  // Update ticket by ticketRefId
  async updateByRefId(ticketRefId: string, updateData: any): Promise<Ticket | null> {
    const ticket = await this.ticketModel.findOne({ ticketRefId });
    if (!ticket) return null;

    if (updateData.status) ticket.status = updateData.status;
    if (updateData.remark) ticket.remark = updateData.remark;

    ticket.history.push({
      updatedBy: updateData.updatedBy || 'System',
      updatedAt: new Date(),
      status: updateData.status || ticket.status,
    });

    return ticket.save();
  }

  // Get ticket counts by status
  async getCounts(): Promise<any> {
    const counts = await this.ticketModel.aggregate([
      { $group: { _id: '$status', total: { $sum: 1 } } },
    ]);

    const result: any = { Processing: 0, Raised: 0, Resolved: 0, Rejected: 0 };
    counts.forEach(c => {
      if (c._id && result.hasOwnProperty(c._id)) result[c._id] = c.total;
    });
    return result;
  }

  // Filter tickets
  async filterTickets(filters: any): Promise<Ticket[]> {
    const query: any = {};
    if (filters.ticketRefId) query.ticketRefId = filters.ticketRefId;
    if (filters.status && filters.status.toLowerCase() !== 'all') query.status = filters.status;
    if (filters.category) query.category = filters.category;

    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate); end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    return this.ticketModel.find(query).exec();
  }
}
