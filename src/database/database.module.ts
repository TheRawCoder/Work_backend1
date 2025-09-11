// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    // Load .env globally so ConfigService works everywhere
    ConfigModule.forRoot({ isGlobal: true }),

    // Default connection (single DB: userdb)
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI') || 'mongodb://localhost:27017/userdb',
      }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule { }
