import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export type UploadDataDocument = UploadData & Document;

@Schema({ timestamps: true })
export class UploadData {
    @Prop({ required: true, unique: true })
    ticketRefId: string;

    @Prop()
    description: string;

    @Prop()
    remark: string;

    @Prop()
    category: string;

    @Prop()
    subCategory: string;

    @Prop({
        required: true,
        enum: ['Processing', 'Raised', 'Resolved', 'Rejected'],
        default: 'Raised',
    })
    status: string;
}

export const UploadDataSchema = SchemaFactory.createForClass(UploadData);
UploadDataSchema.index({ description: 1, category: 1, subCategory: 1 });
