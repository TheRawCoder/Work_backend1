import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuthDocument = Auth & Document;

@Schema({ timestamps: true })
export class Auth {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop()
    password: string;

    @Prop({ required: true, unique: true })
    phone: string;

    @Prop()
    age?: number;

    @Prop()
    gender?: string;

    // OTP fields
    @Prop()
    otp?: string;

    @Prop()
    otpExpiry?: Date;
}

export const AuthSchema = SchemaFactory.createForClass(Auth);
