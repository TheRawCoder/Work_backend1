import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TicketDocument = Ticket & Document;

@Schema({ timestamps: true })
export class Ticket {

    @Prop({
        default: () => Math.floor(100000 + Math.random() * 900000).toString(),
        unique: true,
    })
    ticketRefId: string;

    @Prop()
    description: string;

    @Prop()
    category: string;

    @Prop()
    subCategory: string;

    @Prop()
    remark: string;

    @Prop({
        required: true,
        enum: ['Processing', 'Raised', 'Resolved', 'Rejected'],
        default: 'Raised',
    })
    status: string;

    @Prop({
        type: [
            {
                updatedBy: { type: String, required: true },
                updatedAt: { type: Date, default: Date.now },
                status: {
                    type: String,
                    enum: ['Processing', 'Raised', 'Resolved', 'Rejected'],
                    required: true
                }
            }
        ],
        default: []
    })
    history: {
        updatedBy: string;
        updatedAt: Date;
        status: string;
    }[];
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
